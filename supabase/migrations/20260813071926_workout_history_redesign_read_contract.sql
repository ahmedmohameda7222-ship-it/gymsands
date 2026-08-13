begin;

-- First-page period context intentionally excludes Personal Record counts.
-- Those counts are projected by the shared Manual + Verified PR authority in
-- application code, where lineage and previous-comparable semantics exist.
create or replace function public.get_workout_history_period_context_v2(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_statuses text[],
  p_search text,
  p_workout_types text[],
  p_muscle_ids text[],
  p_exercise_ids text[],
  p_plan_ids uuid[],
  p_progress_only boolean
)
returns table(
  eligible_workout_count bigint,
  trusted_duration_minutes bigint,
  completed_set_count bigint,
  reliable_volume numeric,
  verified_record_count bigint
)
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  return query
  with roots as materialized (
    select * from private.workout_history_filtered_roots_v1(
      p_user_id,p_from,p_to,p_statuses,p_search,p_workout_types,p_muscle_ids,
      p_exercise_ids,p_plan_ids,p_progress_only
    )
  )
  select
    count(*)::bigint,
    case when count(root.duration_minutes)>0
      then sum(root.duration_minutes)::bigint else null::bigint end,
    case when count(*) filter(where root.source_kind='performed')>0
      then sum(root.completed_set_count) filter(where root.source_kind='performed')::bigint
      else null::bigint end,
    null::numeric,
    null::bigint
  from roots root;
end;
$function$;

