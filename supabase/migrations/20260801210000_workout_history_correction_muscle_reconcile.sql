begin;

do $preflight$
begin
  if to_regclass('public.workout_session_timeline_events') is null
     or to_regclass('public.workout_session_muscle_snapshots') is null
     or to_regclass('public.workout_session_muscle_snapshot_items') is null
     or to_regprocedure('private.assert_workout_session_muscle_snapshot_supported(uuid)') is null
     or to_regprocedure('private.phase3_refresh_snapshot_completeness(uuid,text)') is null then
    raise exception 'Workout History muscle reconciliation prerequisites are missing.';
  end if;
end
$preflight$;

create or replace function private.reconcile_corrected_workout_session_muscle_snapshot(
  p_session_id uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_session public.workout_sessions%rowtype;
  v_snapshot public.workout_session_muscle_snapshots%rowtype;
  v_snapshot_version text;
  v_completed_log_count integer;
  v_refrozen_at timestamptz:=clock_timestamp();
begin
  select * into v_session
  from public.workout_sessions session
  where session.id=p_session_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode='P0002';
  end if;
  if v_session.status::text not in ('completed','cancelled') then
    raise exception 'Only a terminal performed session may be reconciled.' using errcode='23514';
  end if;

  select * into v_snapshot
  from public.workout_session_muscle_snapshots snapshot
  where snapshot.workout_session_id=v_session.id
    and snapshot.user_id=v_session.user_id
  for update;
  if not found then
    -- Legacy terminal sessions without a frozen muscle graph remain correctable,
    -- but do not gain invented historical mappings.
    return;
  end if;

  v_snapshot_version:=private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  select count(*) filter(where log.completed_at is not null)::integer
  into v_completed_log_count
  from public.exercise_logs log
  where log.workout_session_id=v_session.id;

  perform set_config('plaivra.session_snapshot_mutation_id',v_snapshot.id::text,true);

  if v_snapshot_version='v1' then
    update public.workout_session_muscle_snapshot_items item
    set state=case
          when coalesce((
            select count(*) filter(where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id=v_session.id
              and (
                (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
                or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
                or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                    and log.exercise_order=item.item_order)
              )
          ),0)=0 then 'skipped'
          when item.planned_sets is not null and (
            select count(*) filter(where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id=v_session.id
              and (
                (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
                or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
                or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                    and log.exercise_order=item.item_order)
              )
          )<>item.planned_sets then 'adjusted'
          else 'completed'
        end,
        updated_at=v_refrozen_at
    where item.snapshot_id=v_snapshot.id;
  else
    update public.workout_session_muscle_snapshot_items item
    set performed_total_sets=coalesce((
          select count(*) filter(where log.completed_at is not null)::integer
          from public.exercise_logs log
          where log.workout_session_id=v_session.id
            and (
              (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
              or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
              or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                  and log.exercise_order=item.item_order)
            )
        ),0),
        performed_qualifying_sets=coalesce((
          select count(*) filter(
            where log.completed_at is not null
              and coalesce(log.set_type,'normal')<>'warmup'
          )::integer
          from public.exercise_logs log
          where log.workout_session_id=v_session.id
            and (
              (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
              or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
              or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                  and log.exercise_order=item.item_order)
            )
        ),0),
        performed_frozen_at=v_refrozen_at,
        state=case
          when coalesce((
            select count(*) filter(where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id=v_session.id
              and (
                (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
                or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
                or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                    and log.exercise_order=item.item_order)
              )
          ),0)=0 then 'skipped'
          when item.planned_sets is not null and (
            select count(*) filter(where log.completed_at is not null)::integer
            from public.exercise_logs log
            where log.workout_session_id=v_session.id
              and (
                (item.source_plan_activity_id is not null and log.plan_activity_id=item.source_plan_activity_id)
                or (item.source_plan_exercise_id is not null and log.plan_exercise_id=item.source_plan_exercise_id)
                or (item.source_plan_activity_id is null and item.source_plan_exercise_id is null
                    and log.exercise_order=item.item_order)
              )
          )<>item.planned_sets then 'adjusted'
          else 'completed'
        end,
        updated_at=v_refrozen_at
    where item.snapshot_id=v_snapshot.id;
  end if;

  perform private.assert_workout_session_muscle_snapshot_supported(v_snapshot.id);
  perform private.phase3_refresh_snapshot_completeness(
    v_snapshot.id,
    case when v_completed_log_count=0 then 'completed_without_performed_logs' end
  );
end;
$function$;

create or replace function private.reconcile_workout_history_correction_muscle_trigger()
returns trigger
language plpgsql
security definer
set search_path=''
as $function$
begin
  if new.event_type='session_corrected'
     and coalesce((new.payload->>'performance_changed')::boolean,false) then
    perform private.reconcile_corrected_workout_session_muscle_snapshot(
      new.workout_session_id
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists workout_history_correction_muscle_reconcile
  on public.workout_session_timeline_events;
create trigger workout_history_correction_muscle_reconcile
after insert on public.workout_session_timeline_events
for each row
when (new.event_type='session_corrected')
execute function private.reconcile_workout_history_correction_muscle_trigger();

revoke all on function private.reconcile_corrected_workout_session_muscle_snapshot(uuid)
  from public,anon,authenticated,service_role;
revoke all on function private.reconcile_workout_history_correction_muscle_trigger()
  from public,anon,authenticated,service_role;

do $postflight$
begin
  if to_regprocedure('private.reconcile_corrected_workout_session_muscle_snapshot(uuid)') is null
     or to_regprocedure('private.reconcile_workout_history_correction_muscle_trigger()') is null
     or not exists(
       select 1 from pg_trigger
       where tgname='workout_history_correction_muscle_reconcile'
         and tgrelid='public.workout_session_timeline_events'::regclass
         and not tgisinternal
     ) then
    raise exception 'Workout History correction muscle reconciliation is incomplete.';
  end if;
end
$postflight$;

commit;
