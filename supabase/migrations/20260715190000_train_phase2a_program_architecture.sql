begin;

-- Plaivra Train Phase 2A: additive multi-week, multi-sport program foundation.
-- This migration intentionally preserves the active legacy plan/runtime writers.

do $phase2a_preflight$
begin
  if to_regclass('public.user_workout_plan_week_templates') is not null
     or to_regclass('public.user_workout_plan_weeks') is not null
     or to_regclass('public.user_workout_plan_sessions') is not null
     or to_regclass('public.user_workout_plan_phases') is not null
     or to_regclass('public.user_workout_plan_activities') is not null then
    raise exception 'Train Phase 2A target tables already exist; refusing partial or repeated application.';
  end if;

  if exists (
    select 1
    from public.user_workout_sessions scheduled
    left join public.user_workout_plans plan on plan.id = scheduled.user_workout_plan_id
    left join public.user_workout_plan_days day on day.id = scheduled.plan_day_id
    where plan.id is null
       or plan.user_id <> scheduled.user_id
       or (scheduled.plan_day_id is not null and (day.id is null or day.plan_id <> scheduled.user_workout_plan_id))
  ) then
    raise exception 'Train Phase 2A preflight failed: scheduled-session ownership or plan-day references are contradictory.';
  end if;

  if exists (
    select 1
    from public.workout_sessions performed
    left join public.user_workout_plans plan on plan.id = performed.plan_id
    left join public.user_workout_plan_days day on day.id = performed.plan_day_id
    where (performed.plan_id is not null and (plan.id is null or plan.user_id <> performed.user_id))
       or (performed.plan_day_id is not null and (day.id is null or day.plan_id is distinct from performed.plan_id))
  ) then
    raise exception 'Train Phase 2A preflight failed: performed-session ownership or plan-day references are contradictory.';
  end if;

  if exists (
    select 1
    from public.user_exercise_logs log
    join public.user_workout_sessions scheduled on scheduled.id = log.user_workout_session_id
    join public.user_workout_plan_exercises exercise on exercise.id = log.plan_exercise_id
    join public.user_workout_plan_days day on day.id = exercise.plan_day_id
    where log.plan_exercise_id is not null
      and day.plan_id <> scheduled.user_workout_plan_id
  ) then
    raise exception 'Train Phase 2A preflight failed: scheduled exercise-log references cross plans.';
  end if;

  if exists (
    select 1
    from public.exercise_logs log
    join public.workout_sessions performed on performed.id = log.workout_session_id
    join public.user_workout_plan_exercises exercise on exercise.id = log.plan_exercise_id
    join public.user_workout_plan_days day on day.id = exercise.plan_day_id
    where log.plan_exercise_id is not null
      and day.plan_id is distinct from performed.plan_id
  ) then
    raise exception 'Train Phase 2A preflight failed: performed exercise-log references cross plans.';
  end if;
end
$phase2a_preflight$;

create table public.user_workout_plan_week_templates (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null,
  source text not null,
  derived_from_template_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_plan_week_templates_name_check check (btrim(name) <> ''),
  constraint user_workout_plan_week_templates_sort_order_check check (sort_order > 0),
  constraint user_workout_plan_week_templates_source_check
    check (source in ('manual', 'chatgpt', 'imported', 'legacy_backfill')),
  constraint user_workout_plan_week_templates_id_plan_key unique (id, plan_id)
);

alter table public.user_workout_plan_week_templates
  add constraint user_workout_plan_week_templates_derived_same_plan_fk
  foreign key (derived_from_template_id, plan_id)
  references public.user_workout_plan_week_templates(id, plan_id)
  on delete no action
  deferrable initially deferred;

create table public.user_workout_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  week_template_id uuid not null,
  week_number integer not null,
  name_override text,
  notes text,
  is_detached boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_plan_weeks_number_check check (week_number between 1 and 104),
  constraint user_workout_plan_weeks_template_same_plan_fk
    foreign key (week_template_id, plan_id)
    references public.user_workout_plan_week_templates(id, plan_id)
    on delete no action
    deferrable initially deferred
);

create unique index user_workout_plan_weeks_active_number_uidx
  on public.user_workout_plan_weeks(plan_id, week_number)
  where archived_at is null;

