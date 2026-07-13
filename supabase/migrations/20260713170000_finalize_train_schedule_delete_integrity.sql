begin;

-- Schedule boundaries are user-visible calendar dates. They must be supplied
-- by the caller and must never be derived from the database server timezone.
create or replace function public.activate_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_schedule_start_date date,
  p_expected_updated_at timestamptz default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.user_workout_plans%rowtype;
  v_day record;
  v_duration_weeks integer;
  v_day_count integer;
  v_day_offset integer;
  v_week_index integer;
  v_week_base integer;
  v_session_base integer;
  v_created_count integer := 0;
  v_scheduled_date date;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required.' using errcode = '23514';
  end if;

  -- Every plan row for the owner is locked in a stable order before changing
  -- active flags or schedules. This serializes concurrent activation/delete.
  perform 1
  from public.user_workout_plans
  where user_id = p_user_id
  order by id
  for update;

  select * into v_plan
  from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id
  for update;
  if not found then
    raise exception 'Workout plan not found.' using errcode = 'P0002';
  end if;
  if p_expected_updated_at is not null and v_plan.updated_at is distinct from p_expected_updated_at then
    raise exception 'Workout plan changed after it was opened.' using errcode = '40001';
  end if;

  select count(*) into v_day_count
  from public.user_workout_plan_days
  where plan_id = p_plan_id and archived_at is null;
  if v_day_count = 0 then
    raise exception 'The active workout plan has no training days.' using errcode = '23514';
  end if;

  -- A row still labelled scheduled but already carrying history must not be
  -- silently deleted or left beside a newly generated duplicate. Fail closed
  -- so production preflight can identify and repair the inconsistent record.
  if exists (
    select 1
    from public.user_workout_sessions s
    where s.user_id = p_user_id
      and s.status = 'scheduled'
      and s.scheduled_date >= p_schedule_start_date
      and (
        s.started_at is not null
        or s.completed_at is not null
        or s.skipped_at is not null
        or exists (
          select 1 from public.workout_sessions ws
          where ws.scheduled_session_id = s.id
        )
        or exists (
          select 1 from public.user_exercise_logs l
          where l.user_workout_session_id = s.id
        )
      )
  ) then
    raise exception 'A future scheduled session already contains workout history. Review it before replacing the schedule.'
      using errcode = '23503';
  end if;

  -- The explicit date is both the retirement boundary and the first date from
  -- which the replacement schedule may be generated. Started and terminal
  -- sessions are deliberately excluded, regardless of their date.
  delete from public.user_workout_sessions s
  where s.user_id = p_user_id
    and s.status = 'scheduled'
    and s.started_at is null
    and s.completed_at is null
    and s.skipped_at is null
    and s.scheduled_date >= p_schedule_start_date
    and not exists (
      select 1 from public.workout_sessions ws
      where ws.scheduled_session_id = s.id
    )
    and not exists (
      select 1 from public.user_exercise_logs l
      where l.user_workout_session_id = s.id
    );

  update public.user_workout_plans
  set is_active = false, is_default = false
  where user_id = p_user_id
    and id <> p_plan_id
    and (is_active = true or is_default = true);

  update public.user_workout_plans
  set is_active = true, is_default = true, archived_at = null
  where id = p_plan_id and user_id = p_user_id
  returning * into v_plan;

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
      when 'Saturday' then 6 else mod(v_day.day_number - 1, 7)
    end;
    v_day_offset := mod(v_day_offset - extract(dow from p_schedule_start_date)::integer + 7, 7);

    for v_week_index in 1..v_duration_weeks loop
      v_scheduled_date := p_schedule_start_date + ((v_week_index - 1) * 7 + v_day_offset);
      -- A preserved terminal or started occurrence for this exact plan day and
      -- local date already represents the workout. Do not add a second row.
      if not exists (
        select 1
        from public.user_workout_sessions existing
        where existing.user_id = p_user_id
          and existing.plan_day_id = v_day.id
          and existing.scheduled_date = v_scheduled_date
      ) then
        insert into public.user_workout_sessions (
          user_id, user_workout_plan_id, plan_day_id, week_index, day_index,
          session_number, scheduled_date, day_title, status
        ) values (
          p_user_id, p_plan_id, v_day.id, v_week_base + v_week_index, v_day.day_number,
          v_session_base + (v_week_index - 1) * v_day_count + v_day.day_number,
          v_scheduled_date, v_day.day_name, 'scheduled'
        );
        v_created_count := v_created_count + 1;
      end if;
    end loop;
  end loop;

  return to_jsonb(v_plan) || jsonb_build_object(
    'schedule_start_date', p_schedule_start_date,
    'scheduled_sessions_created', v_created_count
  );
