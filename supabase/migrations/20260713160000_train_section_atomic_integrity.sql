begin;

-- Train persistence is intentionally fail-closed. Existing rows are never
-- deleted or silently merged to make these invariants fit.
do $$
declare
  v_count bigint;
begin
  select count(*) into v_count
  from (
    select user_id
    from public.user_workout_plans
    where is_active = true and archived_at is null
    group by user_id
    having count(*) > 1
  ) conflicts;
  if v_count > 0 then
    raise exception 'Train migration blocked: % users have multiple active plans.', v_count
      using errcode = '23505';
  end if;

  select count(*) into v_count
  from (
    select user_id, plan_day_id
    from public.workout_sessions
    where status = 'started' and plan_day_id is not null
    group by user_id, plan_day_id
    having count(*) > 1
  ) conflicts;
  if v_count > 0 then
    raise exception 'Train migration blocked: % plan days have duplicate open sessions.', v_count
      using errcode = '23505';
  end if;

  select count(*) into v_count
  from (
    select workout_session_id, plan_exercise_id, set_number
    from public.exercise_logs
    where plan_exercise_id is not null
    group by workout_session_id, plan_exercise_id, set_number
    having count(*) > 1
  ) conflicts;
  if v_count > 0 then
    raise exception 'Train migration blocked: % stable plan-set keys are duplicated.', v_count
      using errcode = '23505';
  end if;

  select count(*) into v_count
  from (
    select workout_session_id, exercise_order, set_number
    from public.exercise_logs
    where plan_exercise_id is null and exercise_order is not null
    group by workout_session_id, exercise_order, set_number
    having count(*) > 1
  ) conflicts;
  if v_count > 0 then
    raise exception 'Train migration blocked: % legacy order-set keys are duplicated.', v_count
      using errcode = '23505';
  end if;

  select count(*) into v_count
  from public.workout_sessions ws
  left join public.user_workout_plans p on p.id = ws.plan_id
  left join public.user_workout_plan_days d on d.id = ws.plan_day_id
  where (ws.plan_id is not null and (p.id is null or p.user_id <> ws.user_id))
     or (ws.plan_day_id is not null and (d.id is null or d.plan_id is distinct from ws.plan_id));
  if v_count > 0 then
    raise exception 'Train migration blocked: % performed sessions contain cross-owner or mismatched plan references.', v_count
      using errcode = '23514';
  end if;

  select count(*) into v_count
  from public.exercise_logs l
  join public.workout_sessions ws on ws.id = l.workout_session_id
  join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
  join public.user_workout_plan_days d on d.id = e.plan_day_id
  join public.user_workout_plans p on p.id = d.plan_id
  where l.plan_exercise_id is not null
    and (p.user_id <> ws.user_id or ws.plan_day_id is distinct from d.id);
  if v_count > 0 then
    raise exception 'Train migration blocked: % set logs contain cross-owner or mismatched exercise references.', v_count
      using errcode = '23514';
  end if;

  select count(*) into v_count
  from public.user_workout_plans
  where is_active is distinct from is_default
     or (archived_at is not null and (is_active = true or is_default = true));
  if v_count > 0 then
    raise exception 'Train migration blocked: % plans have inconsistent active/default/archive flags.', v_count
      using errcode = '23514';
  end if;

  select count(*) into v_count
  from public.user_workout_sessions s
  left join public.user_workout_plans p on p.id = s.user_workout_plan_id
  left join public.user_workout_plan_days d on d.id = s.plan_day_id
  where p.id is null or p.user_id <> s.user_id
     or (s.plan_day_id is not null and (d.id is null or d.plan_id <> s.user_workout_plan_id));
  if v_count > 0 then
    raise exception 'Train migration blocked: % scheduled sessions have cross-owner or mismatched plan references.', v_count
      using errcode = '23514';
  end if;

  select count(*) into v_count
  from public.workout_sessions ws
  join public.user_workout_sessions s on s.id = ws.scheduled_session_id
  where ws.scheduled_session_id is not null
    and (s.user_id <> ws.user_id or s.user_workout_plan_id is distinct from ws.plan_id or s.plan_day_id is distinct from ws.plan_day_id);
  if v_count > 0 then
    raise exception 'Train migration blocked: % performed sessions have mismatched scheduled-session references.', v_count
      using errcode = '23514';
  end if;

  select count(*) into v_count
  from public.user_exercise_logs l
  join public.user_workout_sessions s on s.id = l.user_workout_session_id
  join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
  join public.user_workout_plan_days d on d.id = e.plan_day_id
  join public.user_workout_plans p on p.id = d.plan_id
  where l.plan_exercise_id is not null
    and (p.user_id <> s.user_id or s.plan_day_id is distinct from d.id);
  if v_count > 0 then
    raise exception 'Train migration blocked: % scheduled exercise logs have cross-owner or mismatched exercise references.', v_count
      using errcode = '23514';
  end if;
end;
$$;

create or replace function public.duplicate_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_source public.user_workout_plans%rowtype;
  v_copy public.user_workout_plans%rowtype;
  v_day public.user_workout_plan_days%rowtype;
  v_new_day_id uuid;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_source
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id
  for share;
  if not found then
    raise exception 'Workout plan not found.' using errcode = 'P0002';
  end if;

  insert into public.user_workout_plans (
    user_id, name, is_active, is_default, source, goal, description,
    chatgpt_source, program_duration_weeks, days_per_week, session_duration_minutes
  ) values (
    p_user_id, v_source.name || ' copy', false, false, v_source.source,
    v_source.goal, v_source.description, v_source.chatgpt_source,
    v_source.program_duration_weeks, v_source.days_per_week, v_source.session_duration_minutes
  ) returning * into v_copy;

  for v_day in
    select * from public.user_workout_plan_days
    where plan_id = p_plan_id and archived_at is null
    order by day_number, id
  loop
    insert into public.user_workout_plan_days (
      plan_id, day_number, day_name, focus, weekday, notes, session_duration_minutes
    ) values (
      v_copy.id, v_day.day_number, v_day.day_name, v_day.focus, v_day.weekday,
      v_day.notes, v_day.session_duration_minutes
    ) returning id into v_new_day_id;

    insert into public.user_workout_plan_exercises (
      plan_day_id, workout_id, source_workout_id, exercise_name, category,
      target_muscle, equipment, sets, reps, rest_seconds, instructions,
      exercise_url, video_url, custom_video_url, sort_order, order_index,
      block_type, weight, tempo, notes
    )
    select
      v_new_day_id, workout_id, source_workout_id, exercise_name, category,
      target_muscle, equipment, sets, reps, rest_seconds, instructions,
      exercise_url, video_url, custom_video_url, sort_order, order_index,
      block_type, weight, tempo, notes
    from public.user_workout_plan_exercises
    where plan_day_id = v_day.id and archived_at is null
    order by sort_order, id;
  end loop;

  return to_jsonb(v_copy);
end;
$$;

create or replace function public.archive_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_replacement_id uuid;
  v_was_active boolean;
begin
  perform public.assert_workout_actor(p_user_id);
  perform 1 from public.user_workout_plans
  where user_id = p_user_id and archived_at is null
  order by id for update;

  select * into v_plan
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Workout plan not found.' using errcode = 'P0002';
  end if;
  if v_plan.archived_at is not null then
    return to_jsonb(v_plan) || jsonb_build_object('already_archived', true);
  end if;
  v_was_active := v_plan.is_active or v_plan.is_default;

  update public.user_workout_plans
  set archived_at = clock_timestamp(), archived_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      is_active = false, is_default = false
  where id = p_plan_id
  returning * into v_plan;

  if v_was_active then
    select id into v_replacement_id
    from public.user_workout_plans
    where user_id = p_user_id and id <> p_plan_id and archived_at is null
    order by updated_at desc, created_at desc, id
    limit 1;
    if v_replacement_id is not null then
      perform public.activate_workout_plan_atomic(p_user_id, v_replacement_id, null);
    end if;
  end if;

  return to_jsonb(v_plan) || jsonb_build_object('already_archived', false, 'replacement_plan_id', v_replacement_id);
