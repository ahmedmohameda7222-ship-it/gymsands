-- Plaivra Train production preflight (read-only)
--
-- Run after the full migration chain has been staged, before applying the Train
-- integrity migration to production. This script never changes data. Every row
-- requires owner-by-owner review; repair data through an approved, backed-up,
-- separately reviewed migration or operational runbook. Do not bulk-delete.

with findings as (
  select
    'multiple_active_plans'::text as issue_type,
    p.user_id::text as user_id,
    null::text as entity_id,
    jsonb_build_object('plan_ids', jsonb_agg(p.id order by p.id), 'count', count(*)) as details,
    'Choose the intended active plan with the account owner; deactivate the others without deleting history.'::text as review_action
  from public.user_workout_plans p
  where p.is_active = true and p.archived_at is null
  group by p.user_id
  having count(*) > 1

  union all

  select
    'active_default_mismatch', p.user_id::text, p.id::text,
    jsonb_build_object('is_active', p.is_active, 'is_default', p.is_default, 'archived_at', p.archived_at),
    'Confirm the intended schedule-controlling plan, then align active/default flags in a reviewed repair.'
  from public.user_workout_plans p
  where p.is_active is distinct from p.is_default

  union all

  select
    'active_archived_plan', p.user_id::text, p.id::text,
    jsonb_build_object('is_active', p.is_active, 'is_default', p.is_default, 'archived_at', p.archived_at),
    'Preserve the plan and history; clear schedule-control flags or restore the plan only after owner review.'
  from public.user_workout_plans p
  where p.archived_at is not null and (p.is_active = true or p.is_default = true)

  union all

  select
    'duplicate_open_session', ws.user_id::text, ws.plan_day_id::text,
    jsonb_build_object('session_ids', jsonb_agg(ws.id order by ws.started_at, ws.id), 'count', count(*)),
    'Determine the real in-progress session with the owner; preserve its logs and close the duplicate through a reviewed repair.'
  from public.workout_sessions ws
  where ws.status = 'started' and ws.plan_day_id is not null
  group by ws.user_id, ws.plan_day_id
  having count(*) > 1

  union all

  select
    'duplicate_plan_set_identity', ws.user_id::text, l.workout_session_id::text,
    jsonb_build_object(
      'plan_exercise_id', l.plan_exercise_id,
      'set_number', l.set_number,
      'log_ids', jsonb_agg(l.id order by l.created_at, l.id),
      'count', count(*)
    ),
    'Compare the duplicate performed values; retain the owner-confirmed set and preserve audit evidence before consolidation.'
  from public.exercise_logs l
  join public.workout_sessions ws on ws.id = l.workout_session_id
  where l.plan_exercise_id is not null
  group by ws.user_id, l.workout_session_id, l.plan_exercise_id, l.set_number
  having count(*) > 1

  union all

  select
    'duplicate_legacy_set_identity', ws.user_id::text, l.workout_session_id::text,
    jsonb_build_object(
      'exercise_order', l.exercise_order,
      'set_number', l.set_number,
      'log_ids', jsonb_agg(l.id order by l.created_at, l.id),
      'count', count(*)
    ),
    'Compare the duplicate legacy performed values; retain the owner-confirmed set and preserve audit evidence before consolidation.'
  from public.exercise_logs l
  join public.workout_sessions ws on ws.id = l.workout_session_id
  where l.plan_exercise_id is null and l.exercise_order is not null
  group by ws.user_id, l.workout_session_id, l.exercise_order, l.set_number
  having count(*) > 1

  union all

  select
    'performed_session_plan_ownership_mismatch', ws.user_id::text, ws.id::text,
    jsonb_build_object('plan_id', ws.plan_id, 'plan_owner', p.user_id),
    'Do not relink automatically. Verify the session owner and source plan from audit/history evidence.'
  from public.workout_sessions ws
  left join public.user_workout_plans p on p.id = ws.plan_id
  where ws.plan_id is not null and (p.id is null or p.user_id <> ws.user_id)

  union all

  select
    'performed_session_day_mismatch', ws.user_id::text, ws.id::text,
    jsonb_build_object('plan_id', ws.plan_id, 'plan_day_id', ws.plan_day_id, 'day_plan_id', d.plan_id),
    'Do not relink automatically. Verify the performed session snapshot and its plan day from owner history.'
  from public.workout_sessions ws
  left join public.user_workout_plan_days d on d.id = ws.plan_day_id
  where ws.plan_day_id is not null and (d.id is null or d.plan_id is distinct from ws.plan_id)

  union all

  select
    'scheduled_session_reference_mismatch', s.user_id::text, s.id::text,
    jsonb_build_object(
      'plan_id', s.user_workout_plan_id,
      'plan_owner', p.user_id,
      'plan_day_id', s.plan_day_id,
      'day_plan_id', d.plan_id
    ),
    'Review the owning plan/day and schedule source; preserve terminal history and repair only with explicit evidence.'
  from public.user_workout_sessions s
  left join public.user_workout_plans p on p.id = s.user_workout_plan_id
  left join public.user_workout_plan_days d on d.id = s.plan_day_id
  where p.id is null
     or p.user_id <> s.user_id
     or (s.plan_day_id is not null and (d.id is null or d.plan_id <> s.user_workout_plan_id))

  union all

  select
    'invalid_performed_schedule_link', ws.user_id::text, ws.id::text,
    jsonb_build_object(
      'scheduled_session_id', ws.scheduled_session_id,
      'performed_plan_id', ws.plan_id,
      'scheduled_plan_id', s.user_workout_plan_id,
      'performed_day_id', ws.plan_day_id,
      'scheduled_day_id', s.plan_day_id
    ),
    'Verify both session records and repair the link only when owner, plan, and day identities all agree.'
  from public.workout_sessions ws
  left join public.user_workout_sessions s on s.id = ws.scheduled_session_id
  where ws.scheduled_session_id is not null
    and (
      s.id is null
      or s.user_id <> ws.user_id
      or s.user_workout_plan_id is distinct from ws.plan_id
      or s.plan_day_id is distinct from ws.plan_day_id
    )

  union all

  select
    'scheduled_row_has_history_markers', s.user_id::text, s.id::text,
    jsonb_build_object(
      'plan_id', s.user_workout_plan_id,
      'scheduled_date', s.scheduled_date,
      'status', s.status,
      'started_at', s.started_at,
      'completed_at', s.completed_at,
      'skipped_at', s.skipped_at,
      'performed_links', (select count(*) from public.workout_sessions ws where ws.scheduled_session_id = s.id),
      'scheduled_exercise_logs', (select count(*) from public.user_exercise_logs l where l.user_workout_session_id = s.id)
    ),
    'Do not delete or regenerate around this row. Determine its true lifecycle state from owner history, then repair it explicitly.'
  from public.user_workout_sessions s
  where s.status = 'scheduled'
    and (
      s.started_at is not null
      or s.completed_at is not null
      or s.skipped_at is not null
      or exists (select 1 from public.workout_sessions ws where ws.scheduled_session_id = s.id)
      or exists (select 1 from public.user_exercise_logs l where l.user_workout_session_id = s.id)
    )

  union all

  select
    'plan_history_blocks_delete', p.user_id::text, p.id::text,
    jsonb_build_object(
      'performed_sessions', (select count(*) from public.workout_sessions ws where ws.plan_id = p.id),
      'started_schedules', (select count(*) from public.user_workout_sessions s where s.user_workout_plan_id = p.id and s.status = 'started'),
      'completed_schedules', (select count(*) from public.user_workout_sessions s where s.user_workout_plan_id = p.id and s.status = 'completed'),
      'skipped_schedules', (select count(*) from public.user_workout_sessions s where s.user_workout_plan_id = p.id and s.status = 'skipped'),
      'performed_set_logs', (
        select count(*)
        from public.exercise_logs l
        join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
        join public.user_workout_plan_days d on d.id = e.plan_day_id
        where d.plan_id = p.id
      ),
      'scheduled_exercise_logs', (
        select count(*)
        from public.user_exercise_logs l
        join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
        join public.user_workout_plan_days d on d.id = e.plan_day_id
        where d.plan_id = p.id
      )
    ),
    'Archive this plan; permanent deletion is not allowed while any history or performed log remains.'
  from public.user_workout_plans p
  where exists (select 1 from public.workout_sessions ws where ws.plan_id = p.id)
     or exists (select 1 from public.user_workout_sessions s where s.user_workout_plan_id = p.id and s.status in ('started','completed','skipped'))
     or exists (
       select 1 from public.exercise_logs l
       join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
       join public.user_workout_plan_days d on d.id = e.plan_day_id
       where d.plan_id = p.id
     )
     or exists (
       select 1 from public.user_exercise_logs l
       join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
       join public.user_workout_plan_days d on d.id = e.plan_day_id
       where d.plan_id = p.id
     )

  union all

  select
    'orphan_plan_day', null::text, d.id::text,
    jsonb_build_object('plan_id', d.plan_id),
    'Recover or relink only from verified backup/audit evidence; never delete solely because the parent is missing.'
  from public.user_workout_plan_days d
  left join public.user_workout_plans p on p.id = d.plan_id
  where p.id is null

  union all

  select
    'orphan_plan_exercise', null::text, e.id::text,
    jsonb_build_object('plan_day_id', e.plan_day_id),
    'Recover or relink only from verified backup/audit evidence; never delete solely because the parent is missing.'
  from public.user_workout_plan_exercises e
  left join public.user_workout_plan_days d on d.id = e.plan_day_id
  where d.id is null
)
select issue_type, user_id, entity_id, details, review_action
from findings
order by issue_type, user_id nulls last, entity_id nulls last;