create table public.user_workout_plan_sessions (
  id uuid primary key default gen_random_uuid(),
  week_template_id uuid not null references public.user_workout_plan_week_templates(id) on delete cascade,
  source_legacy_plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
  source text not null,
  title text not null,
  day_offset integer not null,
  weekday text,
  sport_slug text,
  sport_name_snapshot text not null,
  session_type_slug text,
  session_type_name_snapshot text,
  duration_minutes integer,
  sort_order integer not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_plan_sessions_source_check
    check (source in ('manual', 'chatgpt', 'imported', 'legacy_backfill')),
  constraint user_workout_plan_sessions_title_check check (btrim(title) <> ''),
  constraint user_workout_plan_sessions_day_offset_check check (day_offset between 0 and 6),
  constraint user_workout_plan_sessions_weekday_check
    check (weekday is null or weekday in ('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
  constraint user_workout_plan_sessions_sport_snapshot_check check (btrim(sport_name_snapshot) <> ''),
  constraint user_workout_plan_sessions_catalog_sport_check
    check (source = 'legacy_backfill' or btrim(coalesce(sport_slug, '')) <> ''),
  constraint user_workout_plan_sessions_duration_check
    check (duration_minutes is null or duration_minutes > 0),
  constraint user_workout_plan_sessions_sort_order_check check (sort_order > 0)
);

create unique index user_workout_plan_sessions_live_legacy_day_uidx
  on public.user_workout_plan_sessions(source_legacy_plan_day_id)
  where source_legacy_plan_day_id is not null and archived_at is null;

create table public.user_workout_plan_phases (
  id uuid primary key default gen_random_uuid(),
  plan_session_id uuid not null references public.user_workout_plan_sessions(id) on delete cascade,
  phase_slug text not null,
  phase_name_snapshot text not null,
  is_optional boolean not null default false,
  source_legacy_block_type text,
  sort_order integer not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_plan_phases_slug_check check (btrim(phase_slug) <> ''),
  constraint user_workout_plan_phases_name_check check (btrim(phase_name_snapshot) <> ''),
  constraint user_workout_plan_phases_sort_order_check check (sort_order > 0)
);

create table public.user_workout_plan_activities (
  id uuid primary key default gen_random_uuid(),
  plan_phase_id uuid not null references public.user_workout_plan_phases(id) on delete cascade,
  source_legacy_plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
  legacy_source_workout_id text,
  catalog_activity_id text,
  catalog_slug text,
  catalog_version text,
  catalog_source text not null,
  activity_name_snapshot text not null,
  short_description_snapshot text,
  activity_type_slug text,
  activity_type_name_snapshot text,
  instructions_snapshot jsonb,
  metric_schema_snapshot jsonb,
  planned_prescription jsonb not null default '{}'::jsonb,
  equipment_snapshot jsonb,
  taxonomy_snapshot jsonb,
  sort_order integer not null,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_workout_plan_activities_catalog_source_check
    check (catalog_source in ('external', 'legacy', 'custom', 'manual')),
  constraint user_workout_plan_activities_name_check check (btrim(activity_name_snapshot) <> ''),
  constraint user_workout_plan_activities_sort_order_check check (sort_order > 0),
  constraint user_workout_plan_activities_instructions_shape_check
    check (instructions_snapshot is null or jsonb_typeof(instructions_snapshot) = 'array'),
  constraint user_workout_plan_activities_metric_schema_shape_check
    check (metric_schema_snapshot is null or jsonb_typeof(metric_schema_snapshot) = 'object'),
  constraint user_workout_plan_activities_prescription_shape_check
    check (jsonb_typeof(planned_prescription) = 'object'),
  constraint user_workout_plan_activities_equipment_shape_check
    check (equipment_snapshot is null or jsonb_typeof(equipment_snapshot) in ('array', 'object')),
  constraint user_workout_plan_activities_taxonomy_shape_check
    check (taxonomy_snapshot is null or jsonb_typeof(taxonomy_snapshot) = 'object')
);

create unique index user_workout_plan_activities_live_legacy_exercise_uidx
  on public.user_workout_plan_activities(source_legacy_plan_exercise_id)
  where source_legacy_plan_exercise_id is not null and archived_at is null;

alter table public.user_workout_sessions
  add column if not exists plan_week_id uuid references public.user_workout_plan_weeks(id) on delete set null,
  add column if not exists plan_session_id uuid references public.user_workout_plan_sessions(id) on delete set null;

alter table public.workout_sessions
  add column if not exists plan_week_id uuid references public.user_workout_plan_weeks(id) on delete set null,
  add column if not exists plan_session_id uuid references public.user_workout_plan_sessions(id) on delete set null;

alter table public.user_exercise_logs
  add column if not exists plan_activity_id uuid references public.user_workout_plan_activities(id) on delete set null;

alter table public.exercise_logs
  add column if not exists plan_activity_id uuid references public.user_workout_plan_activities(id) on delete set null;

create index user_workout_plan_week_templates_plan_order_idx
  on public.user_workout_plan_week_templates(plan_id, sort_order, id);
create index user_workout_plan_weeks_plan_order_idx
  on public.user_workout_plan_weeks(plan_id, week_number, id);
create index user_workout_plan_weeks_template_idx
  on public.user_workout_plan_weeks(week_template_id, archived_at);
create index user_workout_plan_sessions_template_order_idx
  on public.user_workout_plan_sessions(week_template_id, sort_order, id);
create index user_workout_plan_phases_session_order_idx
  on public.user_workout_plan_phases(plan_session_id, sort_order, id);
create index user_workout_plan_activities_phase_order_idx
  on public.user_workout_plan_activities(plan_phase_id, sort_order, id);
create index user_workout_sessions_plan_week_idx on public.user_workout_sessions(plan_week_id);
create index user_workout_sessions_plan_session_idx on public.user_workout_sessions(plan_session_id);
create index workout_sessions_plan_week_idx on public.workout_sessions(plan_week_id);
create index workout_sessions_plan_session_idx on public.workout_sessions(plan_session_id);
create index user_exercise_logs_plan_activity_idx on public.user_exercise_logs(plan_activity_id);
create index exercise_logs_plan_activity_idx on public.exercise_logs(plan_activity_id);

create trigger user_workout_plan_week_templates_updated_at
before update on public.user_workout_plan_week_templates
for each row execute function public.set_updated_at();

create trigger user_workout_plan_weeks_updated_at
before update on public.user_workout_plan_weeks
for each row execute function public.set_updated_at();

create trigger user_workout_plan_sessions_updated_at
before update on public.user_workout_plan_sessions
for each row execute function public.set_updated_at();

create trigger user_workout_plan_phases_updated_at
before update on public.user_workout_plan_phases
for each row execute function public.set_updated_at();

create trigger user_workout_plan_activities_updated_at
before update on public.user_workout_plan_activities
for each row execute function public.set_updated_at();

create or replace function public.assert_train_phase2a_session_structure_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_plan_id uuid;
  source_plan_id uuid;
begin
  if new.source_legacy_plan_day_id is null then
    return new;
  end if;

  select template.plan_id
    into target_plan_id
  from public.user_workout_plan_week_templates template
  where template.id = new.week_template_id;

  select day.plan_id
    into source_plan_id
  from public.user_workout_plan_days day
  where day.id = new.source_legacy_plan_day_id;

  if target_plan_id is null or source_plan_id is null or target_plan_id <> source_plan_id then
    raise exception 'Phase 2 session legacy source must belong to the same workout plan.' using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke all on function public.assert_train_phase2a_session_structure_integrity()
from public, anon, authenticated, service_role;

create or replace function public.assert_train_phase2a_activity_structure_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  target_plan_id uuid;
  source_plan_id uuid;
begin
  if new.source_legacy_plan_exercise_id is null then
    return new;
  end if;

  select template.plan_id
    into target_plan_id
  from public.user_workout_plan_phases phase
  join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
  join public.user_workout_plan_week_templates template on template.id = session.week_template_id
  where phase.id = new.plan_phase_id;

  select day.plan_id
    into source_plan_id
  from public.user_workout_plan_exercises exercise
  join public.user_workout_plan_days day on day.id = exercise.plan_day_id
  where exercise.id = new.source_legacy_plan_exercise_id;

  if target_plan_id is null or source_plan_id is null or target_plan_id <> source_plan_id then
    raise exception 'Phase 2 activity legacy source must belong to the same workout plan.' using errcode = '23514';
  end if;

  return new;
end
$function$;

revoke all on function public.assert_train_phase2a_activity_structure_integrity()
from public, anon, authenticated, service_role;

create trigger user_workout_plan_sessions_structure_integrity
before insert or update of week_template_id, source_legacy_plan_day_id
on public.user_workout_plan_sessions
for each row execute function public.assert_train_phase2a_session_structure_integrity();

create trigger user_workout_plan_activities_structure_integrity
before insert or update of plan_phase_id, source_legacy_plan_exercise_id
on public.user_workout_plan_activities
for each row execute function public.assert_train_phase2a_activity_structure_integrity();

create or replace function public.assert_train_phase2a_bridge_integrity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  row_user_id uuid;
  row_plan_id uuid;
  week_plan_id uuid;
  week_template_id uuid;
  session_plan_id uuid;
  session_template_id uuid;
  activity_plan_id uuid;
begin
  if tg_table_name = 'user_workout_sessions' then
    row_user_id := new.user_id;
    row_plan_id := new.user_workout_plan_id;
  elsif tg_table_name = 'workout_sessions' then
    row_user_id := new.user_id;
    row_plan_id := new.plan_id;
  elsif tg_table_name = 'user_exercise_logs' then
    select scheduled.user_id, scheduled.user_workout_plan_id
      into row_user_id, row_plan_id
    from public.user_workout_sessions scheduled
    where scheduled.id = new.user_workout_session_id;
  elsif tg_table_name = 'exercise_logs' then
    select performed.user_id, performed.plan_id
      into row_user_id, row_plan_id
    from public.workout_sessions performed
    where performed.id = new.workout_session_id;
  end if;

  if tg_table_name in ('user_workout_sessions', 'workout_sessions') then
    if new.plan_week_id is not null then
      select week.plan_id, week.week_template_id
        into week_plan_id, week_template_id
      from public.user_workout_plan_weeks week
      where week.id = new.plan_week_id;

      if week_plan_id is null or row_plan_id is null or week_plan_id <> row_plan_id then
        raise exception 'Phase 2 plan-week bridge must belong to the row workout plan.' using errcode = '23514';
      end if;
    end if;

    if new.plan_session_id is not null then
      select template.plan_id, session.week_template_id
        into session_plan_id, session_template_id
      from public.user_workout_plan_sessions session
      join public.user_workout_plan_week_templates template on template.id = session.week_template_id
      where session.id = new.plan_session_id;

      if session_plan_id is null or row_plan_id is null or session_plan_id <> row_plan_id then
        raise exception 'Phase 2 plan-session bridge must belong to the row workout plan.' using errcode = '23514';
      end if;
    end if;

    if new.plan_week_id is not null and new.plan_session_id is not null
       and week_template_id <> session_template_id then
      raise exception 'Phase 2 plan-week and plan-session bridges must reference the same week template.' using errcode = '23514';
    end if;

    if row_plan_id is not null and not exists (
      select 1
      from public.user_workout_plans plan
      where plan.id = row_plan_id and plan.user_id = row_user_id
    ) then
      raise exception 'Phase 2 bridge owner does not match the workout-plan owner.' using errcode = '23514';
    end if;
  elsif new.plan_activity_id is not null then
    select template.plan_id
      into activity_plan_id
    from public.user_workout_plan_activities activity
    join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where activity.id = new.plan_activity_id;

    if activity_plan_id is null or row_plan_id is null or activity_plan_id <> row_plan_id then
      raise exception 'Phase 2 plan-activity bridge must belong to the parent session workout plan.' using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.user_workout_plans plan
      where plan.id = row_plan_id and plan.user_id = row_user_id
    ) then
      raise exception 'Phase 2 activity bridge owner does not match the workout-plan owner.' using errcode = '23514';
    end if;
  end if;

  return new;
end
$function$;

revoke all on function public.assert_train_phase2a_bridge_integrity() from public, anon, authenticated;

create trigger user_workout_sessions_phase2a_bridge_integrity
before insert or update of user_id, user_workout_plan_id, plan_week_id, plan_session_id
on public.user_workout_sessions
for each row execute function public.assert_train_phase2a_bridge_integrity();

create trigger workout_sessions_phase2a_bridge_integrity
before insert or update of user_id, plan_id, plan_week_id, plan_session_id
on public.workout_sessions
for each row execute function public.assert_train_phase2a_bridge_integrity();

create trigger user_exercise_logs_phase2a_bridge_integrity
before insert or update of user_workout_session_id, plan_activity_id
on public.user_exercise_logs
for each row execute function public.assert_train_phase2a_bridge_integrity();

create trigger exercise_logs_phase2a_bridge_integrity
before insert or update of workout_session_id, plan_activity_id
on public.exercise_logs
for each row execute function public.assert_train_phase2a_bridge_integrity();

create or replace function private.can_access_workout_plan(p_plan_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $function$
  select exists (
    select 1
    from public.user_workout_plans plan
    where plan.id = p_plan_id
      and (
        plan.user_id = (select auth.uid())
        or (select private.is_admin())
      )
  )
$function$;

revoke all on function private.can_access_workout_plan(uuid) from public, anon;
grant execute on function private.can_access_workout_plan(uuid) to authenticated, service_role;

alter table public.user_workout_plan_week_templates enable row level security;
alter table public.user_workout_plan_weeks enable row level security;
alter table public.user_workout_plan_sessions enable row level security;
alter table public.user_workout_plan_phases enable row level security;
alter table public.user_workout_plan_activities enable row level security;

create policy user_workout_plan_week_templates_own_all
on public.user_workout_plan_week_templates
for all to authenticated
using (private.can_access_workout_plan(plan_id))
with check (private.can_access_workout_plan(plan_id));

create policy user_workout_plan_weeks_own_all
on public.user_workout_plan_weeks
for all to authenticated
using (private.can_access_workout_plan(plan_id))
with check (private.can_access_workout_plan(plan_id));

create policy user_workout_plan_sessions_own_all
on public.user_workout_plan_sessions
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_week_templates template
    where template.id = public.user_workout_plan_sessions.week_template_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_week_templates template
    where template.id = public.user_workout_plan_sessions.week_template_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

create policy user_workout_plan_phases_own_all
on public.user_workout_plan_phases
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_sessions session
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where session.id = public.user_workout_plan_phases.plan_session_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_sessions session
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where session.id = public.user_workout_plan_phases.plan_session_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

create policy user_workout_plan_activities_own_all
on public.user_workout_plan_activities
for all to authenticated
using (
  exists (
    select 1
    from public.user_workout_plan_phases phase
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where phase.id = public.user_workout_plan_activities.plan_phase_id
      and private.can_access_workout_plan(template.plan_id)
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_phases phase
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where phase.id = public.user_workout_plan_activities.plan_phase_id
      and private.can_access_workout_plan(template.plan_id)
  )
);

revoke all on public.user_workout_plan_week_templates from public, anon;
revoke all on public.user_workout_plan_weeks from public, anon;
revoke all on public.user_workout_plan_sessions from public, anon;
revoke all on public.user_workout_plan_phases from public, anon;
revoke all on public.user_workout_plan_activities from public, anon;

grant select, insert, update, delete
on public.user_workout_plan_week_templates,
   public.user_workout_plan_weeks,
   public.user_workout_plan_sessions,
   public.user_workout_plan_phases,
   public.user_workout_plan_activities
to authenticated, service_role;

-- Deterministic local backfill. No external catalog access is performed.
insert into public.user_workout_plan_week_templates (
  plan_id,
  name,
  description,
  sort_order,
  source,
  archived_at,
  created_at,
  updated_at
)
select
  plan.id,
  plan.name || ' legacy template',
  plan.description,
  1,
  'legacy_backfill',
  plan.archived_at,
  plan.created_at,
  plan.updated_at
from public.user_workout_plans plan;

insert into public.user_workout_plan_weeks (
  plan_id,
  week_template_id,
  week_number,
  archived_at,
  created_at,
  updated_at
)
select
  plan.id,
  template.id,
  week_number,
  plan.archived_at,
  plan.created_at,
  plan.updated_at
from public.user_workout_plans plan
join public.user_workout_plan_week_templates template
  on template.plan_id = plan.id
 and template.source = 'legacy_backfill'
cross join lateral generate_series(
  1,
  case
    when plan.program_duration_weeks between 1 and 104 then plan.program_duration_weeks
    else 1
  end
) generated(week_number);

insert into public.user_workout_plan_sessions (
  week_template_id,
  source_legacy_plan_day_id,
  source,
  title,
  day_offset,
  weekday,
  sport_slug,
  sport_name_snapshot,
  session_type_slug,
  session_type_name_snapshot,
  duration_minutes,
  sort_order,
  notes,
  archived_at,
  created_at,
  updated_at
)
select
  template.id,
  day.id,
  'legacy_backfill',
  day.day_name,
  case lower(coalesce(day.weekday, ''))
    when 'sunday' then 0
    when 'monday' then 1
    when 'tuesday' then 2
    when 'wednesday' then 3
    when 'thursday' then 4
    when 'friday' then 5
    when 'saturday' then 6
    else (greatest(day.day_number, 1) - 1) % 7
  end,
  day.weekday,
  null,
  'Legacy training',
  null,
  null,
  coalesce(day.session_duration_minutes, plan.session_duration_minutes),
  greatest(day.day_number, 1),
  day.notes,
  day.archived_at,
  day.created_at,
  day.updated_at
from public.user_workout_plan_days day
join public.user_workout_plans plan on plan.id = day.plan_id
join public.user_workout_plan_week_templates template
  on template.plan_id = plan.id
 and template.source = 'legacy_backfill';

with mapped_legacy_exercises as (
  select
    session.id as plan_session_id,
    exercise.archived_at,
    coalesce(nullif(lower(btrim(exercise.block_type)), ''), '__null__') as normalized_block_type,
    case lower(coalesce(exercise.block_type, ''))
      when 'warmup' then 'warmup'
      when 'cardio' then 'conditioning'
      when 'cooldown' then 'cooldown'
      else 'main_work'
    end as phase_slug,
    case lower(coalesce(exercise.block_type, ''))
      when 'warmup' then 'Warm-up'
      when 'cardio' then 'Conditioning'
      when 'cooldown' then 'Cool-down'
      else 'Main work'
    end as phase_name_snapshot,
    case lower(coalesce(exercise.block_type, ''))
      when 'warmup' then 1
      when 'cardio' then 3
      when 'cooldown' then 4
      else 2
    end as phase_sort_order
  from public.user_workout_plan_sessions session
  join public.user_workout_plan_exercises exercise
    on exercise.plan_day_id = session.source_legacy_plan_day_id
), grouped_legacy_phases as (
  select
    plan_session_id,
    phase_slug,
    phase_name_snapshot,
    phase_sort_order,
    case
      when count(distinct normalized_block_type) = 1
        then nullif(min(normalized_block_type), '__null__')
      else 'mixed'
    end as source_legacy_block_type,
    case when bool_and(archived_at is not null) then max(archived_at) else null end as archived_at
  from mapped_legacy_exercises
  group by plan_session_id, phase_slug, phase_name_snapshot, phase_sort_order
)
insert into public.user_workout_plan_phases (
  plan_session_id,
  phase_slug,
  phase_name_snapshot,
  is_optional,
  source_legacy_block_type,
  sort_order,
  archived_at
)
select
  grouped.plan_session_id,
  grouped.phase_slug,
  grouped.phase_name_snapshot,
  false,
  grouped.source_legacy_block_type,
  grouped.phase_sort_order,
  coalesce(session.archived_at, grouped.archived_at)
from grouped_legacy_phases grouped
join public.user_workout_plan_sessions session on session.id = grouped.plan_session_id;

insert into public.user_workout_plan_activities (
  plan_phase_id,
  source_legacy_plan_exercise_id,
  legacy_source_workout_id,
  catalog_activity_id,
  catalog_slug,
  catalog_version,
  catalog_source,
  activity_name_snapshot,
  short_description_snapshot,
  activity_type_slug,
  activity_type_name_snapshot,
  instructions_snapshot,
  metric_schema_snapshot,
  planned_prescription,
  equipment_snapshot,
  taxonomy_snapshot,
  sort_order,
  notes,
  archived_at,
  created_at,
  updated_at
)
select
  phase.id,
  exercise.id,
  exercise.source_workout_id,
  null,
  null,
  null,
  'legacy',
  exercise.exercise_name,
  null,
  nullif(btrim(coalesce(exercise.category, '')), ''),
  nullif(btrim(coalesce(exercise.category, '')), ''),
  case
    when nullif(btrim(coalesce(exercise.instructions, '')), '') is null then null
    else jsonb_build_array(jsonb_build_object('order', 1, 'text', exercise.instructions))
  end,
  case
    when exercise.sets is not null
      or exercise.reps is not null
      or exercise.rest_seconds is not null
      or exercise.weight is not null
      or exercise.tempo is not null
    then jsonb_build_object(
      'slug', 'plaivra_legacy_strength_prescription_v1',
      'name', 'Plaivra legacy strength prescription',
      'fields', jsonb_build_array(
        jsonb_build_object('key', 'sets', 'label', 'Sets', 'type', 'integer', 'required', false),
        jsonb_build_object('key', 'reps', 'label', 'Reps', 'type', 'text', 'required', false),
        jsonb_build_object('key', 'rest_seconds', 'label', 'Rest', 'type', 'integer', 'unit', 'seconds', 'required', false),
        jsonb_build_object('key', 'weight', 'label', 'Weight', 'type', 'text', 'required', false),
        jsonb_build_object('key', 'tempo', 'label', 'Tempo', 'type', 'text', 'required', false)
      )
    )
    else null
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'sets', exercise.sets,
    'reps', exercise.reps,
    'rest_seconds', exercise.rest_seconds,
    'weight', exercise.weight,
    'tempo', exercise.tempo
  )),
  case
    when nullif(btrim(coalesce(exercise.equipment, '')), '') is null then null
    else jsonb_build_array(exercise.equipment)
  end,
  jsonb_strip_nulls(jsonb_build_object(
    'category', exercise.category,
    'target_muscle', exercise.target_muscle,
    'block_type', exercise.block_type
  )),
  greatest(exercise.sort_order, 1),
  exercise.notes,
  exercise.archived_at,
  exercise.created_at,
  exercise.created_at
