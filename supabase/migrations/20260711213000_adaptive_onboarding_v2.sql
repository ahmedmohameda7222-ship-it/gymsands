-- Adaptive seven-section onboarding. This migration is additive and preserves
-- existing rows while removing personal-data defaults from future drafts.

alter table public.onboarding_answers
  add column if not exists primary_goal text,
  add column if not exists primary_sport text,
  add column if not exists primary_sport_other text,
  add column if not exists secondary_sports text[] not null default '{}'::text[],
  add column if not exists activity_level text,
  add column if not exists available_days text[] not null default '{}'::text[],
  add column if not exists preferred_workout_time text,
  add column if not exists liked_activities text[] not null default '{}'::text[],
  add column if not exists disliked_activities text[] not null default '{}'::text[],
  add column if not exists sport_details jsonb not null default '{}'::jsonb;

alter table public.onboarding_answers
  alter column age_range drop not null,
  alter column gender drop not null,
  alter column height_cm drop not null,
  alter column weight_kg drop not null,
  alter column goal drop not null,
  alter column training_level drop not null,
  alter column training_place drop not null,
  alter column training_days_per_week drop not null,
  alter column workout_duration_minutes drop not null;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_setup_stage_check,
  add constraint onboarding_answers_setup_stage_check check (setup_stage between 0 and 6) not valid,
  drop constraint if exists onboarding_answers_sport_details_object_check,
  add constraint onboarding_answers_sport_details_object_check check (jsonb_typeof(sport_details) = 'object') not valid;

alter table public.user_nutrition_preference_profiles
  add column if not exists nutrition_goal text,
  add column if not exists liked_foods text[] not null default '{}'::text[],
  add column if not exists allergy_items text[] not null default '{}'::text[],
  add column if not exists dietary_restrictions text[] not null default '{}'::text[],
  add column if not exists meal_prep_preference text,
  add column if not exists eating_schedule text,
  add column if not exists supplements text[] not null default '{}'::text[],
  add column if not exists tracks_calories_or_macros boolean;

alter table public.user_fitness_constraints
  add column if not exists pain_sensitive_areas text[] not null default '{}'::text[],
  add column if not exists movements_to_avoid text,
  add column if not exists discomfort_exercises text[] not null default '{}'::text[],
  add column if not exists mobility_limitations text,
  add column if not exists professional_restrictions text;

comment on column public.onboarding_answers.sport_details is
  'Explicit user-provided details relevant only to the selected primary sport. Hidden fields are removed before persistence.';
comment on column public.user_fitness_constraints.professional_restrictions is
  'Optional user-authored practical restrictions from a doctor or physiotherapist; Plaivra does not diagnose or interpret them.';

