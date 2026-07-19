begin;

do $preflight$
declare
  v_marker text;
begin
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted during Phase 4C.1 split cutover: %.', v_marker;
  end if;
  if to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('public.start_or_resume_direct_workout_session_atomic(uuid,text,text,text,text,text,jsonb,uuid)') is null
     or to_regprocedure('public.replace_workout_session_snapshot_item_atomic(uuid,uuid,uuid,text,text,text)') is null then
    raise exception 'Phase 4C.1 runtime authorities must exist before terminal reconciliation.';
  end if;
end
$preflight$;

create or replace function private.phase3_reconcile_terminal_session(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_snapshot_version text;
  v_completed_log_count integer;
  v_frozen_at timestamptz;
begin
  select * into v_session
  from public.workout_sessions session
  where session.id = p_session_id
  for update;
  if not found then raise exception 'Workout session not found.' using errcode = 'P0002'; end if;
  if v_session.status not in ('completed', 'skipped') then return; end if;

  select * into strict v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id = v_session.id and snapshot.user_id = v_session.user_id;
  v_snapshot_version := private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);

  select count(*) filter (where log.completed_at is not null)
  into v_completed_log_count
  from public.exercise_logs log
  where log.workout_session_id = v_session.id;

  perform set_config('plaivra.session_snapshot_mutation_id', v_snapshot.id::text, true);

  if v_snapshot_version = 'v1' then
    update public.workout_session_muscle_snapshot_items item
    set state = case
          when v_session.status = 'skipped' or v_completed_log_count = 0 then 'skipped'
          when item.planned_sets is not null and (
            select count(*) filter (where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id = v_session.id
              and (
                (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
                or
                (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
              )
          ) <> item.planned_sets then 'adjusted'
          else 'completed'
        end,
        updated_at = clock_timestamp()
    where item.snapshot_id = v_snapshot.id;
  else
    if exists (
      select 1
      from public.workout_session_muscle_snapshot_items item
      where item.snapshot_id = v_snapshot.id and item.performed_frozen_at is not null
    ) then
      if exists (
        select 1
        from public.workout_session_muscle_snapshot_items item
        where item.snapshot_id = v_snapshot.id
          and (item.performed_total_sets is null or item.performed_qualifying_sets is null or item.performed_frozen_at is null)
      ) then
        raise exception 'V2 performed workload is only partially frozen.' using errcode = '23514';
      end if;
      return;
    end if;

    v_frozen_at := coalesce(v_session.completed_at, v_session.skipped_at, clock_timestamp());
    update public.workout_session_muscle_snapshot_items item
    set performed_total_sets = case when v_session.status = 'skipped' then 0 else (
          select count(*) filter (where log.completed_at is not null)::integer
          from public.exercise_logs log
          where log.workout_session_id = v_session.id
            and (
              (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
              or
              (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
            )
        ) end,
        performed_qualifying_sets = case when v_session.status = 'skipped' then 0 else (
          select count(*) filter (where log.completed_at is not null and log.set_type <> 'warmup')::integer
          from public.exercise_logs log
          where log.workout_session_id = v_session.id
            and (
              (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
              or
              (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
            )
        ) end,
        performed_frozen_at = v_frozen_at,
        state = case
          when v_session.status = 'skipped' or v_completed_log_count = 0 then 'skipped'
          when item.planned_sets is not null and (
            select count(*) filter (where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id = v_session.id
              and (
                (item.source_plan_exercise_id is not null and log.plan_exercise_id = item.source_plan_exercise_id)
                or
                (item.source_plan_exercise_id is null and log.plan_exercise_id is null and log.exercise_order = item.item_order)
              )
          ) <> item.planned_sets then 'adjusted'
          else 'completed'
        end,
        updated_at = clock_timestamp()
    where item.snapshot_id = v_snapshot.id;
  end if;

  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot.id,
    case
      when v_session.status = 'skipped' then 'session_skipped'
      when v_completed_log_count = 0 then 'completed_without_performed_logs'
    end
  );
end
$function$;

revoke all on function private.workout_set_type(text,text) from public, anon, authenticated;
revoke all on function private.assert_workout_session_muscle_snapshot_supported(uuid) from public, anon, authenticated;
revoke all on function private.freeze_workout_session_muscle_snapshot_v2(uuid,text) from public, anon, authenticated;

do $postconditions$
declare
  v_marker text;
begin
  select migration_version into v_marker
  from public.release_schema_compatibility
  where singleton;
  if v_marker not in ('20260711014500', '20260717051011') then
    raise exception 'Compatibility marker drifted after Phase 4C.1 runtime cutover: %.', v_marker;
  end if;
  if to_regprocedure('private.phase3_reconcile_terminal_session(uuid)') is null
     or to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.freeze_workout_session_muscle_snapshot_v2(uuid,text)') is null then
    raise exception 'Phase 4C.1 terminal/version authorities are incomplete.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshots
    where snapshot_schema_version = 'workout_session_muscle_snapshot_v2'
  ) then
    raise exception 'The runtime cutover migrations must not create V2 session snapshots.';
  end if;
  if exists (
    select 1 from public.workout_session_muscle_snapshot_items
    where performed_total_sets is not null
       or performed_qualifying_sets is not null
       or performed_frozen_at is not null
  ) then
    raise exception 'Historical snapshot items were rewritten during the runtime cutover.';
  end if;
end
$postconditions$;

commit;