from public.user_workout_plan_exercises exercise
join public.user_workout_plan_sessions session
  on session.source_legacy_plan_day_id = exercise.plan_day_id
join public.user_workout_plan_phases phase
  on phase.plan_session_id = session.id
 and phase.phase_slug = case lower(coalesce(exercise.block_type, ''))
   when 'warmup' then 'warmup'
   when 'cardio' then 'conditioning'
   when 'cooldown' then 'cooldown'
   else 'main_work'
 end;

-- Backfill only identities that are proven by unique legacy source columns.
update public.user_workout_sessions scheduled
set plan_session_id = phase2_session.id
from public.user_workout_plan_sessions phase2_session
where scheduled.plan_day_id = phase2_session.source_legacy_plan_day_id
  and scheduled.plan_session_id is null;

update public.workout_sessions performed
set plan_session_id = phase2_session.id
from public.user_workout_plan_sessions phase2_session
where performed.plan_day_id = phase2_session.source_legacy_plan_day_id
  and performed.plan_session_id is null;

update public.user_exercise_logs scheduled_log
set plan_activity_id = phase2_activity.id
from public.user_workout_plan_activities phase2_activity
where scheduled_log.plan_exercise_id = phase2_activity.source_legacy_plan_exercise_id
  and scheduled_log.plan_activity_id is null;

