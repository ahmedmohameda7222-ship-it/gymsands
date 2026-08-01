begin;

create or replace function private.workout_history_filtered_roots_v1(
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
  source_kind text,
  root_id uuid,
  activity_id text,
  effective_at timestamptz,
  duration_minutes integer,
  lifecycle text,
  completed_set_count bigint,
  structured_metric_count bigint,
  actual_snapshot_count bigint,
  planned_set_count bigint
)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_pattern text;
begin
  if p_from is null or p_to is null or p_to<=p_from then
    raise exception 'Workout History period is invalid.' using errcode='22023';
  end if;
  if v_search is not null then
    v_pattern:='%'||replace(replace(replace(v_search,'\','\\'),'%','\%'),'_','\_')||'%';
  end if;

  return query
  with performed as (
    select
      'performed'::text as source_kind,
      session.id as root_id,
      session.id::text as activity_id,
      case session.status::text
        when 'cancelled' then coalesce(session.cancelled_at,session.completed_at,session.started_at)
        when 'skipped' then coalesce(session.skipped_at,session.completed_at,session.started_at)
        else coalesce(session.completed_at,session.started_at)
      end as effective_at,
      session.duration_minutes,
      case
        when session.status::text='skipped' then 'skipped'
        when session.status::text='cancelled' then 'cancelled'
        when counts.planned_set_count is not null
          and counts.planned_set_count>0
          and counts.completed_set_count<counts.planned_set_count then 'partial'
        else 'completed'
      end as lifecycle,
      counts.completed_set_count,
      counts.structured_metric_count,
      counts.actual_snapshot_count,
      counts.planned_set_count,
      session.workout_name,
      session.workout_day_name,
      session.workout_category,
      session.notes,
      session.plan_id,
      counts.meaningful
    from public.workout_sessions session
    cross join lateral (
      select
        (select count(*) from public.exercise_logs log
          where log.workout_session_id=session.id and log.completed_at is not null)::bigint
          as completed_set_count,
        (select count(*) from public.exercise_log_metric_values metric
          where metric.workout_session_id=session.id)::bigint
          as structured_metric_count,
        coalesce((select sum(coalesce(item.performed_total_sets,0))
          from public.workout_session_muscle_snapshots snapshot
          join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
          where snapshot.workout_session_id=session.id),0)::bigint
          as actual_snapshot_count,
        case when exists(
          select 1 from public.workout_session_prescription_sets prescription
          where prescription.workout_session_id=session.id
        ) then (select count(*) from public.workout_session_prescription_sets prescription
          where prescription.workout_session_id=session.id)::bigint else null::bigint end
          as planned_set_count,
        (
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
        ) as meaningful
    ) counts
    where session.user_id=p_user_id
      and session.deleted_at is null
      and session.status::text in ('completed','skipped','cancelled')
  ),
  performed_filtered as (
    select candidate.*
    from performed candidate
    where candidate.effective_at>=p_from and candidate.effective_at<p_to
      and candidate.lifecycle=any(coalesce(p_statuses,array['completed','partial']::text[]))
      and (candidate.lifecycle<>'cancelled' or candidate.meaningful)
      and (not coalesce(p_progress_only,false) or candidate.meaningful)
      and (
        coalesce(array_length(p_workout_types,1),0)=0
        or lower(coalesce(candidate.workout_category,''))=any(
          select lower(value) from unnest(p_workout_types) value
        )
      )
      and (
        coalesce(array_length(p_plan_ids,1),0)=0
        or candidate.plan_id=any(p_plan_ids)
      )
      and (
        v_search is null
        or coalesce(candidate.workout_day_name,candidate.workout_name,'') ilike v_pattern escape '\'
        or coalesce(candidate.workout_category,'') ilike v_pattern escape '\'
        or coalesce(candidate.notes,'') ilike v_pattern escape '\'
        or exists(
          select 1 from public.user_workout_plans plan
          where plan.id=candidate.plan_id and plan.user_id=p_user_id
            and plan.name ilike v_pattern escape '\'
        )
        or exists(
          select 1 from public.exercise_logs log
          where log.workout_session_id=candidate.root_id
            and (log.exercise_name ilike v_pattern escape '\'
                 or coalesce(log.notes,'') ilike v_pattern escape '\')
        )
        or exists(
          select 1 from public.exercise_log_set_details detail
          where detail.workout_session_id=candidate.root_id
            and coalesce(detail.notes,'') ilike v_pattern escape '\'
        )
      )
      and (
        coalesce(array_length(p_exercise_ids,1),0)=0
        or exists(
          select 1
          from public.workout_session_muscle_snapshots snapshot
          join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
          where snapshot.workout_session_id=candidate.root_id
            and (
              ('global:'||coalesce(item.actual_global_exercise_id,item.planned_global_exercise_id)::text)=any(p_exercise_ids)
              or ('custom:'||coalesce(item.actual_custom_exercise_id,item.planned_custom_exercise_id)::text)=any(p_exercise_ids)
              or ('provider:'||coalesce(item.actual_provider,item.planned_provider)||':'||
                  coalesce(item.actual_provider_activity_id,item.planned_provider_activity_id))=any(p_exercise_ids)
              or ('plan_activity:'||item.source_plan_activity_id::text)=any(p_exercise_ids)
              or ('plan_exercise:'||item.source_plan_exercise_id::text)=any(p_exercise_ids)
              or ('name:'||lower(regexp_replace(
                    btrim(coalesce(item.actual_name_snapshot,item.activity_name_snapshot,'')),
                    '[^[:alnum:]]+',' ','g'
                  )))=any(p_exercise_ids)
            )
        )
        or exists(
          select 1 from public.exercise_logs log
          where log.workout_session_id=candidate.root_id
            and (
              ('plan_activity:'||log.plan_activity_id::text)=any(p_exercise_ids)
              or ('plan_exercise:'||log.plan_exercise_id::text)=any(p_exercise_ids)
              or ('name:'||lower(regexp_replace(btrim(log.exercise_name),'[^[:alnum:]]+',' ','g')))=any(p_exercise_ids)
            )
        )
      )
      and (
        coalesce(array_length(p_muscle_ids,1),0)=0
        or exists(
          select 1
          from public.workout_session_muscle_snapshots snapshot
          join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
          join public.exercise_muscle_mapping_entries entry
            on entry.mapping_set_id=coalesce(item.actual_mapping_set_id,item.planned_mapping_set_id)
          where snapshot.workout_session_id=candidate.root_id
            and entry.muscle_id=any(p_muscle_ids)
        )
        or exists(
          select 1
          from public.workout_session_muscle_snapshots snapshot
          join public.workout_session_muscle_snapshot_items item on item.snapshot_id=snapshot.id
          cross join lateral jsonb_array_elements(
            case
              when jsonb_typeof(coalesce(item.actual_custom_mapping_entries,item.planned_custom_mapping_entries))='array'
                then coalesce(item.actual_custom_mapping_entries,item.planned_custom_mapping_entries)
              else '[]'::jsonb
            end
          ) custom_entry
          where snapshot.workout_session_id=candidate.root_id
            and coalesce(custom_entry->>'muscleId',custom_entry->>'muscle_id')=any(p_muscle_ids)
        )
      )
  ),
  scheduled as (
    select
      'scheduled_fallback'::text as source_kind,
      scheduled.id as root_id,
      'scheduled:'||scheduled.id::text as activity_id,
      case scheduled.status::text
        when 'skipped' then coalesce(
          scheduled.skipped_at,scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
        else coalesce(
          scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
      end as effective_at,
      scheduled.duration_minutes,
      scheduled.status::text as lifecycle,
      0::bigint as completed_set_count,
      0::bigint as structured_metric_count,
      0::bigint as actual_snapshot_count,
      null::bigint as planned_set_count
    from public.user_workout_sessions scheduled
    where scheduled.user_id=p_user_id
      and scheduled.status::text in ('completed','skipped')
      and not exists(
        select 1 from public.workout_sessions canonical
        where canonical.user_id=p_user_id
          and canonical.scheduled_session_id=scheduled.id
      )
      and case scheduled.status::text
        when 'skipped' then coalesce(
          scheduled.skipped_at,scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
        else coalesce(
          scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
      end>=p_from
      and case scheduled.status::text
        when 'skipped' then coalesce(
          scheduled.skipped_at,scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
        else coalesce(
          scheduled.completed_at,scheduled.started_at,
          scheduled.scheduled_date::timestamptz
        )
      end<p_to
      and scheduled.status::text=any(coalesce(p_statuses,array['completed','partial']::text[]))
      and not coalesce(p_progress_only,false)
      and coalesce(array_length(p_workout_types,1),0)=0
      and coalesce(array_length(p_muscle_ids,1),0)=0
      and coalesce(array_length(p_exercise_ids,1),0)=0
      and (
        coalesce(array_length(p_plan_ids,1),0)=0
        or scheduled.user_workout_plan_id=any(p_plan_ids)
      )
      and (
        v_search is null
        or scheduled.day_title ilike v_pattern escape '\'
        or coalesce(scheduled.notes,'') ilike v_pattern escape '\'
        or exists(
          select 1 from public.user_workout_plans plan
          where plan.id=scheduled.user_workout_plan_id and plan.user_id=p_user_id
            and plan.name ilike v_pattern escape '\'
        )
        or exists(
          select 1 from public.user_exercise_logs log
          where log.user_workout_session_id=scheduled.id
            and (log.exercise_name ilike v_pattern escape '\'
                 or coalesce(log.notes,'') ilike v_pattern escape '\')
        )
      )
  )
  select
    candidate.source_kind,candidate.root_id,candidate.activity_id,
    candidate.effective_at,candidate.duration_minutes,candidate.lifecycle,
    candidate.completed_set_count,candidate.structured_metric_count,
    candidate.actual_snapshot_count,candidate.planned_set_count
  from performed_filtered candidate
  union all
  select
    candidate.source_kind,candidate.root_id,candidate.activity_id,
    candidate.effective_at,candidate.duration_minutes,candidate.lifecycle,
    candidate.completed_set_count,candidate.structured_metric_count,
    candidate.actual_snapshot_count,candidate.planned_set_count
  from scheduled candidate;
end;
$function$;

create or replace function public.get_workout_history_root_page_v1(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz,
  p_statuses text[],
  p_search text,
  p_workout_types text[],
  p_muscle_ids text[],
  p_exercise_ids text[],
  p_plan_ids uuid[],
  p_progress_only boolean,
  p_sort text,
  p_cursor_effective_at timestamptz,
  p_cursor_activity_id text,
  p_cursor_duration_minutes integer,
  p_limit integer
)
returns table(
  source_kind text,
  root_id uuid,
  activity_id text,
  effective_at timestamptz,
  duration_minutes integer,
  lifecycle text,
  completed_set_count bigint,
  structured_metric_count bigint,
  actual_snapshot_count bigint,
  planned_set_count bigint
)
language plpgsql
stable
security definer
set search_path=''
as $function$
begin
  perform public.assert_workout_actor(p_user_id);
  if p_sort not in ('newest','oldest','longest_duration')
     or p_limit not between 1 and 51
     or (p_cursor_effective_at is null)<>(p_cursor_activity_id is null)
     or (p_cursor_activity_id is not null and (
       char_length(p_cursor_activity_id)>160 or p_cursor_activity_id~'[[:cntrl:]]'
     )) then
    raise exception 'Workout History page request is invalid.' using errcode='22023';
  end if;

  if p_sort='oldest' then
    return query
    select root.*
    from private.workout_history_filtered_roots_v1(
      p_user_id,p_from,p_to,p_statuses,p_search,p_workout_types,p_muscle_ids,
      p_exercise_ids,p_plan_ids,p_progress_only
    ) root
    where p_cursor_effective_at is null
       or (root.effective_at,root.activity_id)>(p_cursor_effective_at,p_cursor_activity_id)
    order by root.effective_at,root.activity_id
    limit p_limit;
  elsif p_sort='longest_duration' then
    return query
    select root.*
    from private.workout_history_filtered_roots_v1(
      p_user_id,p_from,p_to,p_statuses,p_search,p_workout_types,p_muscle_ids,
      p_exercise_ids,p_plan_ids,p_progress_only
    ) root
    where p_cursor_effective_at is null
       or (
         coalesce(root.duration_minutes,-1),root.effective_at,root.activity_id
       )<(
         coalesce(p_cursor_duration_minutes,-1),p_cursor_effective_at,p_cursor_activity_id
       )
    order by coalesce(root.duration_minutes,-1) desc,root.effective_at desc,root.activity_id desc
    limit p_limit;
  else
    return query
    select root.*
    from private.workout_history_filtered_roots_v1(
      p_user_id,p_from,p_to,p_statuses,p_search,p_workout_types,p_muscle_ids,
      p_exercise_ids,p_plan_ids,p_progress_only
    ) root
    where p_cursor_effective_at is null
       or (root.effective_at,root.activity_id)<(p_cursor_effective_at,p_cursor_activity_id)
    order by root.effective_at desc,root.activity_id desc
    limit p_limit;
  end if;
end;
$function$;

create or replace function public.get_workout_history_period_summary_v1(
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
stable
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
    null::numeric as reliable_volume,
    case when count(*) filter(where root.source_kind='performed')>0 then (
      select count(*)::bigint
      from public.current_personal_records record
      join roots performed_root
        on performed_root.source_kind='performed'
       and performed_root.root_id=record.workout_session_id
      where record.user_id=p_user_id and record.source_kind='workout_derived'
    ) else null::bigint end
  from roots root;
end;
$function$;

revoke all on function private.workout_history_filtered_roots_v1(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean
) from public,anon,authenticated,service_role;
revoke all on function public.get_workout_history_root_page_v1(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,
  text,timestamptz,text,integer,integer
) from public,anon;
revoke all on function public.get_workout_history_period_summary_v1(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean
) from public,anon;
grant execute on function public.get_workout_history_root_page_v1(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,
  text,timestamptz,text,integer,integer
) to authenticated,service_role;
grant execute on function public.get_workout_history_period_summary_v1(
  uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean
) to authenticated,service_role;

do $postflight$
begin
  if to_regprocedure(
    'public.get_workout_history_root_page_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,text,timestamptz,text,integer,integer)'
  ) is null
  or to_regprocedure(
    'public.get_workout_history_period_summary_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean)'
  ) is null then
    raise exception 'Workout History keyset read authority is incomplete.';
  end if;
  if has_function_privilege(
    'anon',
    'public.get_workout_history_root_page_v1(uuid,timestamptz,timestamptz,text[],text,text[],text[],text[],uuid[],boolean,text,timestamptz,text,integer,integer)',
    'execute'
  ) then
    raise exception 'Anonymous role can execute Workout History keyset reads.';
  end if;
end
$postflight$;

notify pgrst, 'reload schema';

commit;