end;
$$;

create or replace function public.create_workout_plan_atomic(
  p_user_id uuid,
  p_plan jsonb,
  p_activate boolean,
  p_schedule_start_date date
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
  v_program_duration_weeks integer := coalesce(
    nullif(p_plan->>'duration_weeks', '')::integer,
    nullif(p_plan->>'program_duration_weeks', '')::integer
  );
  v_saved_days jsonb;
begin
  perform public.assert_workout_actor(p_user_id);
  if p_activate and p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required when activating a plan.' using errcode = '23514';
  end if;
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
  if v_program_duration_weeks is not null and v_program_duration_weeks not between 1 and 104 then
    raise exception 'Workout plan duration must be between 1 and 104 weeks.' using errcode = '22023';
  end if;

  select count(*) into v_exercise_count
  from (
    select value->>'weekday'
    from jsonb_array_elements(p_plan->'days')
    where nullif(value->>'weekday', '') is not null
    group by 1
    having count(*) > 1
  ) duplicate_weekdays;
  if v_exercise_count > 0 then
    raise exception 'Each scheduled weekday can appear only once in a workout plan.' using errcode = '23505';
  end if;

  -- Validate the complete nested graph before the first write so any error
  -- leaves the previous active plan and schedule untouched.
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
    v_program_duration_weeks, v_day_count,
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
      btrim(v_day.value->>'day_name'), nullif(v_day.value->>'focus', ''),
      nullif(v_day.value->>'weekday', ''),
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
  end loop;

  if p_activate then
    perform public.activate_workout_plan_atomic(
      p_user_id,
      v_plan.id,
      p_schedule_start_date,
      null
    );
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

  return to_jsonb(v_plan) || jsonb_build_object(
    'days', v_saved_days,
    'schedule_start_date', case when p_activate then p_schedule_start_date else null end
  );
end;
$$;

create or replace function public.archive_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_reason text,
  p_schedule_start_date date
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
  if p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required.' using errcode = '23514';
  end if;

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
  if v_was_active then
    select id into v_replacement_id
    from public.user_workout_plans
    where user_id = p_user_id and id <> p_plan_id and archived_at is null
    order by updated_at desc, created_at desc, id
    limit 1;
  end if;

  if exists (
    select 1
    from public.user_workout_sessions s
    where s.user_id = p_user_id
      and s.user_workout_plan_id = p_plan_id
      and s.status = 'scheduled'
      and s.scheduled_date >= p_schedule_start_date
      and (
        s.started_at is not null
        or s.completed_at is not null
        or s.skipped_at is not null
        or exists (
          select 1 from public.workout_sessions ws
          where ws.scheduled_session_id = s.id
        )
        or exists (
          select 1 from public.user_exercise_logs l
          where l.user_workout_session_id = s.id
        )
      )
  ) then
    raise exception 'A future scheduled session already contains workout history. Review it before archiving the plan.'
      using errcode = '23503';
  end if;

  -- An archived plan cannot continue to control future scheduling. Only its
  -- scheduled-only rows at/after the explicit boundary are retired.
  delete from public.user_workout_sessions s
  where s.user_id = p_user_id
    and s.user_workout_plan_id = p_plan_id
    and s.status = 'scheduled'
    and s.started_at is null
    and s.completed_at is null
    and s.skipped_at is null
    and s.scheduled_date >= p_schedule_start_date
    and not exists (
      select 1 from public.workout_sessions ws
      where ws.scheduled_session_id = s.id
    )
    and not exists (
      select 1 from public.user_exercise_logs l
      where l.user_workout_session_id = s.id
    );

  update public.user_workout_plans
  set archived_at = clock_timestamp(),
      archived_reason = nullif(btrim(coalesce(p_reason, '')), ''),
      is_active = false,
      is_default = false
  where id = p_plan_id and user_id = p_user_id
  returning * into v_plan;

  if v_replacement_id is not null then
    perform public.activate_workout_plan_atomic(
      p_user_id,
      v_replacement_id,
      p_schedule_start_date,
      null
    );
  end if;

  return to_jsonb(v_plan) || jsonb_build_object(
    'already_archived', false,
    'replacement_plan_id', v_replacement_id,
    'schedule_start_date', p_schedule_start_date
  );
end;
$$;

create or replace function public.delete_workout_plan_atomic(
  p_user_id uuid,
  p_plan_id uuid,
  p_confirmed boolean,
  p_schedule_start_date date
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
  if p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required.' using errcode = '23514';
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

  -- Any performed session, terminal/open scheduled session, past scheduled
  -- reference, or performed/snapshot log is history and forces archive.
  if exists (
    select 1
    from public.workout_sessions ws
    where ws.user_id = p_user_id
      and (
        ws.plan_id = p_plan_id
        or exists (
          select 1 from public.user_workout_plan_days d
          where d.id = ws.plan_day_id and d.plan_id = p_plan_id
        )
        or exists (
          select 1 from public.user_workout_sessions s
          where s.id = ws.scheduled_session_id
            and s.user_workout_plan_id = p_plan_id
        )
      )
  ) or exists (
    select 1
    from public.user_workout_sessions s
    where s.user_id = p_user_id
      and s.user_workout_plan_id = p_plan_id
      and (
        s.status <> 'scheduled'
        or s.started_at is not null
        or s.completed_at is not null
        or s.skipped_at is not null
        or s.scheduled_date < p_schedule_start_date
        or exists (
          select 1 from public.user_exercise_logs l
          where l.user_workout_session_id = s.id
        )
      )
  ) or exists (
    select 1
    from public.exercise_logs l
    join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
    join public.user_workout_plan_days d on d.id = e.plan_day_id
    where d.plan_id = p_plan_id
  ) or exists (
    select 1
    from public.user_exercise_logs l
    join public.user_workout_plan_exercises e on e.id = l.plan_exercise_id
    join public.user_workout_plan_days d on d.id = e.plan_day_id
    where d.plan_id = p_plan_id
  ) then
    raise exception 'This plan has workout history. Archive it instead.' using errcode = '23503';
  end if;

  if v_plan.is_active or v_plan.is_default then
    select id into v_replacement_id
    from public.user_workout_plans
    where user_id = p_user_id and id <> p_plan_id and archived_at is null
    order by updated_at desc, created_at desc, id
    limit 1;
  end if;

  -- Scheduled-only rows are not history. Remove only rows at/after the caller's
  -- explicit local boundary, in this same transaction, before plan cascades.
  delete from public.user_workout_sessions s
  where s.user_id = p_user_id
    and s.user_workout_plan_id = p_plan_id
    and s.status = 'scheduled'
    and s.started_at is null
    and s.completed_at is null
    and s.skipped_at is null
    and s.scheduled_date >= p_schedule_start_date
    and not exists (
      select 1 from public.workout_sessions ws
      where ws.scheduled_session_id = s.id
    )
    and not exists (
      select 1 from public.user_exercise_logs l
      where l.user_workout_session_id = s.id
    );

  delete from public.user_workout_plans
  where id = p_plan_id and user_id = p_user_id;

  if v_replacement_id is not null then
    perform public.activate_workout_plan_atomic(
      p_user_id,
      v_replacement_id,
      p_schedule_start_date,
      null
    );
  end if;

  return jsonb_build_object(
    'deleted', true,
    'already_missing', false,
    'replacement_plan_id', v_replacement_id,
    'schedule_start_date', p_schedule_start_date
  );
end;
$$;

create or replace function public.save_workout_plan_day_atomic(
  p_user_id uuid,
  p_day_id uuid,
  p_day jsonb,
  p_schedule_start_date date,
  p_expected_updated_at timestamptz default null,
  p_rebuild_schedule boolean default true
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
begin
  perform public.assert_workout_actor(p_user_id);
  if p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required.' using errcode = '23514';
  end if;

  select p.* into v_plan
  from public.user_workout_plans p
  join public.user_workout_plan_days d on d.plan_id = p.id
  where d.id = p_day_id and p.user_id = p_user_id
    and d.archived_at is null and p.archived_at is null
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
  where plan_day_id = p_day_id
    and archived_at is null
    and not (id = any(v_keep_ids));

  update public.user_workout_plan_days
  set day_name = btrim(p_day->>'day_name'),
      focus = case when p_day ? 'focus' then nullif(btrim(coalesce(p_day->>'focus', '')), '') else focus end,
      weekday = nullif(p_day->>'weekday', ''),
      notes = nullif(btrim(coalesce(p_day->>'notes', '')), ''),
      session_duration_minutes = nullif(p_day->>'session_duration_minutes', '')::integer,
      updated_at = v_now
  where id = p_day_id
  returning * into v_day;

  -- Active-plan edits rebuild through the same canonical activation routine.
  -- Full-plan save passes false here and performs one rebuild after all days.
  if v_plan.is_active and p_rebuild_schedule then
    perform public.activate_workout_plan_atomic(
      p_user_id,
      v_plan.id,
      p_schedule_start_date,
      null
    );
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
  p_schedule_start_date date,
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
begin
  perform public.assert_workout_actor(p_user_id);
  if p_schedule_start_date is null then
    raise exception 'An explicit local schedule start date is required.' using errcode = '23514';
  end if;

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

  v_source := coalesce(nullif(p_plan->>'source', ''), v_plan.source);
  if v_source not in ('manual', 'chatgpt', 'imported') then
    raise exception 'Workout plan source is invalid.' using errcode = '23514';
  end if;

  -- Validate every supplied stable day id before changing any numbering.
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

  -- Move persisted day numbers out of the visible ordinal range so reordering
  -- remains valid under unique(plan_id, day_number).
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

    perform public.save_workout_plan_day_atomic(
      p_user_id,
      v_day_id,
      v_day.value,
      p_schedule_start_date,
      null,
      false
    );
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
  where plan_id = p_plan_id
    and archived_at is null
    and not (id = any(v_keep_day_ids));

  update public.user_workout_plans
  set name = v_name,
      source = v_source,
      goal = nullif(btrim(coalesce(p_plan->>'goal', '')), ''),
      description = nullif(btrim(coalesce(p_plan->>'description', '')), ''),
      chatgpt_source = coalesce(
        nullif(p_plan->>'chatgpt_source', '')::boolean,
        v_source in ('chatgpt', 'imported')
      ),
      program_duration_weeks = nullif(p_plan->>'program_duration_weeks', '')::integer,
      days_per_week = jsonb_array_length(p_plan->'days'),
      session_duration_minutes = nullif(p_plan->>'session_duration_minutes', '')::integer,
      updated_at = v_now
  where id = p_plan_id and user_id = p_user_id
  returning * into v_plan;

  if v_plan.is_active then
    perform public.activate_workout_plan_atomic(
      p_user_id,
      p_plan_id,
      p_schedule_start_date,
      null
    );
    select * into v_plan
    from public.user_workout_plans
    where id = p_plan_id and user_id = p_user_id;
  end if;

  return to_jsonb(v_plan);
end;
$$;

-- Remove the unsafe legacy overloads so PostgREST cannot resolve a caller that
-- omitted the explicit local date. These are PR-local functions, not rewritten
-- migration history; this additive migration is their forward correction.
drop function if exists public.activate_workout_plan_atomic(uuid, uuid, timestamptz);
drop function if exists public.create_workout_plan_atomic(uuid, jsonb, boolean);
drop function if exists public.archive_workout_plan_atomic(uuid, uuid, text);
drop function if exists public.delete_workout_plan_atomic(uuid, uuid, boolean);
drop function if exists public.save_workout_plan_day_atomic(uuid, uuid, jsonb, timestamptz);
drop function if exists public.save_workout_plan_atomic(uuid, uuid, jsonb, timestamptz);

revoke all on function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.create_workout_plan_atomic(uuid, jsonb, boolean, date)
  from public, anon, authenticated, service_role;
revoke all on function public.archive_workout_plan_atomic(uuid, uuid, text, date)
  from public, anon, authenticated, service_role;
revoke all on function public.delete_workout_plan_atomic(uuid, uuid, boolean, date)
  from public, anon, authenticated, service_role;
revoke all on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)
  from public, anon, authenticated, service_role;

grant execute on function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz)
  to authenticated, service_role;
grant execute on function public.create_workout_plan_atomic(uuid, jsonb, boolean, date)
  to authenticated, service_role;
grant execute on function public.archive_workout_plan_atomic(uuid, uuid, text, date)
  to authenticated, service_role;
grant execute on function public.delete_workout_plan_atomic(uuid, uuid, boolean, date)
  to authenticated, service_role;
grant execute on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean)
  to authenticated, service_role;
grant execute on function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz)
  to authenticated, service_role;

comment on function public.activate_workout_plan_atomic(uuid, uuid, date, timestamptz) is
  'Activates an owned plan and replaces only scheduled-only rows from an explicit user-local calendar date.';
comment on function public.create_workout_plan_atomic(uuid, jsonb, boolean, date) is
  'Validates and creates the complete owned plan graph, then schedules exactly once through canonical activation.';
comment on function public.archive_workout_plan_atomic(uuid, uuid, text, date) is
  'Archives a plan, preserves workout history, retires eligible scheduled-only rows, and safely activates a replacement.';
comment on function public.delete_workout_plan_atomic(uuid, uuid, boolean, date) is
  'Permanently deletes only history-free owned plans after confirmation, including eligible scheduled-only rows atomically.';
comment on function public.save_workout_plan_day_atomic(uuid, uuid, jsonb, date, timestamptz, boolean) is
  'Saves an owned plan day and routes any active-plan schedule rebuild through canonical activation from an explicit local date.';
comment on function public.save_workout_plan_atomic(uuid, uuid, jsonb, date, timestamptz) is
  'Saves an owned full plan graph and performs at most one canonical schedule rebuild from an explicit local date.';

notify pgrst, 'reload schema';

commit;
