-- Additive convergence foundation for ADRs 0001-0003.
-- This migration does not drop, rename, or disable any compatibility table.

-- Performed sessions remain distinct from schedule instances.
alter table public.workout_sessions
  add column if not exists scheduled_session_id uuid
    references public.user_workout_sessions(id) on delete set null,
  add column if not exists source text not null default 'manual';

alter table public.workout_sessions
  drop constraint if exists workout_sessions_source_check;

alter table public.workout_sessions
  add constraint workout_sessions_source_check
  check (source in ('manual', 'chatgpt', 'schedule', 'backfill')) not valid;

create unique index if not exists workout_sessions_scheduled_session_uidx
  on public.workout_sessions(scheduled_session_id)
  where scheduled_session_id is not null;

alter table public.exercise_logs
  add column if not exists source_user_exercise_log_id uuid
    references public.user_exercise_logs(id) on delete set null,
  add column if not exists source text not null default 'manual';

alter table public.exercise_logs
  drop constraint if exists exercise_logs_source_check;

alter table public.exercise_logs
  add constraint exercise_logs_source_check
  check (source in ('manual', 'chatgpt', 'schedule_snapshot', 'backfill')) not valid;

create unique index if not exists exercise_logs_source_user_log_uidx
  on public.exercise_logs(source_user_exercise_log_id)
  where source_user_exercise_log_id is not null;

-- Link only one-to-one candidates. A user can have several schedule instances
-- for the same plan/day; choosing an arbitrary match would corrupt history.
with candidate_links as (
  select
    performed.id as performed_id,
    scheduled.id as scheduled_id,
    count(*) over (partition by performed.id) as performed_candidate_count,
    count(*) over (partition by scheduled.id) as scheduled_candidate_count
  from public.workout_sessions performed
  join public.user_workout_sessions scheduled
    on performed.user_id = scheduled.user_id
   and performed.plan_id = scheduled.user_workout_plan_id
   and performed.plan_day_id is not distinct from scheduled.plan_day_id
  where performed.scheduled_session_id is null
    and scheduled.status <> 'scheduled'
    and not exists (
      select 1
      from public.workout_sessions duplicate
      where duplicate.scheduled_session_id = scheduled.id
    )
), unambiguous_links as (
  select performed_id, scheduled_id
  from candidate_links
  where performed_candidate_count = 1 and scheduled_candidate_count = 1
)
update public.workout_sessions performed
set scheduled_session_id = scheduled.id,
    source = case when performed.source = 'manual' then 'schedule' else performed.source end
from unambiguous_links link
join public.user_workout_sessions scheduled on scheduled.id = link.scheduled_id
where performed.id = link.performed_id;

-- Preserve executed schedule instances that have no performed header yet.
insert into public.workout_sessions (
  user_id,
  workout_name,
  started_at,
  completed_at,
  duration_minutes,
  notes,
  status,
  plan_id,
  plan_day_id,
  workout_day_name,
  skipped_at,
  created_at,
  updated_at,
  scheduled_session_id,
  source
)
select
  scheduled.user_id,
  scheduled.day_title,
  coalesce(
    scheduled.started_at,
    scheduled.completed_at,
    scheduled.skipped_at,
    scheduled.scheduled_date::timestamp at time zone 'UTC'
  ),
  scheduled.completed_at,
  scheduled.duration_minutes,
  scheduled.notes,
  scheduled.status::public.workout_session_status,
  scheduled.user_workout_plan_id,
  scheduled.plan_day_id,
  scheduled.day_title,
  scheduled.skipped_at,
  scheduled.created_at,
  scheduled.updated_at,
  scheduled.id,
  'backfill'
from public.user_workout_sessions scheduled
where scheduled.status in ('started', 'completed', 'skipped')
  and not exists (
    select 1 from public.workout_sessions performed
    where performed.scheduled_session_id = scheduled.id
  );

-- A compatibility snapshot has only aggregate reps/weight. Preserve it as set 1,
-- link the source row, and do not invent additional performed sets.
insert into public.exercise_logs (
  workout_session_id,
  exercise_name,
  set_number,
  reps,
  weight_kg,
  notes,
  created_at,
  plan_exercise_id,
  planned_sets,
  planned_reps,
  completed_at,
  exercise_order,
  source_user_exercise_log_id,
  source
)
select
  performed.id,
  snapshot.exercise_name,
  1,
  snapshot.reps,
  snapshot.weight_kg,
  snapshot.notes,
  snapshot.created_at,
  snapshot.plan_exercise_id,
  case
    when snapshot.planned_sets ~ '^[0-9]{1,3}$'
      and snapshot.planned_sets::int between 1 and 100
      then snapshot.planned_sets::int
    else null
  end,
  snapshot.planned_reps,
  snapshot.completed_at,
  snapshot.exercise_order,
  snapshot.id,
  'backfill'