end;
$$;

create or replace function public.delete_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_confirmed boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_replacement_id uuid;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_confirmed is distinct from true then
    raise exception 'Explicit confirmation is required to delete a workout plan.' using errcode = '23514';
  end if;

  perform 1 from public.user_workout_plans
  where user_id = p_user_id and archived_at is null
  order by id for update;
  select * into v_plan
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id
  for update;
  if not found then
    return jsonb_build_object('deleted', true, 'already_missing', true);
  end if;

  if exists (select 1 from public.workout_sessions where user_id = p_user_id and plan_id = p_plan_id)
     or exists (select 1 from public.user_workout_sessions where user_id = p_user_id and user_workout_plan_id = p_plan_id) then
    raise exception 'This plan has workout history or scheduled sessions. Archive it instead.' using errcode = '23503';
  end if;

  if v_plan.is_active or v_plan.is_default then
    select id into v_replacement_id
    from public.user_workout_plans
    where user_id = p_user_id and id <> p_plan_id and archived_at is null
    order by updated_at desc, created_at desc, id
    limit 1;
  end if;

  delete from public.user_workout_plans where id = p_plan_id and user_id = p_user_id;
  if v_replacement_id is not null then
    perform public.activate_workout_plan_atomic(p_user_id, v_replacement_id, null);
  end if;
  return jsonb_build_object('deleted', true, 'already_missing', false, 'replacement_plan_id', v_replacement_id);
end;
$$;


-- Removed plan structure remains addressable so completed-session history keeps
-- its stable day and exercise identity.
alter table public.user_workout_plan_days
  add column if not exists archived_at timestamptz;

alter table public.user_workout_plan_exercises
  add column if not exists archived_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'user_workout_plans_active_default_archive_check'
      and conrelid = 'public.user_workout_plans'::regclass
  ) then
    alter table public.user_workout_plans
      add constraint user_workout_plans_active_default_archive_check
      check (is_active = is_default and (archived_at is null or (is_active = false and is_default = false)));
  end if;
end;
$$;

create unique index if not exists user_workout_plans_one_active_uidx
  on public.user_workout_plans (user_id)
  where is_active = true and archived_at is null;

create unique index if not exists workout_sessions_one_open_plan_day_uidx
  on public.workout_sessions (user_id, plan_day_id)
  where status = 'started' and plan_day_id is not null;

create unique index if not exists exercise_logs_plan_set_uidx
  on public.exercise_logs (workout_session_id, plan_exercise_id, set_number)
  where plan_exercise_id is not null;

create unique index if not exists exercise_logs_order_set_uidx
  on public.exercise_logs (workout_session_id, exercise_order, set_number)
  where plan_exercise_id is null and exercise_order is not null;

create index if not exists user_workout_plan_days_active_idx
  on public.user_workout_plan_days (plan_id, day_number)
  where archived_at is null;

create index if not exists user_workout_plan_exercises_active_idx
  on public.user_workout_plan_exercises (plan_day_id, sort_order)
  where archived_at is null;

create or replace function public.enforce_workout_session_reference_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan_user_id uuid;
  v_day_plan_id uuid;
  v_schedule_user_id uuid;
  v_schedule_plan_id uuid;
  v_schedule_day_id uuid;
begin
  if new.plan_id is not null then
    select user_id into v_plan_user_id
    from public.user_workout_plans
    where id = new.plan_id;
    if not found or v_plan_user_id <> new.user_id then
      raise exception 'Workout plan is missing or belongs to another user.' using errcode = '23514';
    end if;
  end if;

  if new.plan_day_id is not null then
    select plan_id into v_day_plan_id
    from public.user_workout_plan_days
    where id = new.plan_day_id;
    if not found or new.plan_id is null or v_day_plan_id <> new.plan_id then
      raise exception 'Workout day does not belong to the referenced plan.' using errcode = '23514';
    end if;
  end if;

  if new.scheduled_session_id is not null then
    select user_id, user_workout_plan_id, plan_day_id
    into v_schedule_user_id, v_schedule_plan_id, v_schedule_day_id
    from public.user_workout_sessions
    where id = new.scheduled_session_id;
    if not found
       or v_schedule_user_id <> new.user_id
       or v_schedule_plan_id is distinct from new.plan_id
       or v_schedule_day_id is distinct from new.plan_day_id then
      raise exception 'Scheduled workout does not match this performed session.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_exercise_log_reference_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session_user_id uuid;
  v_session_day_id uuid;
  v_exercise_day_id uuid;
  v_plan_user_id uuid;
begin
  select user_id, plan_day_id into v_session_user_id, v_session_day_id
  from public.workout_sessions
  where id = new.workout_session_id;
  if not found then
    raise exception 'Workout session is missing.' using errcode = '23503';
  end if;

  if new.plan_exercise_id is not null then
    select e.plan_day_id, p.user_id into v_exercise_day_id, v_plan_user_id
    from public.user_workout_plan_exercises e
    join public.user_workout_plan_days d on d.id = e.plan_day_id
    join public.user_workout_plans p on p.id = d.plan_id
    where e.id = new.plan_exercise_id;
    if not found or v_plan_user_id <> v_session_user_id or v_session_day_id is distinct from v_exercise_day_id then
      raise exception 'Plan exercise does not belong to this workout session.' using errcode = '23514';
    end if;
  elsif new.exercise_order is null then
    raise exception 'A set log requires a plan exercise or stable exercise order.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.enforce_scheduled_workout_reference_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan_user_id uuid;
  v_day_plan_id uuid;
begin
  select user_id into v_plan_user_id
  from public.user_workout_plans
  where id = new.user_workout_plan_id;
  if not found or v_plan_user_id <> new.user_id then
    raise exception 'Scheduled workout plan is missing or belongs to another user.' using errcode = '23514';
  end if;
  if new.plan_day_id is not null then
    select plan_id into v_day_plan_id
    from public.user_workout_plan_days
    where id = new.plan_day_id;
    if not found or v_day_plan_id <> new.user_workout_plan_id then
      raise exception 'Scheduled workout day does not belong to its plan.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_scheduled_exercise_log_reference_integrity()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_session_user_id uuid;
  v_session_day_id uuid;
  v_exercise_day_id uuid;
  v_plan_user_id uuid;
begin
  select user_id, plan_day_id into v_session_user_id, v_session_day_id
  from public.user_workout_sessions
  where id = new.user_workout_session_id;
  if not found then
    raise exception 'Scheduled workout session is missing.' using errcode = '23503';
  end if;
  if new.plan_exercise_id is not null then
    select e.plan_day_id, p.user_id into v_exercise_day_id, v_plan_user_id
    from public.user_workout_plan_exercises e
    join public.user_workout_plan_days d on d.id = e.plan_day_id
    join public.user_workout_plans p on p.id = d.plan_id
    where e.id = new.plan_exercise_id;
    if not found or v_plan_user_id <> v_session_user_id or v_session_day_id is distinct from v_exercise_day_id then
      raise exception 'Scheduled plan exercise does not belong to this workout session.' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists workout_sessions_reference_integrity on public.workout_sessions;
create trigger workout_sessions_reference_integrity
before insert or update of user_id, plan_id, plan_day_id, scheduled_session_id on public.workout_sessions
for each row execute function public.enforce_workout_session_reference_integrity();

drop trigger if exists exercise_logs_reference_integrity on public.exercise_logs;
create trigger exercise_logs_reference_integrity
before insert or update of workout_session_id, plan_exercise_id, exercise_order on public.exercise_logs
for each row execute function public.enforce_exercise_log_reference_integrity();

drop trigger if exists user_workout_sessions_reference_integrity on public.user_workout_sessions;
create trigger user_workout_sessions_reference_integrity
before insert or update of user_id, user_workout_plan_id, plan_day_id on public.user_workout_sessions
for each row execute function public.enforce_scheduled_workout_reference_integrity();

