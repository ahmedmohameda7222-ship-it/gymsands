begin;

create or replace function public.get_workout_history_filter_options_v1(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_statuses text[],
  p_search text,
  p_progress_only boolean
)
returns table(
  option_kind text,
  option_value text,
  option_label text,
  degraded boolean
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  return query
  with roots as materialized (
    select *
    from private.workout_history_filtered_roots_v1(
      p_user_id,p_from,p_to,p_statuses,p_search,
      array[]::text[],array[]::text[],array[]::text[],array[]::uuid[],
      p_progress_only
    )
  ),
  performed_roots as materialized (
    select root.root_id
    from roots root
    where root.source_kind='performed'
  ),
  scheduled_roots as materialized (
    select root.root_id
    from roots root
    where root.source_kind='scheduled_fallback'
  ),
  options as (
    select distinct
      'workout_type'::text as option_kind,
      session.workout_category::text as option_value,
      initcap(replace(replace(session.workout_category,'_',' '),'-',' '))::text as option_label,
      false as degraded
    from performed_roots root
    join public.workout_sessions session on session.id=root.root_id
    where nullif(btrim(coalesce(session.workout_category,'')),'') is not null

    union all

    select distinct
      'plan'::text,
      plan.id::text,
      plan.name::text,
      false
    from (
      select session.plan_id
      from performed_roots root
      join public.workout_sessions session on session.id=root.root_id
      where session.plan_id is not null
      union
      select scheduled.user_workout_plan_id
      from scheduled_roots root
      join public.user_workout_sessions scheduled on scheduled.id=root.root_id
    ) selected_plan
    join public.user_workout_plans plan
      on plan.id=selected_plan.plan_id and plan.user_id=p_user_id

    union all

    select distinct
      'exercise'::text,
      identity.option_value,
      identity.option_label,
      identity.degraded
    from performed_roots root
    join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id=root.root_id and snapshot.user_id=p_user_id
    join public.workout_session_muscle_snapshot_items item
      on item.snapshot_id=snapshot.id and item.user_id=p_user_id
    cross join lateral (
      select
        case
          when coalesce(item.actual_provider,item.planned_provider) is not null
            and coalesce(item.actual_provider_activity_id,item.planned_provider_activity_id) is not null
            then 'provider:'||coalesce(item.actual_provider,item.planned_provider)||':'||
              coalesce(item.actual_provider_activity_id,item.planned_provider_activity_id)
          when coalesce(item.actual_global_exercise_id,item.planned_global_exercise_id) is not null
            then 'global:'||coalesce(item.actual_global_exercise_id,item.planned_global_exercise_id)::text
          when coalesce(item.actual_custom_exercise_id,item.planned_custom_exercise_id) is not null
            then 'custom:'||coalesce(item.actual_custom_exercise_id,item.planned_custom_exercise_id)::text
          when item.source_plan_activity_id is not null
            then 'plan_activity:'||item.source_plan_activity_id::text
          when item.source_plan_exercise_id is not null
            then 'plan_exercise:'||item.source_plan_exercise_id::text
          else 'name:'||lower(regexp_replace(
            btrim(coalesce(item.actual_name_snapshot,item.activity_name_snapshot,'')),
            '[^[:alnum:]]+',' ','g'
          ))
        end as option_value,
        coalesce(item.actual_name_snapshot,item.activity_name_snapshot,'Workout exercise')::text
          as option_label,
        coalesce(
          item.actual_provider,item.planned_provider,
          item.actual_global_exercise_id::text,item.planned_global_exercise_id::text,
          item.actual_custom_exercise_id::text,item.planned_custom_exercise_id::text,
          item.source_plan_activity_id::text,item.source_plan_exercise_id::text
        ) is null as degraded
    ) identity
    where nullif(btrim(identity.option_value),'') is not null

    union all

    select distinct
      'muscle'::text,
      entry.muscle_id::text,
      initcap(replace(replace(entry.muscle_id,'_',' '),'.',' '))::text,
      false
    from performed_roots root
    join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id=root.root_id and snapshot.user_id=p_user_id
    join public.workout_session_muscle_snapshot_items item
      on item.snapshot_id=snapshot.id and item.user_id=p_user_id
    join public.exercise_muscle_mapping_entries entry
      on entry.mapping_set_id=coalesce(item.actual_mapping_set_id,item.planned_mapping_set_id)

    union all

    select distinct
      'muscle'::text,
      coalesce(custom_entry->>'muscleId',custom_entry->>'muscle_id')::text,
      initcap(replace(replace(
        coalesce(custom_entry->>'muscleId',custom_entry->>'muscle_id'),
        '_',' '
      ),'.',' '))::text,
      false
    from performed_roots root
    join public.workout_session_muscle_snapshots snapshot
      on snapshot.workout_session_id=root.root_id and snapshot.user_id=p_user_id
    join public.workout_session_muscle_snapshot_items item
      on item.snapshot_id=snapshot.id and item.user_id=p_user_id
    cross join lateral jsonb_array_elements(
      case
        when jsonb_typeof(coalesce(item.actual_custom_mapping_entries,item.planned_custom_mapping_entries))='array'
          then coalesce(item.actual_custom_mapping_entries,item.planned_custom_mapping_entries)
        else '[]'::jsonb
      end
    ) custom_entry
    where nullif(btrim(coalesce(custom_entry->>'muscleId',custom_entry->>'muscle_id','')),'') is not null
  )
  select distinct on (options.option_kind,options.option_value)
    options.option_kind,
    options.option_value,
    options.option_label,
    options.degraded
  from options
  where nullif(btrim(coalesce(options.option_value,'')),'') is not null
    and nullif(btrim(coalesce(options.option_label,'')),'') is not null
  order by options.option_kind,options.option_value,options.degraded,options.option_label;
end;
$function$;

revoke all on function public.get_workout_history_filter_options_v1(
  uuid,timestamptz,timestamptz,text[],text,boolean
) from public,anon;
grant execute on function public.get_workout_history_filter_options_v1(
  uuid,timestamptz,timestamptz,text[],text,boolean
) to authenticated,service_role;

do $postflight$
begin
  if to_regprocedure(
    'public.get_workout_history_filter_options_v1(uuid,timestamptz,timestamptz,text[],text,boolean)'
  ) is null then
    raise exception 'Workout History filter option authority is missing.';
  end if;
  if has_function_privilege(
    'anon',
    'public.get_workout_history_filter_options_v1(uuid,timestamptz,timestamptz,text[],text,boolean)',
    'execute'
  ) then
    raise exception 'Anonymous role can execute Workout History filter options.';
  end if;
end
$postflight$;

notify pgrst, 'reload schema';

commit;