from public.user_exercise_logs snapshot
join public.workout_sessions performed
  on performed.scheduled_session_id = snapshot.user_workout_session_id
where not exists (
  select 1 from public.exercise_logs existing
  where existing.source_user_exercise_log_id = snapshot.id
);

-- The licensed/approved exercise definition table is the target catalog.
alter table public.exercises
  add column if not exists legacy_workout_id uuid
    references public.workouts(id) on delete set null;

create unique index if not exists exercises_legacy_workout_uidx
  on public.exercises(legacy_workout_id)
  where legacy_workout_id is not null;

insert into public.exercises (
  source,
  source_id,
  source_url,
  name,
  slug,
  primary_muscle,
  secondary_muscles,
  equipment,
  difficulty,
  mechanics,
  force_type,
  instructions,
  video_url,
  is_approved,
  is_global,
  created_at,
  updated_at,
  legacy_workout_id
)
select
  'plaivra_legacy_workouts',
  legacy.id::text,
  legacy.exercise_url,
  legacy.name,
  trim(both '-' from regexp_replace(lower(legacy.name), '[^a-z0-9]+', '-', 'g'))
    || '-' || left(legacy.id::text, 8),
  legacy.target_muscle,
  coalesce(legacy.secondary_muscles, '{}'::text[]),
  case when nullif(trim(legacy.equipment), '') is null then '{}'::text[] else array[legacy.equipment] end,
  legacy.difficulty,
  legacy.mechanics,
  legacy.force_type,
  legacy.instructions,
  legacy.exercise_url,
  true,
  legacy.is_global,
  legacy.created_at,
  legacy.updated_at,
  legacy.id
from public.workouts legacy
where not exists (
  select 1 from public.exercises target
  where target.legacy_workout_id = legacy.id
     or (target.source = 'plaivra_legacy_workouts' and target.source_id = legacy.id::text)
);

-- Saved recipes become the single saved meal/recipe/template owner model.
alter table public.saved_recipes
  add column if not exists saved_item_type text not null default 'recipe',
  add column if not exists meal_category text,
  add column if not exists is_favorite boolean not null default false,
  add column if not exists source_custom_meal_id uuid
    references public.custom_meals(id) on delete set null;

alter table public.saved_recipes
  drop constraint if exists saved_recipes_saved_item_type_check;

alter table public.saved_recipes
  add constraint saved_recipes_saved_item_type_check
  check (saved_item_type in ('meal', 'recipe', 'template')) not valid;

create unique index if not exists saved_recipes_source_custom_meal_uidx
  on public.saved_recipes(source_custom_meal_id)
  where source_custom_meal_id is not null;

alter table public.saved_recipe_ingredients
  add column if not exists source_custom_meal_item_id uuid
    references public.custom_meal_items(id) on delete set null;

create unique index if not exists saved_recipe_ingredients_source_custom_item_uidx
  on public.saved_recipe_ingredients(source_custom_meal_item_id)
  where source_custom_meal_item_id is not null;

insert into public.saved_recipes (
  user_id,
  name,
  portions,
  notes,
  created_at,
  updated_at,
  saved_item_type,
  meal_category,
  is_favorite,
  source_custom_meal_id
)
select
  legacy.user_id,
  legacy.meal_name,
  1,
  legacy.notes,
  legacy.created_at,
  legacy.updated_at,
  'meal',
  legacy.meal_category,
  legacy.is_favorite,
  legacy.id
from public.custom_meals legacy
where not exists (
  select 1 from public.saved_recipes target
  where target.source_custom_meal_id = legacy.id
);

insert into public.saved_recipe_ingredients (
  recipe_id,
  user_id,
  food_name,
  quantity,
  serving_unit,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  created_at,
  source_custom_meal_item_id
)
select
  target.id,
  legacy_meal.user_id,
  legacy_item.food_name,
  legacy_item.quantity,
  legacy_item.serving_size,
  legacy_item.calories,
  legacy_item.protein_g,
  legacy_item.carbs_g,
  legacy_item.fat_g,
  legacy_item.created_at,
  legacy_item.id
from public.custom_meal_items legacy_item
join public.custom_meals legacy_meal on legacy_meal.id = legacy_item.meal_id
join public.saved_recipes target on target.source_custom_meal_id = legacy_meal.id
where not exists (
  select 1 from public.saved_recipe_ingredients target_item
  where target_item.source_custom_meal_item_id = legacy_item.id
);

comment on column public.workout_sessions.scheduled_session_id is
  'ADR 0001 source link from a performed session to its optional schedule instance.';
comment on column public.exercises.legacy_workout_id is
  'ADR 0002 immutable backfill link; workouts remains a bounded compatibility source.';
comment on column public.saved_recipes.source_custom_meal_id is
  'ADR 0003 immutable backfill link; source rows are retained through cutover verification.';