drop trigger if exists user_exercise_logs_reference_integrity on public.user_exercise_logs;
create trigger user_exercise_logs_reference_integrity
before insert or update of user_workout_session_id, plan_exercise_id on public.user_exercise_logs
for each row execute function public.enforce_scheduled_exercise_log_reference_integrity();

revoke all on function public.enforce_workout_session_reference_integrity() from public, anon, authenticated;
revoke all on function public.enforce_exercise_log_reference_integrity() from public, anon, authenticated;
revoke all on function public.enforce_scheduled_workout_reference_integrity() from public, anon, authenticated;
revoke all on function public.enforce_scheduled_exercise_log_reference_integrity() from public, anon, authenticated;

create or replace function public.prevent_workout_history_identity_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'user_workout_plan_exercises' then
    if exists (select 1 from public.exercise_logs where plan_exercise_id = old.id)
       or exists (select 1 from public.user_exercise_logs where plan_exercise_id = old.id) then
      raise exception 'This exercise has workout history. Remove it from the current plan instead of deleting its identity.'
        using errcode = '23503';
    end if;
  elsif tg_table_name = 'user_workout_plan_days' then
    if exists (select 1 from public.workout_sessions where plan_day_id = old.id)
       or exists (select 1 from public.user_workout_sessions where plan_day_id = old.id) then
      raise exception 'This workout day has session history. Archive it instead of deleting its identity.'
        using errcode = '23503';
    end if;
  elsif tg_table_name = 'user_workout_plans' then
    if exists (select 1 from public.workout_sessions where plan_id = old.id)
       or exists (select 1 from public.user_workout_sessions where user_workout_plan_id = old.id) then
      raise exception 'This workout plan has session history. Archive it instead of deleting it.'
        using errcode = '23503';
    end if;
  end if;
  return old;
end;
$$;

drop trigger if exists user_workout_plan_exercises_preserve_history on public.user_workout_plan_exercises;
create trigger user_workout_plan_exercises_preserve_history
before delete on public.user_workout_plan_exercises
for each row execute function public.prevent_workout_history_identity_delete();

drop trigger if exists user_workout_plan_days_preserve_history on public.user_workout_plan_days;
create trigger user_workout_plan_days_preserve_history
before delete on public.user_workout_plan_days
for each row execute function public.prevent_workout_history_identity_delete();

drop trigger if exists user_workout_plans_preserve_history on public.user_workout_plans;
create trigger user_workout_plans_preserve_history
before delete on public.user_workout_plans
for each row execute function public.prevent_workout_history_identity_delete();

revoke all on function public.prevent_workout_history_identity_delete() from public, anon, authenticated;