create or replace function public.complete_adaptive_onboarding_v2(
  p_onboarding jsonb,
  p_nutrition jsonb,
  p_constraints jsonb,
  p_permissions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_age integer;
  v_goals text[];
  v_primary_goal text;
  v_primary_sport text;
  v_training_days integer;
  v_duration integer;
  v_meals integer;
  v_access_mode text;
  v_requested_scopes text[];
  v_scopes text[];
  v_completed_at timestamptz := now();
  v_normal_scopes constant text[] := array[
    'plaivra.workouts.read','plaivra.workouts.write',
    'plaivra.nutrition.read','plaivra.nutrition.write',
    'plaivra.meal_plans.read','plaivra.meal_plans.write',
    'plaivra.hydration.read','plaivra.hydration.write',
    'plaivra.progress.read','plaivra.progress.write',
    'plaivra.wellness.read','plaivra.wellness.write',
    'plaivra.profile.read','plaivra.profile.write',
    'plaivra.settings.read','plaivra.settings.write'
  ];
begin
  if v_user_id is null then raise exception 'Authentication is required.' using errcode = '42501'; end if;
  if jsonb_typeof(p_onboarding) <> 'object' or jsonb_typeof(p_nutrition) <> 'object' or jsonb_typeof(p_constraints) <> 'object' or jsonb_typeof(p_permissions) <> 'object' then
    raise exception 'Invalid onboarding payload.' using errcode = '22023';
  end if;

  v_age := nullif(p_onboarding ->> 'age', '')::integer;
  if v_age is null or v_age < 16 or v_age > 100 then raise exception 'Age must be between 16 and 100.' using errcode = '22023'; end if;
  if jsonb_typeof(p_onboarding -> 'goals') <> 'array' then raise exception 'At least one goal is required.' using errcode = '22023'; end if;
  select coalesce(array_agg(distinct value), '{}'::text[]) into v_goals from jsonb_array_elements_text(p_onboarding -> 'goals') as goal(value) where btrim(value) <> '';
  if cardinality(v_goals) = 0 then raise exception 'At least one goal is required.' using errcode = '22023'; end if;
  v_primary_goal := nullif(btrim(p_onboarding ->> 'primary_goal'), '');
  if v_primary_goal is null or not (v_primary_goal = any(v_goals)) then raise exception 'Primary goal must be one of the selected goals.' using errcode = '22023'; end if;
  v_primary_sport := nullif(btrim(p_onboarding ->> 'primary_sport'), '');
  if v_primary_sport is null then raise exception 'Primary sport is required.' using errcode = '22023'; end if;
  if v_primary_sport = 'other' and nullif(btrim(p_onboarding ->> 'primary_sport_other'), '') is null then raise exception 'A custom sport value is required.' using errcode = '22023'; end if;
  if nullif(btrim(p_onboarding ->> 'training_level'), '') is null or nullif(btrim(p_onboarding ->> 'training_place'), '') is null or nullif(btrim(p_onboarding ->> 'activity_level'), '') is null or nullif(btrim(p_onboarding ->> 'preferred_workout_time'), '') is null then raise exception 'Required training profile fields are missing.' using errcode = '22023'; end if;
  v_training_days := nullif(p_onboarding ->> 'training_days_per_week', '')::integer;
  v_duration := nullif(p_onboarding ->> 'workout_duration_minutes', '')::integer;
  if v_training_days is null or v_training_days not between 1 and 7 then raise exception 'Training days must be between 1 and 7.' using errcode = '22023'; end if;
  if v_duration is null or v_duration not between 10 and 240 then raise exception 'Session duration must be between 10 and 240 minutes.' using errcode = '22023'; end if;
  if jsonb_typeof(p_onboarding -> 'available_days') <> 'array' or jsonb_array_length(p_onboarding -> 'available_days') = 0 then raise exception 'At least one available day is required.' using errcode = '22023'; end if;

  if nullif(btrim(p_nutrition ->> 'nutrition_goal'), '') is null then raise exception 'Nutrition goal is required.' using errcode = '22023'; end if;
  v_meals := nullif(p_nutrition ->> 'meals_per_day', '')::integer;
  if v_meals is null or v_meals not between 1 and 12 then raise exception 'Daily meal count must be between 1 and 12.' using errcode = '22023'; end if;
  if jsonb_typeof(p_nutrition -> 'preferred_cuisines') <> 'array' or jsonb_array_length(p_nutrition -> 'preferred_cuisines') = 0 then raise exception 'A cuisine choice or explicit no-preference choice is required.' using errcode = '22023'; end if;

  v_access_mode := p_permissions ->> 'access_mode';
  if v_access_mode not in ('full', 'custom') then raise exception 'ChatGPT access mode must be full or custom.' using errcode = '22023'; end if;
  if v_access_mode = 'full' then
    v_scopes := array_prepend('plaivra.full_access', v_normal_scopes);
  else
    if jsonb_typeof(p_permissions -> 'scopes') <> 'array' then raise exception 'Custom permission scopes must be an array.' using errcode = '22023'; end if;
    select coalesce(array_agg(distinct value), '{}'::text[]) into v_requested_scopes from jsonb_array_elements_text(p_permissions -> 'scopes') as scope(value);
    if exists (select 1 from unnest(v_requested_scopes) as requested(scope) where not (requested.scope = any(v_normal_scopes))) then raise exception 'Unsupported ChatGPT permission scope.' using errcode = '22023'; end if;
    v_scopes := v_requested_scopes;
  end if;

  insert into public.onboarding_answers (
    user_id, age, age_range, gender, height_cm, weight_kg, goal_weight_kg, goal, goals, primary_goal, primary_sport, primary_sport_other,
    secondary_sports, training_level, training_place, activity_level, training_days_per_week, available_days, workout_duration_minutes,
    min_workout_duration_minutes, max_workout_duration_minutes, preferred_workout_time, liked_activities, disliked_activities, sport_details,
    available_equipment, nutrition_preferences, setup_stage, completed_at
  ) values (
    v_user_id, v_age, nullif(p_onboarding ->> 'age_range', ''), nullif(p_onboarding ->> 'gender', ''), nullif(p_onboarding ->> 'height_cm', '')::numeric,
    nullif(p_onboarding ->> 'weight_kg', '')::numeric, nullif(p_onboarding ->> 'goal_weight_kg', '')::numeric, array_to_string(v_goals, ', '), v_goals,
    v_primary_goal, v_primary_sport, nullif(p_onboarding ->> 'primary_sport_other', ''), coalesce(array(select jsonb_array_elements_text(p_onboarding -> 'secondary_sports')), '{}'::text[]),
    nullif(p_onboarding ->> 'training_level', ''), nullif(p_onboarding ->> 'training_place', ''), nullif(p_onboarding ->> 'activity_level', ''), v_training_days,
    array(select jsonb_array_elements_text(p_onboarding -> 'available_days')), v_duration, v_duration, v_duration, nullif(p_onboarding ->> 'preferred_workout_time', ''),
    coalesce(array(select jsonb_array_elements_text(p_onboarding -> 'liked_activities')), '{}'::text[]), coalesce(array(select jsonb_array_elements_text(p_onboarding -> 'disliked_activities')), '{}'::text[]),
    coalesce(p_onboarding -> 'sport_details', '{}'::jsonb), coalesce(array(select jsonb_array_elements_text(p_onboarding -> 'available_equipment')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_onboarding -> 'nutrition_preferences')), '{}'::text[]), 6, null
  ) on conflict (user_id) do update set
    age = excluded.age, age_range = excluded.age_range, gender = excluded.gender, height_cm = excluded.height_cm, weight_kg = excluded.weight_kg,
    goal_weight_kg = excluded.goal_weight_kg, goal = excluded.goal, goals = excluded.goals, primary_goal = excluded.primary_goal, primary_sport = excluded.primary_sport,
    primary_sport_other = excluded.primary_sport_other, secondary_sports = excluded.secondary_sports, training_level = excluded.training_level, training_place = excluded.training_place,
    activity_level = excluded.activity_level, training_days_per_week = excluded.training_days_per_week, available_days = excluded.available_days,
    workout_duration_minutes = excluded.workout_duration_minutes, min_workout_duration_minutes = excluded.min_workout_duration_minutes,
    max_workout_duration_minutes = excluded.max_workout_duration_minutes, preferred_workout_time = excluded.preferred_workout_time,
    liked_activities = excluded.liked_activities, disliked_activities = excluded.disliked_activities, sport_details = excluded.sport_details,
    available_equipment = excluded.available_equipment, nutrition_preferences = excluded.nutrition_preferences, setup_stage = 6, completed_at = null, updated_at = now();

  insert into public.user_nutrition_preference_profiles (
    user_id, nutrition_goal, meals_per_day, preferred_cuisines, liked_foods, disliked_foods, allergy_items, dietary_restrictions, cooking_skill,
    max_cooking_time_minutes, meal_prep_preference, weekly_food_budget, budget_currency, eating_schedule, supplements, tracks_calories_or_macros
  ) values (
    v_user_id, nullif(p_nutrition ->> 'nutrition_goal', ''), v_meals, coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'preferred_cuisines')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'liked_foods')), '{}'::text[]), coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'disliked_foods')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'allergy_items')), '{}'::text[]), coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'dietary_restrictions')), '{}'::text[]),
    nullif(p_nutrition ->> 'cooking_skill', ''), nullif(p_nutrition ->> 'max_cooking_time_minutes', '')::integer, nullif(p_nutrition ->> 'meal_prep_preference', ''),
    nullif(p_nutrition ->> 'weekly_food_budget', '')::numeric, nullif(p_nutrition ->> 'budget_currency', ''), nullif(p_nutrition ->> 'eating_schedule', ''),
    coalesce(array(select jsonb_array_elements_text(p_nutrition -> 'supplements')), '{}'::text[]), case when p_nutrition ? 'tracks_calories_or_macros' then (p_nutrition ->> 'tracks_calories_or_macros')::boolean else null end
  ) on conflict (user_id) do update set
    nutrition_goal = excluded.nutrition_goal, meals_per_day = excluded.meals_per_day, preferred_cuisines = excluded.preferred_cuisines,
    liked_foods = excluded.liked_foods, disliked_foods = excluded.disliked_foods, allergy_items = excluded.allergy_items,
    dietary_restrictions = excluded.dietary_restrictions, cooking_skill = excluded.cooking_skill, max_cooking_time_minutes = excluded.max_cooking_time_minutes,
    meal_prep_preference = excluded.meal_prep_preference, weekly_food_budget = excluded.weekly_food_budget, budget_currency = excluded.budget_currency,
    eating_schedule = excluded.eating_schedule, supplements = excluded.supplements, tracks_calories_or_macros = excluded.tracks_calories_or_macros, updated_at = now();

  insert into public.user_fitness_constraints (
    user_id, injury_or_limitation_labels, areas_to_protect, pain_sensitive_areas, movement_restrictions, movements_to_avoid,
    discomfort_exercises, mobility_limitations, professional_restrictions, legacy_context_notes
  ) values (
    v_user_id, coalesce(array(select jsonb_array_elements_text(p_constraints -> 'injury_or_limitation_labels')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_constraints -> 'pain_sensitive_areas')), '{}'::text[]),
    coalesce(array(select jsonb_array_elements_text(p_constraints -> 'pain_sensitive_areas')), '{}'::text[]),
    nullif(p_constraints ->> 'movements_to_avoid', ''), nullif(p_constraints ->> 'movements_to_avoid', ''),
    coalesce(array(select jsonb_array_elements_text(p_constraints -> 'discomfort_exercises')), '{}'::text[]),
    nullif(p_constraints ->> 'mobility_limitations', ''), nullif(p_constraints ->> 'professional_restrictions', ''), nullif(p_constraints ->> 'legacy_context_notes', '')
  ) on conflict (user_id) do update set
    injury_or_limitation_labels = excluded.injury_or_limitation_labels, areas_to_protect = excluded.areas_to_protect,
    pain_sensitive_areas = excluded.pain_sensitive_areas, movement_restrictions = excluded.movement_restrictions,
    movements_to_avoid = excluded.movements_to_avoid, discomfort_exercises = excluded.discomfort_exercises,
    mobility_limitations = excluded.mobility_limitations, professional_restrictions = excluded.professional_restrictions,
    legacy_context_notes = coalesce(excluded.legacy_context_notes, public.user_fitness_constraints.legacy_context_notes), updated_at = now();

  insert into public.user_ai_permission_settings (user_id, access_mode, scopes)
  values (v_user_id, v_access_mode, v_scopes)
  on conflict (user_id) do update set access_mode = excluded.access_mode, scopes = excluded.scopes, updated_at = now();

  update public.profiles set target_weight_kg = nullif(p_onboarding ->> 'goal_weight_kg', '')::numeric, body_goal = array_to_string(v_goals, ', '), updated_at = now() where id = v_user_id;
  update public.onboarding_answers set completed_at = v_completed_at, setup_stage = 6, updated_at = now() where user_id = v_user_id;
  return jsonb_build_object('user_id', v_user_id, 'completed_at', v_completed_at);
end;
$$;

revoke all on function public.complete_adaptive_onboarding_v2(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.complete_adaptive_onboarding_v2(jsonb, jsonb, jsonb, jsonb) to authenticated;
create index if not exists onboarding_answers_completion_user_idx on public.onboarding_answers (user_id, completed_at);
notify pgrst, 'reload schema';