update public.exercise_logs performed_log
set plan_activity_id = phase2_activity.id
from public.user_workout_plan_activities phase2_activity
where performed_log.plan_exercise_id = phase2_activity.source_legacy_plan_exercise_id
  and performed_log.plan_activity_id is null;

-- Historical week_index is not sufficient proof of assigned-week identity.
-- Therefore Phase 2A intentionally leaves all legacy plan_week_id values null.

create or replace function public.detach_workout_plan_week_atomic(
  p_user_id uuid,
  p_plan_week_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  selected_week public.user_workout_plan_weeks%rowtype;
  original_template public.user_workout_plan_week_templates%rowtype;
  detached_template_id uuid;
  cloned_session_id uuid;
  cloned_phase_id uuid;
  source_session record;
  source_phase record;
begin
  perform public.assert_workout_actor(p_user_id);

  if p_plan_week_id is null then
    raise exception 'Training program week id is required.' using errcode = '23514';
  end if;

  select week.*
    into selected_week
  from public.user_workout_plan_weeks week
  where week.id = p_plan_week_id
  for update;

  if not found then
    raise exception 'Training program week not found.' using errcode = 'P0002';
  end if;

  perform 1
  from public.user_workout_plans plan
  where plan.id = selected_week.plan_id
    and plan.user_id = p_user_id
  for update;

  if not found then
    raise exception 'Workout data belongs to another user.' using errcode = '42501';
  end if;

  if selected_week.archived_at is not null then
    raise exception 'Archived training program weeks cannot be detached.' using errcode = '23514';
  end if;

  select template.*
    into original_template
  from public.user_workout_plan_week_templates template
  where template.id = selected_week.week_template_id
    and template.plan_id = selected_week.plan_id
  for update;

  if not found or original_template.archived_at is not null then
    raise exception 'The selected week template is unavailable.' using errcode = '23514';
  end if;

  if selected_week.is_detached then
    return jsonb_build_object(
      'plan_week_id', selected_week.id,
      'original_template_id', coalesce(original_template.derived_from_template_id, original_template.id),
      'detached_template_id', original_template.id,
      'clone_created', false
    );
  end if;

  -- Stabilize the complete source graph before copying it.
  perform 1
  from public.user_workout_plan_sessions session
  where session.week_template_id = original_template.id
    and session.archived_at is null
  for share;

  perform 1
  from public.user_workout_plan_phases phase
  join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
  where session.week_template_id = original_template.id
    and session.archived_at is null
    and phase.archived_at is null
  for share of phase;

  perform 1
  from public.user_workout_plan_activities activity
  join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
  join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
  where session.week_template_id = original_template.id
    and session.archived_at is null
    and phase.archived_at is null
    and activity.archived_at is null
  for share of activity;

  insert into public.user_workout_plan_week_templates (
    plan_id,
    name,
    description,
    sort_order,
    source,
    derived_from_template_id
  ) values (
    original_template.plan_id,
    original_template.name,
    original_template.description,
    original_template.sort_order,
    original_template.source,
    original_template.id
  ) returning id into detached_template_id;

  for source_session in
    select session.*
    from public.user_workout_plan_sessions session
    where session.week_template_id = original_template.id
      and session.archived_at is null
    order by session.sort_order, session.id
  loop
    insert into public.user_workout_plan_sessions (
      week_template_id,
      source_legacy_plan_day_id,
      source,
      title,
      day_offset,
      weekday,
      sport_slug,
      sport_name_snapshot,
      session_type_slug,
      session_type_name_snapshot,
      duration_minutes,
      sort_order,
      notes
    ) values (
      detached_template_id,
      null,
      source_session.source,
      source_session.title,
      source_session.day_offset,
      source_session.weekday,
      source_session.sport_slug,
      source_session.sport_name_snapshot,
      source_session.session_type_slug,
      source_session.session_type_name_snapshot,
      source_session.duration_minutes,
      source_session.sort_order,
      source_session.notes
    ) returning id into cloned_session_id;

    for source_phase in
      select phase.*
      from public.user_workout_plan_phases phase
      where phase.plan_session_id = source_session.id
        and phase.archived_at is null
      order by phase.sort_order, phase.id
    loop
      insert into public.user_workout_plan_phases (
        plan_session_id,
        phase_slug,
        phase_name_snapshot,
        is_optional,
        source_legacy_block_type,
        sort_order,
        notes
      ) values (
        cloned_session_id,
        source_phase.phase_slug,
        source_phase.phase_name_snapshot,
        source_phase.is_optional,
        source_phase.source_legacy_block_type,
        source_phase.sort_order,
        source_phase.notes
      ) returning id into cloned_phase_id;

      insert into public.user_workout_plan_activities (
        plan_phase_id,
        source_legacy_plan_exercise_id,
        legacy_source_workout_id,
        catalog_activity_id,
        catalog_slug,
        catalog_version,
        catalog_source,
        activity_name_snapshot,
        short_description_snapshot,
        activity_type_slug,
        activity_type_name_snapshot,
        instructions_snapshot,
        metric_schema_snapshot,
        planned_prescription,
        equipment_snapshot,
        taxonomy_snapshot,
        sort_order,
        notes
      )
      select
        cloned_phase_id,
        null,
        activity.legacy_source_workout_id,
        activity.catalog_activity_id,
        activity.catalog_slug,
        activity.catalog_version,
        activity.catalog_source,
        activity.activity_name_snapshot,
        activity.short_description_snapshot,
        activity.activity_type_slug,
        activity.activity_type_name_snapshot,
        activity.instructions_snapshot,
        activity.metric_schema_snapshot,
        activity.planned_prescription,
        activity.equipment_snapshot,
        activity.taxonomy_snapshot,
        activity.sort_order,
        activity.notes
      from public.user_workout_plan_activities activity
      where activity.plan_phase_id = source_phase.id
        and activity.archived_at is null
      order by activity.sort_order, activity.id;
    end loop;
  end loop;

  update public.user_workout_plan_weeks
  set week_template_id = detached_template_id,
      is_detached = true
  where id = selected_week.id;

  return jsonb_build_object(
    'plan_week_id', selected_week.id,
    'original_template_id', original_template.id,
    'detached_template_id', detached_template_id,
    'clone_created', true
  );
end
$function$;

revoke all on function public.detach_workout_plan_week_atomic(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function public.detach_workout_plan_week_atomic(uuid, uuid)
to authenticated, service_role;

do $phase2a_postflight$
declare
  expected_assigned_weeks bigint;
begin
  select coalesce(sum(
    case
      when plan.program_duration_weeks between 1 and 104 then plan.program_duration_weeks
      else 1
    end
  ), 0)
  into expected_assigned_weeks
  from public.user_workout_plans plan;

  if (select count(*) from public.user_workout_plan_week_templates where source = 'legacy_backfill')
     <> (select count(*) from public.user_workout_plans) then
    raise exception 'Train Phase 2A backfill incomplete: expected exactly one legacy week template per plan.';
  end if;

  if exists (
    select plan_id
    from public.user_workout_plan_week_templates
    where source = 'legacy_backfill'
    group by plan_id
    having count(*) <> 1
  ) then
    raise exception 'Train Phase 2A backfill created duplicate legacy week templates.';
  end if;

  if (select count(*) from public.user_workout_plan_weeks) <> expected_assigned_weeks then
    raise exception 'Train Phase 2A backfill incomplete: assigned-week count mismatch.';
  end if;

  if (select count(*) from public.user_workout_plan_sessions where source_legacy_plan_day_id is not null)
     <> (select count(*) from public.user_workout_plan_days) then
    raise exception 'Train Phase 2A backfill incomplete: legacy plan-day session count mismatch.';
  end if;

  if (select count(*) from public.user_workout_plan_activities where source_legacy_plan_exercise_id is not null)
     <> (select count(*) from public.user_workout_plan_exercises) then
    raise exception 'Train Phase 2A backfill incomplete: legacy plan-exercise activity count mismatch.';
  end if;

  if exists (
    select source_legacy_plan_day_id
    from public.user_workout_plan_sessions
    where source_legacy_plan_day_id is not null and archived_at is null
    group by source_legacy_plan_day_id
    having count(*) > 1
  ) then
    raise exception 'Train Phase 2A integrity failure: duplicate live legacy plan-day mapping.';
  end if;

  if exists (
    select source_legacy_plan_exercise_id
    from public.user_workout_plan_activities
    where source_legacy_plan_exercise_id is not null and archived_at is null
    group by source_legacy_plan_exercise_id
    having count(*) > 1
  ) then
    raise exception 'Train Phase 2A integrity failure: duplicate live legacy plan-exercise mapping.';
  end if;

  if exists (
    select 1
    from public.user_workout_plan_weeks week
    join public.user_workout_plan_week_templates template on template.id = week.week_template_id
    where week.plan_id <> template.plan_id
  ) then
    raise exception 'Train Phase 2A integrity failure: assigned week crosses workout plans.';
  end if;

  if exists (
    select 1
    from public.user_workout_sessions scheduled
    join public.user_workout_plan_sessions session on session.id = scheduled.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where scheduled.plan_session_id is not null
      and (template.plan_id <> scheduled.user_workout_plan_id
        or not exists (
          select 1 from public.user_workout_plans plan
          where plan.id = template.plan_id and plan.user_id = scheduled.user_id
        ))
  ) then
    raise exception 'Train Phase 2A integrity failure: scheduled-session bridge crosses owner or plan.';
  end if;

  if exists (
    select 1
    from public.workout_sessions performed
    join public.user_workout_plan_sessions session on session.id = performed.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where performed.plan_session_id is not null
      and (template.plan_id is distinct from performed.plan_id
        or not exists (
          select 1 from public.user_workout_plans plan
          where plan.id = template.plan_id and plan.user_id = performed.user_id
        ))
  ) then
    raise exception 'Train Phase 2A integrity failure: performed-session bridge crosses owner or plan.';
  end if;

  if exists (
    select 1
    from public.user_exercise_logs log
    join public.user_workout_sessions scheduled on scheduled.id = log.user_workout_session_id
    join public.user_workout_plan_activities activity on activity.id = log.plan_activity_id
    join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where log.plan_activity_id is not null
      and template.plan_id <> scheduled.user_workout_plan_id
  ) then
    raise exception 'Train Phase 2A integrity failure: scheduled activity bridge crosses plans.';
  end if;

  if exists (
    select 1
    from public.exercise_logs log
    join public.workout_sessions performed on performed.id = log.workout_session_id
    join public.user_workout_plan_activities activity on activity.id = log.plan_activity_id
    join public.user_workout_plan_phases phase on phase.id = activity.plan_phase_id
    join public.user_workout_plan_sessions session on session.id = phase.plan_session_id
    join public.user_workout_plan_week_templates template on template.id = session.week_template_id
    where log.plan_activity_id is not null
      and template.plan_id is distinct from performed.plan_id
  ) then
    raise exception 'Train Phase 2A integrity failure: performed activity bridge crosses plans.';
  end if;

  if exists (
    select 1
    from public.user_workout_plan_activities activity
    where jsonb_typeof(activity.planned_prescription) <> 'object'
       or (activity.metric_schema_snapshot is not null and jsonb_typeof(activity.metric_schema_snapshot) <> 'object')
       or (activity.instructions_snapshot is not null and jsonb_typeof(activity.instructions_snapshot) <> 'array')
       or (activity.taxonomy_snapshot is not null and jsonb_typeof(activity.taxonomy_snapshot) <> 'object')
  ) then
    raise exception 'Train Phase 2A integrity failure: malformed activity snapshot JSON.';
  end if;

  if exists (select 1 from public.user_workout_sessions where plan_week_id is not null)
     or exists (select 1 from public.workout_sessions where plan_week_id is not null) then
    raise exception 'Train Phase 2A incorrectly guessed historical assigned-week identity.';
  end if;
end
$phase2a_postflight$;

notify pgrst, 'reload schema';

commit;