-- A cheap, unfiltered existence signal distinguishes onboarding from period,
-- search, and filter empty states without materializing the filtered root set.
create or replace function public.has_any_workout_history_v1(p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path=''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  return exists(
    select 1
    from public.workout_sessions session
    where session.user_id=p_user_id
      and session.deleted_at is null
      and (
        session.status::text in ('completed','skipped')
        or (
          session.status::text='cancelled'
          and (
            exists(select 1 from public.exercise_logs log
              where log.workout_session_id=session.id and log.completed_at is not null)
            or exists(select 1 from public.exercise_log_metric_values metric
              where metric.workout_session_id=session.id)
            or exists(
              select 1
              from public.workout_session_muscle_snapshots snapshot
              join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
              where snapshot.workout_session_id=session.id
                and coalesce(item.performed_total_sets,0)>0
            )
          )
        )
      )
  ) or exists(
    select 1
    from public.user_workout_sessions scheduled
    where scheduled.user_id=p_user_id
      and scheduled.status::text in ('completed','skipped')
      and not exists(
        select 1 from public.workout_sessions canonical
        where canonical.user_id=p_user_id
          and canonical.scheduled_session_id=scheduled.id
      )
  );
end;
$function$;

-- Normalizes only the comparison fields used by the shared Personal Records
-- projector. Raw storage keys remain private implementation details.
create or replace function private.workout_history_pr_context_v1(
  p_context jsonb,
  p_legacy_key text
)
returns jsonb
language sql
immutable
security invoker
set search_path=''
as $function$
  select case
    when jsonb_typeof(p_context)='object' then p_context
    else coalesce(
      (
        select jsonb_object_agg(token.key, token.value)
        from (
          select
            split_part(part,':',1) as key,
            case
              when substring(part from position(':' in part)+1) ~ '^-?[0-9]+([.][0-9]+)?$'
                then to_jsonb(substring(part from position(':' in part)+1)::numeric)
              else to_jsonb(substring(part from position(':' in part)+1))
            end as value
          from regexp_split_to_table(coalesce(p_legacy_key,''),'[|]') part
          where position(':' in part)>1
            and split_part(part,':',1) in ('resistance','side','set','load','assistance')
        ) token
      ),
      '{}'::jsonb
    )
  end;
$function$;

-- Workout History asks the shared Manual + Verified projector to decide which
-- requested session facts are canonical. The database returns each target row
-- and its best earlier comparator, never the member's unbounded PR history.
create or replace function public.get_workout_history_pr_projection_inputs_v1(
  p_user_id uuid,
  p_session_ids uuid[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path=''
as $function$
declare
  v_result jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_session_ids is null
     or cardinality(p_session_ids)>50
     or array_position(p_session_ids,null) is not null then
    raise exception 'Workout History Personal Record scope is invalid.' using errcode='22023';
  end if;
  if cardinality(p_session_ids)=0 then
    return '[]'::jsonb;
  end if;

  with normalized as materialized (
    select
      record.id,
      record.source_kind,
      record.workout_session_id,
      coalesce(subject.identity_value,record.exercise_identity) as identity_value,
      coalesce(record.record_definition_key,record.derived_record_type) as definition_key,
      case
        when coalesce(record.record_definition_key,record.derived_record_type) in (
          'highest_load','same_load_max_repetitions','estimated_one_rep_max','exercise_session_volume'
        )
        and coalesce(record.record_definition_version,record.formula_version,'legacy') in ('1','wh6-v1')
          then 'plaivra-strength-record-v1'
        else concat(
          coalesce(record.record_definition_id,record.record_definition_key,record.derived_record_type,'legacy:'||record.id::text),
          ':',coalesce(record.record_definition_version,record.formula_version,'legacy')
        )
      end as comparable_version,
      coalesce(
        record.comparison_direction,
        case when record.derived_record_type in (
          'highest_load','same_load_max_repetitions','estimated_one_rep_max','exercise_session_volume'
        ) then 'higher_better' end,
        'not_comparable'
      ) as comparison_direction,
      coalesce(
        record.canonical_unit,
        record.record_unit,
        case record.derived_record_type
          when 'highest_load' then 'kg'
          when 'same_load_max_repetitions' then 'repetitions'
          when 'estimated_one_rep_max' then 'kg'
          when 'exercise_session_volume' then 'kg_repetitions'
        end,
        case when record.weight_kg is not null then 'kg'
          when record.reps is not null then 'repetitions' else 'value' end
      ) as canonical_unit,
      private.workout_history_pr_context_v1(
        record.comparison_context,record.comparison_context_key
      ) as comparison_context,
      coalesce(
        record.canonical_value,record.record_value,record.weight_kg,record.reps::numeric
      ) as canonical_value,
      case
        when record.derived_record_type='exercise_session_volume'
          and record.event_semantics_version is null
          and record.exercise_log_id is not null
        then coalesce(
          (
            select max(sibling.completed_at)
            from public.exercise_logs source
            join public.exercise_logs sibling
              on sibling.workout_session_id=source.workout_session_id
             and sibling.exercise_order is not distinct from source.exercise_order
            where source.id=record.exercise_log_id
              and sibling.completed_at is not null
          ),
          record.effective_achieved_at,record.achieved_at,
          record.record_date::timestamp+interval '12 hours'
        )
        else coalesce(
          record.effective_achieved_at,record.achieved_at,
          record.record_date::timestamp+interval '12 hours'
        )
      end as projected_achieved_at,
      (
        to_jsonb(record)-array['user_id','created_at','updated_at','semantic_snapshot','record_key','set_type']::text[]
        || jsonb_build_object(
          'effective_achieved_at',
          case
            when record.derived_record_type='exercise_session_volume'
              and record.event_semantics_version is null
              and record.exercise_log_id is not null
            then coalesce(
              (
                select max(sibling.completed_at)
                from public.exercise_logs source
                join public.exercise_logs sibling
                  on sibling.workout_session_id=source.workout_session_id
                 and sibling.exercise_order is not distinct from source.exercise_order
                where source.id=record.exercise_log_id
                  and sibling.completed_at is not null
              ),
              record.effective_achieved_at,record.achieved_at,
              record.record_date::timestamp+interval '12 hours'
            )
            else record.effective_achieved_at
          end,
          'subject',case when subject.id is null then null else jsonb_build_object(
            'id',subject.id,
            'identity_kind',subject.identity_kind,
            'identity_value',subject.identity_value,
            'name_snapshot',subject.name_snapshot,
            'sport_domain',subject.sport_domain,
            'sport_name_snapshot',subject.sport_name_snapshot,
            'catalog_revision_id',subject.catalog_revision_id,
            'authority_snapshot',subject.authority_snapshot
          ) end
        )
      ) as payload
    from public.personal_records record
    left join public.personal_record_subjects subject
      on subject.id=record.subject_id and subject.user_id=p_user_id
    where record.user_id=p_user_id
  ), targets as materialized (
    select * from normalized target
    where target.source_kind='workout_derived'
      and target.workout_session_id=any(p_session_ids)
      and target.identity_value is not null
      and target.definition_key is not null
      and target.comparison_direction in ('higher_better','lower_better')
      and target.canonical_value is not null
  ), selected as (
    select target.id,target.payload from targets target
    union
    select prior.id,prior.payload
    from targets target
    cross join lateral (
      select candidate.id,candidate.payload
      from normalized candidate
      where candidate.identity_value=target.identity_value
        and candidate.definition_key=target.definition_key
        and candidate.comparable_version=target.comparable_version
        and candidate.comparison_direction=target.comparison_direction
        and candidate.canonical_unit=target.canonical_unit
        and candidate.comparison_context=target.comparison_context
        and candidate.canonical_value is not null
        and (candidate.projected_achieved_at,candidate.id)<(
          target.projected_achieved_at,target.id
        )
      order by
        case when target.comparison_direction='higher_better'
          then candidate.canonical_value end desc nulls last,
        case when target.comparison_direction='lower_better'
          then candidate.canonical_value end asc nulls last,
        candidate.projected_achieved_at asc,
        candidate.id asc
      limit 1
    ) prior
  )
  select coalesce(jsonb_agg(selected.payload order by selected.id),'[]'::jsonb)
  into v_result
  from selected;
  return v_result;
end;
$function$;

revoke all on function public.get_workout_history_period_context_v2(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean
) from public,anon;
revoke all on function public.has_any_workout_history_v1(uuid) from public,anon;
revoke all on function private.workout_history_pr_context_v1(jsonb,text)
  from public,anon,authenticated,service_role;
revoke all on function public.get_workout_history_pr_projection_inputs_v1(uuid,uuid[])
  from public,anon;

grant execute on function public.get_workout_history_period_context_v2(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean
) to authenticated,service_role;
grant execute on function public.has_any_workout_history_v1(uuid)
  to authenticated,service_role;
grant execute on function public.get_workout_history_pr_projection_inputs_v1(uuid,uuid[])
  to authenticated,service_role;

do $postflight$
begin
  if to_regprocedure(
    'public.get_workout_history_period_context_v2(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean)'
  ) is null
  or to_regprocedure('public.has_any_workout_history_v1(uuid)') is null
  or to_regprocedure(
    'public.get_workout_history_pr_projection_inputs_v1(uuid,uuid[])'
  ) is null then
    raise exception 'Workout History redesign read contract is incomplete.';
  end if;
  if has_function_privilege(
    'anon',
    'public.get_workout_history_period_context_v2(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean)',
    'execute'
  )
  or has_function_privilege(
    'anon','public.has_any_workout_history_v1(uuid)','execute'
  )
  or has_function_privilege(
    'anon',
    'public.get_workout_history_pr_projection_inputs_v1(uuid,uuid[])',
    'execute'
  ) then
    raise exception 'Anonymous role can execute Workout History redesign reads.';
  end if;
end;
$postflight$;

commit;