create or replace function public.assert_workout_actor(p_user_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'User id is required.' using errcode = '23514';
  end if;
  if auth.uid() is null and current_user <> 'service_role' then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Workout data belongs to another user.' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.assert_workout_actor(uuid) from public, anon;
grant execute on function public.assert_workout_actor(uuid) to authenticated, service_role;

create or replace function public.activate_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_day record;
  v_start_date date := current_date;
  v_duration_weeks integer;
  v_day_count integer;
  v_day_offset integer;
  v_week_index integer;
  v_week_base integer;
  v_session_base integer;
begin
  perform public.assert_workout_actor(p_user_id);

  perform 1
  from public.user_workout_plans
  where user_id = p_user_id and archived_at is null
  order by id
  for update;

  select * into v_plan
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id and archived_at is null
  for update;

  if not found then
    raise exception 'Workout plan not found.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_plan.updated_at is distinct from p_expected_updated_at then
    raise exception 'Workout plan changed after it was opened.' using errcode = '40001';
  end if;

  -- Activation owns the future schedule. Retire only unstarted future rows;
  -- performed, started, completed, and skipped history remains untouched.
  delete from public.user_workout_sessions
  where user_id = p_user_id and status = 'scheduled' and scheduled_date >= current_date;

  update public.user_workout_plans
  set is_active = false, is_default = false
  where user_id = p_user_id and id <> p_plan_id and (is_active = true or is_default = true);

  update public.user_workout_plans
  set is_active = true, is_default = true, archived_at = null
  where id = p_plan_id and user_id = p_user_id
  returning * into v_plan;

  select count(*) into v_day_count
  from public.user_workout_plan_days
  where plan_id = p_plan_id and archived_at is null;
  if v_day_count = 0 then
    raise exception 'The active workout plan has no training days.' using errcode = '23514';
  end if;
  v_duration_weeks := greatest(1, least(104, coalesce(v_plan.program_duration_weeks, 1)));
  select coalesce(max(week_index), 0), coalesce(max(session_number), 0)
  into v_week_base, v_session_base
  from public.user_workout_sessions
  where user_id = p_user_id and user_workout_plan_id = p_plan_id;

  for v_day in
    select id, day_number, day_name, weekday
    from public.user_workout_plan_days
    where plan_id = p_plan_id and archived_at is null
    order by day_number, id
  loop
    v_day_offset := case v_day.weekday
      when 'Sunday' then 0 when 'Monday' then 1 when 'Tuesday' then 2
      when 'Wednesday' then 3 when 'Thursday' then 4 when 'Friday' then 5
      when 'Saturday' then 6 else v_day.day_number - 1
    end;
    v_day_offset := mod(v_day_offset - extract(dow from v_start_date)::integer + 7, 7);
    for v_week_index in 1..v_duration_weeks loop
      insert into public.user_workout_sessions (
        user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
        session_number, scheduled_date, day_title, status
      ) values (
        p_user_id, p_plan_id, v_day.id, v_week_base + v_week_index, v_day.day_number,
        v_session_base + (v_week_index - 1) * v_day_count + v_day.day_number,
        v_start_date + ((v_week_index - 1) * 7 + v_day_offset), v_day.day_name, 'scheduled'
      );
    end loop;
  end loop;

  return to_jsonb(v_plan);
end;
$$;

create or replace function public.create_workout_plan_atomic(
  p_user_id uuid,
  p_plan jsonb,
  p_activate boolean default true
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_day record;
  v_exercise jsonb;
  v_day_id uuid;
  v_name text := nullif(btrim(coalesce(p_plan->>'name', '')), '');
  v_source text := coalesce(nullif(p_plan->>'source', ''), 'manual');
  v_day_count integer := 0;
  v_exercise_count integer;
  v_total_exercises integer := 0;
  v_exercise_index integer;
  v_program_duration_weeks integer := coalesce(nullif(p_plan->>'duration_weeks', '')::integer, nullif(p_plan->>'program_duration_weeks', '')::integer);
  v_duration_weeks integer := greatest(1, coalesce(v_program_duration_weeks, 1));
  v_start_date date := nullif(p_plan->>'start_date', '')::date;
  v_week_index integer;
  v_saved_days jsonb;
  v_day_offset integer;
begin
  perform public.assert_workout_actor(p_user_id);
  if v_name is null then
    raise exception 'Plan name is required.' using errcode = '23514';
  end if;
  if v_source not in ('manual', 'chatgpt', 'imported') then
    raise exception 'Workout plan source is invalid.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_plan->'days') <> 'array' or jsonb_array_length(p_plan->'days') = 0 then
    raise exception 'Add at least one training day.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_plan->'days') > 7 then
    raise exception 'A workout plan can contain at most seven training days.' using errcode = '22023';
  end if;
  if v_duration_weeks > 104 then
    raise exception 'Workout plan duration cannot exceed 104 weeks.' using errcode = '22023';
  end if;
  if v_program_duration_weeks is not null and v_program_duration_weeks not between 1 and 104 then
    raise exception 'Workout plan duration must be between 1 and 104 weeks.' using errcode = '22023';
  end if;
  select count(*) into v_exercise_count
  from (
    select value->>'weekday'
    from jsonb_array_elements(p_plan->'days')
    where nullif(value->>'weekday', '') is not null
    group by 1 having count(*) > 1
  ) duplicate_weekdays;
  if v_exercise_count > 0 then
    raise exception 'Each scheduled weekday can appear only once in a workout plan.' using errcode = '23505';
  end if;

  -- Validate the entire nested payload before the first write.
  for v_day in
    select value, ordinality
    from jsonb_array_elements(p_plan->'days') with ordinality as days(value, ordinality)
  loop
    if nullif(btrim(coalesce(v_day.value->>'day_name', '')), '') is null then
      raise exception 'Every training day requires a name.' using errcode = '23514';
    end if;
    if nullif(v_day.value->>'weekday', '') is not null
       and v_day.value->>'weekday' not in ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') then
      raise exception 'Training day weekday is invalid.' using errcode = '23514';
    end if;
    if jsonb_typeof(v_day.value->'exercises') <> 'array' or jsonb_array_length(v_day.value->'exercises') = 0 then
      raise exception 'Every training day requires at least one exercise.' using errcode = '23514';
    end if;
    if jsonb_array_length(v_day.value->'exercises') > 50 then
      raise exception 'A training day can contain at most 50 exercises.' using errcode = '22023';
    end if;
    v_total_exercises := v_total_exercises + jsonb_array_length(v_day.value->'exercises');
    if v_total_exercises > 200 then
      raise exception 'A workout plan can contain at most 200 exercises.' using errcode = '22023';
    end if;
    select count(*) into v_exercise_count
    from jsonb_array_elements(v_day.value->'exercises') exercise
    where nullif(btrim(coalesce(exercise->>'exercise_name', '')), '') is null
       or coalesce(nullif(exercise->>'sets', '')::integer, 1) <= 0
       or coalesce(nullif(exercise->>'rest_seconds', '')::integer, 0) < 0;
    if v_exercise_count > 0 then
      raise exception 'Every exercise requires a valid name, sets, and rest value.' using errcode = '23514';
    end if;
    v_day_count := v_day_count + 1;
  end loop;

  insert into public.user_workout_plans (
    user_id, name, is_active, is_default, source, goal, description,
    chatgpt_source, program_duration_weeks, days_per_week, session_duration_minutes
  ) values (
    p_user_id, v_name, false, false, v_source,
    nullif(btrim(coalesce(p_plan->>'goal', '')), ''),
    nullif(btrim(coalesce(p_plan->>'description', '')), ''),
    coalesce((p_plan->>'chatgpt_source')::boolean, v_source in ('chatgpt', 'imported')),
    v_program_duration_weeks,
    v_day_count,
    nullif(p_plan->>'session_duration_minutes', '')::integer
  ) returning * into v_plan;

  for v_day in
    select value, ordinality
    from jsonb_array_elements(p_plan->'days') with ordinality as days(value, ordinality)
  loop
    insert into public.user_workout_plan_days (
      plan_id, day_number, day_name, focus, weekday, notes, session_duration_minutes
    ) values (
      v_plan.id, v_day.ordinality,
      btrim(v_day.value->>'day_name'), nullif(v_day.value->>'focus', ''), nullif(v_day.value->>'weekday', ''),
      nullif(btrim(coalesce(v_day.value->>'notes', '')), ''),
      nullif(v_day.value->>'session_duration_minutes', '')::integer
    ) returning id into v_day_id;

    v_exercise_index := 0;
    for v_exercise in select value from jsonb_array_elements(v_day.value->'exercises')
    loop
      v_exercise_index := v_exercise_index + 1;
      insert into public.user_workout_plan_exercises (
        plan_day_id, workout_id, source_workout_id, exercise_name, category,
        target_muscle, equipment, sets, reps, rest_seconds, instructions,
        exercise_url, video_url, custom_video_url, sort_order, order_index,
        block_type, weight, tempo, notes
      ) values (
        v_day_id, null, nullif(v_exercise->>'source_workout_id', ''),
        btrim(v_exercise->>'exercise_name'), nullif(v_exercise->>'category', ''),
        nullif(v_exercise->>'target_muscle', ''), nullif(v_exercise->>'equipment', ''),
        coalesce(nullif(v_exercise->>'sets', '')::integer, 3),
        coalesce(nullif(v_exercise->>'reps', ''), '8-12'),
        coalesce(nullif(v_exercise->>'rest_seconds', '')::integer, 75),
        nullif(v_exercise->>'instructions', ''), nullif(v_exercise->>'exercise_url', ''),
        nullif(v_exercise->>'video_url', ''), nullif(v_exercise->>'custom_video_url', ''),
        v_exercise_index, v_exercise_index,
        nullif(v_exercise->>'block_type', ''), nullif(v_exercise->>'weight', ''),
        nullif(v_exercise->>'tempo', ''), nullif(btrim(coalesce(v_exercise->>'notes', '')), '')
      );
    end loop;

    if p_activate and v_start_date is not null then
      v_day_offset := case v_day.value->>'weekday'
        when 'Sunday' then 0 when 'Monday' then 1 when 'Tuesday' then 2
        when 'Wednesday' then 3 when 'Thursday' then 4 when 'Friday' then 5
        when 'Saturday' then 6
        else v_day.ordinality::integer - 1
      end;
      v_day_offset := mod(v_day_offset - extract(dow from v_start_date)::integer + 7, 7);
      for v_week_index in 1..v_duration_weeks loop
        insert into public.user_workout_sessions (
          user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
          session_number, scheduled_date, day_title, status
        ) values (
          p_user_id, v_plan.id, v_day_id, v_week_index, v_day.ordinality::integer,
          (v_week_index - 1) * v_day_count + v_day.ordinality::integer,
          v_start_date + ((v_week_index - 1) * 7 + v_day_offset),
          btrim(v_day.value->>'day_name'), 'scheduled'
        );
      end loop;
    end if;
  end loop;

  if p_activate then
    perform public.activate_workout_plan_atomic(p_user_id, v_plan.id, null);
    select * into v_plan from public.user_workout_plans where id = v_plan.id;
  end if;

  select coalesce(jsonb_agg(
    to_jsonb(d) || jsonb_build_object(
      'exercises', coalesce((
        select jsonb_agg(to_jsonb(e) order by e.sort_order, e.id)
        from public.user_workout_plan_exercises e
        where e.plan_day_id = d.id and e.archived_at is null
      ), '[]'::jsonb)
    ) order by d.day_number, d.id
  ), '[]'::jsonb)
  into v_saved_days
  from public.user_workout_plan_days d
  where d.plan_id = v_plan.id and d.archived_at is null;

  return to_jsonb(v_plan) || jsonb_build_object('days', v_saved_days);
end;
$$;

create or replace function public.save_workout_plan_day_atomic(
  p_user_id uuid,
  p_day_id uuid,
  p_day jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_day public.user_workout_plan_days%rowtype;
  v_plan public.user_workout_plans%rowtype;
  v_exercise record;
  v_exercise_id uuid;
  v_keep_ids uuid[] := '{}'::uuid[];
  v_exercises jsonb;
  v_now timestamptz := clock_timestamp();
  v_duplicate_count integer;
  v_weekday_dow integer;
begin
  perform public.assert_workout_actor(p_user_id);

  select p.* into v_plan
  from public.user_workout_plans p
  join public.user_workout_plan_days d on d.plan_id = p.id
  where d.id = p_day_id and p.user_id = p_user_id and d.archived_at is null and p.archived_at is null
  for update of p;
  if not found then
    raise exception 'Workout day not found.' using errcode = 'P0002';
  end if;
  select * into v_day
  from public.user_workout_plan_days
  where id = p_day_id and plan_id = v_plan.id and archived_at is null
  for update;

  if p_expected_updated_at is not null and v_day.updated_at is distinct from p_expected_updated_at then
    raise exception 'Workout day changed after it was opened.' using errcode = '40001';
  end if;
  if nullif(btrim(coalesce(p_day->>'day_name', '')), '') is null then
    raise exception 'Workout day name is required.' using errcode = '23514';
  end if;
  if nullif(p_day->>'weekday', '') is not null
     and p_day->>'weekday' not in ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday') then
    raise exception 'Workout day weekday is invalid.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_day->'exercises') <> 'array' or jsonb_array_length(p_day->'exercises') = 0 then
    raise exception 'Add at least one exercise before saving this workout day.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_day->'exercises') > 50 then
    raise exception 'A training day can contain at most 50 exercises.' using errcode = '22023';
  end if;
  select count(*) into v_duplicate_count
  from (
    select coalesce(value->>'id', value->>'plan_exercise_id') as stable_id
    from jsonb_array_elements(p_day->'exercises')
    where nullif(coalesce(value->>'id', value->>'plan_exercise_id'), '') is not null
    group by 1 having count(*) > 1
  ) duplicates;
  if v_duplicate_count > 0 then
    raise exception 'Workout day payload contains duplicate exercise identities.' using errcode = '23505';
  end if;

  -- Validate every supplied stable id before mutating any row.
  for v_exercise in
    select value, ordinality
    from jsonb_array_elements(p_day->'exercises') with ordinality as exercises(value, ordinality)
  loop
    if nullif(btrim(coalesce(v_exercise.value->>'exercise_name', '')), '') is null then
      raise exception 'Every exercise requires a name.' using errcode = '23514';
    end if;
    if coalesce(nullif(v_exercise.value->>'sets', '')::integer, 3) <= 0
       or coalesce(nullif(v_exercise.value->>'rest_seconds', '')::integer, 75) < 0 then
      raise exception 'Exercise sets and rest values are invalid.' using errcode = '23514';
    end if;
    if nullif(coalesce(v_exercise.value->>'id', v_exercise.value->>'plan_exercise_id'), '') is not null then
      v_exercise_id := coalesce(v_exercise.value->>'id', v_exercise.value->>'plan_exercise_id')::uuid;
      perform 1 from public.user_workout_plan_exercises
      where id = v_exercise_id and plan_day_id = p_day_id;
      if not found then
        raise exception 'A workout exercise does not belong to this day.' using errcode = '23514';
      end if;
    end if;
  end loop;

  for v_exercise in
    select value, ordinality
    from jsonb_array_elements(p_day->'exercises') with ordinality as exercises(value, ordinality)
  loop
    v_exercise_id := null;
    if nullif(coalesce(v_exercise.value->>'id', v_exercise.value->>'plan_exercise_id'), '') is not null then
      v_exercise_id := coalesce(v_exercise.value->>'id', v_exercise.value->>'plan_exercise_id')::uuid;
      update public.user_workout_plan_exercises
      set workout_id = null,
          source_workout_id = nullif(v_exercise.value->>'source_workout_id', ''),
          exercise_name = btrim(v_exercise.value->>'exercise_name'),
          category = nullif(v_exercise.value->>'category', ''),
          target_muscle = nullif(v_exercise.value->>'target_muscle', ''),
          equipment = nullif(v_exercise.value->>'equipment', ''),
          sets = coalesce(nullif(v_exercise.value->>'sets', '')::integer, 3),
          reps = coalesce(nullif(v_exercise.value->>'reps', ''), '8-12'),
          rest_seconds = coalesce(nullif(v_exercise.value->>'rest_seconds', '')::integer, 75),
          instructions = nullif(v_exercise.value->>'instructions', ''),
          exercise_url = nullif(v_exercise.value->>'exercise_url', ''),
          video_url = nullif(v_exercise.value->>'video_url', ''),
          custom_video_url = nullif(v_exercise.value->>'custom_video_url', ''),
          sort_order = v_exercise.ordinality,
          order_index = v_exercise.ordinality,
          block_type = nullif(v_exercise.value->>'block_type', ''),
          weight = nullif(v_exercise.value->>'weight', ''),
          tempo = nullif(v_exercise.value->>'tempo', ''),
          notes = nullif(btrim(coalesce(v_exercise.value->>'notes', '')), ''),
          archived_at = null
      where id = v_exercise_id and plan_day_id = p_day_id;
    else
      insert into public.user_workout_plan_exercises (
        plan_day_id, workout_id, source_workout_id, exercise_name, category,
        target_muscle, equipment, sets, reps, rest_seconds, instructions,
        exercise_url, video_url, custom_video_url, sort_order, order_index,
        block_type, weight, tempo, notes
      ) values (
        p_day_id, null, nullif(v_exercise.value->>'source_workout_id', ''),
        btrim(v_exercise.value->>'exercise_name'), nullif(v_exercise.value->>'category', ''),
        nullif(v_exercise.value->>'target_muscle', ''), nullif(v_exercise.value->>'equipment', ''),
        coalesce(nullif(v_exercise.value->>'sets', '')::integer, 3),
        coalesce(nullif(v_exercise.value->>'reps', ''), '8-12'),
        coalesce(nullif(v_exercise.value->>'rest_seconds', '')::integer, 75),
        nullif(v_exercise.value->>'instructions', ''), nullif(v_exercise.value->>'exercise_url', ''),
        nullif(v_exercise.value->>'video_url', ''), nullif(v_exercise.value->>'custom_video_url', ''),
        v_exercise.ordinality, v_exercise.ordinality,
        nullif(v_exercise.value->>'block_type', ''), nullif(v_exercise.value->>'weight', ''),
        nullif(v_exercise.value->>'tempo', ''), nullif(btrim(coalesce(v_exercise.value->>'notes', '')), '')
      ) returning id into v_exercise_id;
    end if;
    v_keep_ids := array_append(v_keep_ids, v_exercise_id);
  end loop;

  update public.user_workout_plan_exercises
  set archived_at = v_now
  where plan_day_id = p_day_id and archived_at is null and not (id = any(v_keep_ids));

  update public.user_workout_plan_days
  set day_name = btrim(p_day->>'day_name'),
      focus = case when p_day ? 'focus' then nullif(btrim(coalesce(p_day->>'focus', '')), '') else focus end,
      weekday = nullif(p_day->>'weekday', ''),
      notes = nullif(btrim(coalesce(p_day->>'notes', '')), ''),
      session_duration_minutes = nullif(p_day->>'session_duration_minutes', '')::integer,
      updated_at = v_now
  where id = p_day_id
  returning * into v_day;

  if v_day.weekday is not null then
    v_weekday_dow := case v_day.weekday
      when 'Sunday' then 0 when 'Monday' then 1 when 'Tuesday' then 2
      when 'Wednesday' then 3 when 'Thursday' then 4 when 'Friday' then 5
      when 'Saturday' then 6
    end;
    with bounds as (
      select min(week_index) as min_week, min(scheduled_date) as start_date
      from public.user_workout_sessions
      where user_id = p_user_id and plan_day_id = p_day_id
        and status = 'scheduled' and scheduled_date >= current_date
    )
    update public.user_workout_sessions s
    set day_title = v_day.day_name,
        scheduled_date = bounds.start_date
          + ((s.week_index - bounds.min_week) * 7)
          + mod(v_weekday_dow - extract(dow from bounds.start_date)::integer + 7, 7),
        updated_at = v_now
    from bounds
    where s.user_id = p_user_id and s.plan_day_id = p_day_id
      and s.status = 'scheduled' and s.scheduled_date >= current_date
      and bounds.start_date is not null;
  else
    update public.user_workout_sessions
    set day_title = v_day.day_name, updated_at = v_now
    where user_id = p_user_id and plan_day_id = p_day_id
      and status = 'scheduled' and scheduled_date >= current_date;
  end if;

  select coalesce(jsonb_agg(to_jsonb(e) order by e.sort_order), '[]'::jsonb)
  into v_exercises
  from public.user_workout_plan_exercises e
  where e.plan_day_id = p_day_id and e.archived_at is null;

  return to_jsonb(v_day) || jsonb_build_object('exercises', v_exercises);
end;
$$;

create or replace function public.save_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_plan jsonb,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_day record;
  v_day_id uuid;
  v_keep_day_ids uuid[] := '{}'::uuid[];
  v_now timestamptz := clock_timestamp();
  v_name text := nullif(btrim(coalesce(p_plan->>'name', '')), '');
  v_source text;
  v_duplicate_count integer;
  v_total_exercises integer := 0;
  v_schedule_start date;
  v_schedule_min_week integer;
  v_schedule_max_week integer;
  v_schedule_week integer;
  v_schedule_day_offset integer;
  v_active_day_count integer;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_plan
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id and archived_at is null
  for update;
  if not found then
    raise exception 'Workout plan not found.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_plan.updated_at is distinct from p_expected_updated_at then
    raise exception 'Workout plan changed after it was opened.' using errcode = '40001';
  end if;
  if v_name is null then
    raise exception 'Plan name is required.' using errcode = '23514';
  end if;
  if jsonb_typeof(p_plan->'days') <> 'array' or jsonb_array_length(p_plan->'days') = 0 then
    raise exception 'Add at least one training day.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_plan->'days') > 7 then
    raise exception 'A workout plan can contain at most seven training days.' using errcode = '22023';
  end if;
  if nullif(p_plan->>'program_duration_weeks', '')::integer is not null
     and nullif(p_plan->>'program_duration_weeks', '')::integer not between 1 and 104 then
    raise exception 'Workout plan duration must be between 1 and 104 weeks.' using errcode = '22023';
  end if;
  select count(*) into v_duplicate_count
  from (
    select value->>'weekday'
    from jsonb_array_elements(p_plan->'days')
    where nullif(value->>'weekday', '') is not null
    group by 1 having count(*) > 1
  ) duplicate_weekdays;
  if v_duplicate_count > 0 then
    raise exception 'Each scheduled weekday can appear only once in a workout plan.' using errcode = '23505';
  end if;
  for v_day in select value from jsonb_array_elements(p_plan->'days')
  loop
    if jsonb_typeof(v_day.value->'exercises') <> 'array'
       or jsonb_array_length(v_day.value->'exercises') = 0 then
      raise exception 'Every training day requires at least one exercise.' using errcode = '23514';
    end if;
    if jsonb_array_length(v_day.value->'exercises') > 50 then
      raise exception 'A training day can contain at most 50 exercises.' using errcode = '22023';
    end if;
    v_total_exercises := v_total_exercises + jsonb_array_length(v_day.value->'exercises');
  end loop;
  if v_total_exercises > 200 then
    raise exception 'A workout plan can contain at most 200 exercises.' using errcode = '22023';
  end if;
  select count(*) into v_duplicate_count
  from (
    select value->>'id' as stable_id
    from jsonb_array_elements(p_plan->'days')
    where nullif(value->>'id', '') is not null
    group by 1 having count(*) > 1
  ) duplicates;
  if v_duplicate_count > 0 then
    raise exception 'Workout plan payload contains duplicate day identities.' using errcode = '23505';
  end if;

  select min(scheduled_date), min(week_index), max(week_index)
  into v_schedule_start, v_schedule_min_week, v_schedule_max_week
  from public.user_workout_sessions
  where user_id = p_user_id and user_workout_plan_id = p_plan_id
    and status = 'scheduled' and scheduled_date >= current_date;
  v_source := coalesce(nullif(p_plan->>'source', ''), v_plan.source);
  if v_source not in ('manual', 'chatgpt', 'imported') then
    raise exception 'Workout plan source is invalid.' using errcode = '23514';
  end if;

  -- Validate every supplied day id before changing numbering or content.
  for v_day in
    select value, ordinality
    from jsonb_array_elements(p_plan->'days') with ordinality as days(value, ordinality)
  loop
    if nullif(v_day.value->>'id', '') is not null then
      v_day_id := (v_day.value->>'id')::uuid;
      perform 1 from public.user_workout_plan_days
      where id = v_day_id and plan_id = p_plan_id and archived_at is null;
      if not found then
        raise exception 'A workout day does not belong to this plan.' using errcode = '23514';
      end if;
    end if;
  end loop;

  -- Move every persisted number out of the visible ordinal range first. This
  -- keeps the existing unique(plan_id, day_number) constraint valid while days
  -- are reordered and while removed days retain stable identities.
  with ranked as (
    select id, row_number() over (order by archived_at nulls first, day_number, id) as position
    from public.user_workout_plan_days
    where plan_id = p_plan_id
  )
  update public.user_workout_plan_days d
  set day_number = 1000000 + ranked.position
  from ranked
  where d.id = ranked.id;

  for v_day in
    select value, ordinality
    from jsonb_array_elements(p_plan->'days') with ordinality as days(value, ordinality)
  loop
    v_day_id := null;
    if nullif(v_day.value->>'id', '') is not null then
      v_day_id := (v_day.value->>'id')::uuid;
    else
      insert into public.user_workout_plan_days (
        plan_id, day_number, day_name, focus, weekday, notes, session_duration_minutes
      ) values (
        p_plan_id, v_day.ordinality,
        coalesce(nullif(btrim(v_day.value->>'day_name'), ''), 'Workout day ' || v_day.ordinality),
        nullif(v_day.value->>'focus', ''), nullif(v_day.value->>'weekday', ''),
        nullif(btrim(coalesce(v_day.value->>'notes', '')), ''),
        nullif(v_day.value->>'session_duration_minutes', '')::integer
      ) returning id into v_day_id;
    end if;

    perform public.save_workout_plan_day_atomic(p_user_id, v_day_id, v_day.value, null);
    update public.user_workout_plan_days
    set day_number = v_day.ordinality, archived_at = null
    where id = v_day_id;
    v_keep_day_ids := array_append(v_keep_day_ids, v_day_id);
  end loop;

  update public.user_workout_plan_exercises e
  set archived_at = v_now
  from public.user_workout_plan_days d
  where e.plan_day_id = d.id and d.plan_id = p_plan_id
    and d.archived_at is null and not (d.id = any(v_keep_day_ids))
    and e.archived_at is null;

  update public.user_workout_plan_days
  set archived_at = v_now
  where plan_id = p_plan_id and archived_at is null and not (id = any(v_keep_day_ids));

  update public.user_workout_plans
  set name = v_name,
      source = v_source,
      goal = nullif(btrim(coalesce(p_plan->>'goal', '')), ''),
      description = nullif(btrim(coalesce(p_plan->>'description', '')), ''),
      chatgpt_source = coalesce(nullif(p_plan->>'chatgpt_source', '')::boolean, v_source in ('chatgpt', 'imported')),
      program_duration_weeks = nullif(p_plan->>'program_duration_weeks', '')::integer,
      days_per_week = jsonb_array_length(p_plan->'days'),
      session_duration_minutes = nullif(p_plan->>'session_duration_minutes', '')::integer,
      updated_at = v_now
  where id = p_plan_id and user_id = p_user_id
  returning * into v_plan;

  if v_schedule_start is not null then
    delete from public.user_workout_sessions
    where user_id = p_user_id and user_workout_plan_id = p_plan_id
      and status = 'scheduled' and scheduled_date >= current_date;

    select count(*) into v_active_day_count
    from public.user_workout_plan_days
    where plan_id = p_plan_id and archived_at is null;

    for v_day in
      select * from public.user_workout_plan_days
      where plan_id = p_plan_id and archived_at is null
      order by day_number, id
    loop
      v_schedule_day_offset := case v_day.weekday
        when 'Sunday' then 0 when 'Monday' then 1 when 'Tuesday' then 2
        when 'Wednesday' then 3 when 'Thursday' then 4 when 'Friday' then 5
        when 'Saturday' then 6
        else v_day.day_number - 1
      end;
      v_schedule_day_offset := mod(v_schedule_day_offset - extract(dow from v_schedule_start)::integer + 7, 7);
      for v_schedule_week in v_schedule_min_week..v_schedule_max_week loop
        insert into public.user_workout_sessions (
          user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
          session_number, scheduled_date, day_title, status
        ) values (
          p_user_id, p_plan_id, v_day.id, v_schedule_week, v_day.day_number,
          (v_schedule_week - 1) * v_active_day_count + v_day.day_number,
          v_schedule_start + ((v_schedule_week - v_schedule_min_week) * 7) + v_schedule_day_offset,
          v_day.day_name, 'scheduled'
        )
        on conflict (user_workout_plan_id, week_index, day_index) do nothing;
      end loop;
    end loop;
  end if;

  return to_jsonb(v_plan);
end;
$$;

create or replace function public.start_or_resume_workout_session_atomic(
  p_user_id uuid,
  p_plan_day_id uuid,
  p_scheduled_session_id uuid default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_day public.user_workout_plan_days%rowtype;
  v_plan public.user_workout_plans%rowtype;
  v_session public.workout_sessions%rowtype;
  v_schedule public.user_workout_sessions%rowtype;
  v_existing boolean := false;
  v_now timestamptz := clock_timestamp();
begin
  perform public.assert_workout_actor(p_user_id);
  select p.* into v_plan
  from public.user_workout_plans p
  join public.user_workout_plan_days d on d.plan_id = p.id
  where d.id = p_plan_day_id and p.user_id = p_user_id
    and d.archived_at is null and p.archived_at is null
  for update of p;
  if not found then
    raise exception 'Workout day not found.' using errcode = 'P0002';
  end if;
  select * into v_day
  from public.user_workout_plan_days
  where id = p_plan_day_id and plan_id = v_plan.id and archived_at is null
  for update;

  if p_scheduled_session_id is not null then
    select * into v_schedule from public.user_workout_sessions
    where id = p_scheduled_session_id and user_id = p_user_id
      and user_workout_plan_id = v_plan.id and plan_day_id = p_plan_day_id
    for update;
    if not found then
      raise exception 'Scheduled workout does not belong to this plan day.' using errcode = '23514';
    end if;

    select * into v_session
    from public.workout_sessions
    where scheduled_session_id = p_scheduled_session_id and user_id = p_user_id
    for update;
    if found then
      if v_session.status <> 'started' then
        raise exception 'This scheduled workout is already completed or skipped.' using errcode = '23514';
      end if;
      return jsonb_build_object('session', to_jsonb(v_session), 'resumed', true);
    end if;
    if v_schedule.status in ('completed', 'skipped') then
      raise exception 'A completed or skipped scheduled workout cannot be started again.' using errcode = '23514';
    end if;
  end if;

  select exists (
    select 1 from public.workout_sessions
    where user_id = p_user_id and plan_day_id = p_plan_day_id and status = 'started'
  ) into v_existing;

  insert into public.workout_sessions (
    user_id, workout_id, plan_id, plan_day_id, scheduled_session_id,
    workout_day_name, workout_category, workout_name, started_at,
    completed_at, duration_minutes, notes, status, source
  ) values (
    p_user_id, null, v_plan.id, p_plan_day_id, p_scheduled_session_id,
    v_day.day_name, 'Workout',
    case when v_day.weekday is null then v_day.day_name else v_day.day_name || ' - ' || v_day.weekday end,
    v_now, null, null, null, 'started',
    case when p_scheduled_session_id is null then 'manual' else 'schedule' end
  )
  on conflict (user_id, plan_day_id)
    where status = 'started' and plan_day_id is not null
  do update set started_at = public.workout_sessions.started_at
  returning * into v_session;

  if p_scheduled_session_id is not null then
    if v_session.scheduled_session_id is null then
      update public.workout_sessions
      set scheduled_session_id = p_scheduled_session_id, source = 'schedule'
      where id = v_session.id and user_id = p_user_id and scheduled_session_id is null
      returning * into v_session;
    elsif v_session.scheduled_session_id <> p_scheduled_session_id then
      raise exception 'Another scheduled workout is already active for this plan day.' using errcode = '23505';
    end if;
    update public.user_workout_sessions
    set status = 'started', started_at = coalesce(started_at, v_session.started_at), updated_at = v_now
    where id = p_scheduled_session_id and user_id = p_user_id and status in ('scheduled', 'started');
  end if;

  return jsonb_build_object('session', to_jsonb(v_session), 'resumed', v_existing or v_session.started_at < v_now);
end;
$$;

create or replace function public.upsert_workout_set_logs_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_log jsonb;
  v_plan_exercise_id uuid;
  v_exercise_order integer;
  v_set_number integer;
  v_duplicate_count integer;
  v_logs jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  select * into v_session
  from public.workout_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;
  if v_session.status <> 'started' then
    raise exception 'Only an active workout session can save sets.' using errcode = '23514';
  end if;
  if p_logs is null then
    p_logs := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_logs) <> 'array' then
    raise exception 'Workout set logs must be an array.' using errcode = '23514';
  end if;
  if jsonb_array_length(p_logs) > 500 then
    raise exception 'A workout session can contain at most 500 set logs.' using errcode = '22023';
  end if;

  select count(*) into v_duplicate_count
  from (
    select
      coalesce(nullif(value->>'plan_exercise_id', ''), 'order:' || coalesce(value->>'exercise_order', '')) as exercise_key,
      value->>'set_number' as set_key
    from jsonb_array_elements(p_logs)
    group by 1, 2
    having count(*) > 1
  ) duplicates;
  if v_duplicate_count > 0 then
    raise exception 'Workout set payload contains duplicate stable keys.' using errcode = '23505';
  end if;

  for v_log in select value from jsonb_array_elements(p_logs)
  loop
    v_plan_exercise_id := nullif(v_log->>'plan_exercise_id', '')::uuid;
    v_exercise_order := nullif(v_log->>'exercise_order', '')::integer;
    v_set_number := nullif(v_log->>'set_number', '')::integer;
    if nullif(btrim(coalesce(v_log->>'exercise_name', '')), '') is null
       or v_set_number is null or v_set_number <= 0
       or coalesce(nullif(v_log->>'reps', '')::integer, 0) < 0
       or coalesce(nullif(v_log->>'weight_kg', '')::numeric, 0) < 0 then
      raise exception 'Workout set values are invalid.' using errcode = '23514';
    end if;

    if v_plan_exercise_id is not null then
      perform 1
      from public.user_workout_plan_exercises e
      where e.id = v_plan_exercise_id and e.plan_day_id = v_session.plan_day_id;
      if not found then
        raise exception 'Plan exercise does not belong to this session.' using errcode = '23514';
      end if;

      insert into public.exercise_logs (
        workout_session_id, plan_exercise_id, exercise_order, exercise_name,
        exercise_category, planned_sets, planned_reps, planned_rest_seconds,
        set_number, reps, weight_kg, notes, completed_at
      ) values (
        p_session_id, v_plan_exercise_id, v_exercise_order,
        btrim(v_log->>'exercise_name'), nullif(v_log->>'exercise_category', ''),
        nullif(v_log->>'planned_sets', '')::integer, nullif(v_log->>'planned_reps', ''),
        nullif(v_log->>'planned_rest_seconds', '')::integer, v_set_number,
        nullif(v_log->>'reps', '')::integer, nullif(v_log->>'weight_kg', '')::numeric,
        nullif(btrim(coalesce(v_log->>'notes', '')), ''), nullif(v_log->>'completed_at', '')::timestamptz
      )
      on conflict (workout_session_id, plan_exercise_id, set_number)
        where plan_exercise_id is not null
      do update set
        exercise_order = excluded.exercise_order,
        exercise_name = excluded.exercise_name,
        exercise_category = excluded.exercise_category,
        planned_sets = excluded.planned_sets,
        planned_reps = excluded.planned_reps,
        planned_rest_seconds = excluded.planned_rest_seconds,
        reps = excluded.reps,
        weight_kg = excluded.weight_kg,
        notes = excluded.notes,
        completed_at = excluded.completed_at;
    else
      if v_exercise_order is null or v_exercise_order <= 0 then
        raise exception 'A set without a plan exercise requires a stable exercise order.' using errcode = '23514';
      end if;
      insert into public.exercise_logs (
        workout_session_id, plan_exercise_id, exercise_order, exercise_name,
        exercise_category, planned_sets, planned_reps, planned_rest_seconds,
        set_number, reps, weight_kg, notes, completed_at
      ) values (
        p_session_id, null, v_exercise_order, btrim(v_log->>'exercise_name'),
        nullif(v_log->>'exercise_category', ''), nullif(v_log->>'planned_sets', '')::integer,
        nullif(v_log->>'planned_reps', ''), nullif(v_log->>'planned_rest_seconds', '')::integer,
        v_set_number, nullif(v_log->>'reps', '')::integer, nullif(v_log->>'weight_kg', '')::numeric,
        nullif(btrim(coalesce(v_log->>'notes', '')), ''), nullif(v_log->>'completed_at', '')::timestamptz
      )
      on conflict (workout_session_id, exercise_order, set_number)
        where plan_exercise_id is null and exercise_order is not null
      do update set
        exercise_name = excluded.exercise_name,
        exercise_category = excluded.exercise_category,
        planned_sets = excluded.planned_sets,
        planned_reps = excluded.planned_reps,
        planned_rest_seconds = excluded.planned_rest_seconds,
        reps = excluded.reps,
        weight_kg = excluded.weight_kg,
        notes = excluded.notes,
        completed_at = excluded.completed_at;
    end if;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last, l.plan_exercise_id, l.set_number), '[]'::jsonb)
  into v_logs
  from public.exercise_logs l
  where l.workout_session_id = p_session_id;
  return v_logs;
end;
$$;

create or replace function public.complete_workout_session_atomic(
  p_user_id uuid,
  p_session_id uuid,
  p_logs jsonb,
  p_duration_minutes integer,
  p_notes text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_session public.workout_sessions%rowtype;
  v_schedule public.user_workout_sessions%rowtype;
  v_logs jsonb;
  v_now timestamptz := clock_timestamp();
  v_updated_count integer;
  v_prefetched_schedule_id uuid;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_duration_minutes is null or p_duration_minutes < 0 then
    raise exception 'Workout duration is invalid.' using errcode = '23514';
  end if;

  select scheduled_session_id into v_prefetched_schedule_id
  from public.workout_sessions
  where id = p_session_id and user_id = p_user_id;
  if not found then
    raise exception 'Workout session not found.' using errcode = 'P0002';
  end if;

  if v_prefetched_schedule_id is not null then
    select * into v_schedule
    from public.user_workout_sessions
    where id = v_prefetched_schedule_id and user_id = p_user_id
    for update;
    if not found then
      raise exception 'Linked scheduled workout is missing.' using errcode = '23514';
    end if;
  end if;

  select * into v_session
  from public.workout_sessions
  where id = p_session_id and user_id = p_user_id
  for update;
  if v_session.scheduled_session_id is distinct from v_prefetched_schedule_id then
    raise exception 'Workout schedule link changed while completing it.' using errcode = '40001';
  end if;
  if v_session.status = 'completed' then
    select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last, l.plan_exercise_id, l.set_number), '[]'::jsonb)
    into v_logs from public.exercise_logs l where l.workout_session_id = p_session_id;
    return jsonb_build_object('session', to_jsonb(v_session), 'logs', v_logs, 'already_completed', true);
  end if;
  if v_session.status <> 'started' then
    raise exception 'A skipped workout cannot be completed.' using errcode = '23514';
  end if;

  if v_session.scheduled_session_id is not null then
    if v_schedule.user_workout_plan_id is distinct from v_session.plan_id
       or v_schedule.plan_day_id is distinct from v_session.plan_day_id then
      raise exception 'Linked scheduled workout does not match this session.' using errcode = '23514';
    end if;
    if v_schedule.status in ('completed', 'skipped') then
      raise exception 'Linked scheduled workout is already terminal.' using errcode = '23514';
    end if;
  end if;

  if p_logs is not null then
    v_logs := public.upsert_workout_set_logs_atomic(p_user_id, p_session_id, p_logs);
    delete from public.exercise_logs l
    where l.workout_session_id = p_session_id
      and not exists (
        select 1
        from jsonb_array_elements(p_logs) item
        where nullif(item->>'set_number', '')::integer = l.set_number
          and (
            (l.plan_exercise_id is not null and nullif(item->>'plan_exercise_id', '')::uuid = l.plan_exercise_id)
            or
            (l.plan_exercise_id is null and l.exercise_order is not null
              and nullif(item->>'plan_exercise_id', '') is null
              and nullif(item->>'exercise_order', '')::integer = l.exercise_order)
          )
      );
  end if;
  select coalesce(jsonb_agg(to_jsonb(l) order by l.exercise_order nulls last, l.plan_exercise_id, l.set_number), '[]'::jsonb)
  into v_logs from public.exercise_logs l where l.workout_session_id = p_session_id;
  update public.workout_sessions
  set status = 'completed', completed_at = v_now,
      duration_minutes = p_duration_minutes,
      notes = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_session_id and user_id = p_user_id and status = 'started'
  returning * into v_session;
  if not found then
    raise exception 'Workout session state changed while completing it.' using errcode = '40001';
  end if;

  if v_session.scheduled_session_id is not null then
    update public.user_workout_sessions
    set status = 'completed', completed_at = v_now,
        duration_minutes = p_duration_minutes,
        notes = nullif(btrim(coalesce(p_notes, '')), ''), updated_at = v_now
    where id = v_session.scheduled_session_id and user_id = p_user_id and status in ('scheduled', 'started');
    get diagnostics v_updated_count = row_count;
    if v_updated_count <> 1 then
      raise exception 'Linked scheduled workout could not be completed.' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object('session', to_jsonb(v_session), 'logs', v_logs, 'already_completed', false);
end;
$$;

revoke all on function public.activate_workout_plan_atomic(uuid, uuid, timestamptz) from public, anon;
revoke all on function public.create_workout_plan_atomic(uuid, jsonb, boolean) from public, anon;
revoke all on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.save_workout_plan_atomic(uuid, uuid, jsonb, timestamptz) from public, anon;
revoke all on function public.duplicate_workout_plan_atomic(uuid, uuid) from public, anon;
revoke all on function public.archive_workout_plan_atomic(uuid, uuid, text) from public, anon;
revoke all on function public.delete_workout_plan_atomic(uuid, uuid, boolean) from public, anon;
revoke all on function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid) from public, anon;
revoke all on function public.upsert_workout_set_logs_atomic(uuid, uuid, jsonb) from public, anon;
revoke all on function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text) from public, anon;

grant execute on function public.activate_workout_plan_atomic(uuid, uuid, timestamptz) to authenticated, service_role;
grant execute on function public.create_workout_plan_atomic(uuid, jsonb, boolean) to authenticated, service_role;
grant execute on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.save_workout_plan_atomic(uuid, uuid, jsonb, timestamptz) to authenticated, service_role;
grant execute on function public.duplicate_workout_plan_atomic(uuid, uuid) to authenticated, service_role;
grant execute on function public.archive_workout_plan_atomic(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.delete_workout_plan_atomic(uuid, uuid, boolean) to authenticated, service_role;
grant execute on function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.upsert_workout_set_logs_atomic(uuid, uuid, jsonb) to authenticated, service_role;
grant execute on function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text) to authenticated, service_role;

comment on function public.create_workout_plan_atomic(uuid, jsonb, boolean) is
  'Creates a complete owned workout plan and only switches the active plan after every day and exercise is valid and saved.';
comment on function public.save_workout_plan_atomic(uuid, uuid, jsonb, timestamptz) is
  'Atomically saves plan metadata, day order, and day contents while retaining removed day and exercise identities for history.';
comment on function public.start_or_resume_workout_session_atomic(uuid, uuid, uuid) is
  'Returns the one owned open session for a plan day or creates it atomically without resetting its start time.';
comment on function public.complete_workout_session_atomic(uuid, uuid, jsonb, integer, text) is
  'Idempotently upserts stable workout sets and completes performed and linked scheduled session state in one transaction.';

notify pgrst, 'reload schema';

commit;
