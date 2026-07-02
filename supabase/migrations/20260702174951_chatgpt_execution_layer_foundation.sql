-- Plaivra ChatGPT execution-layer foundation.
-- Additive only: ChatGPT remains the reasoning layer; these tables store user-owned
-- context, requests, preferences, targets, and execution state.

create table public.ai_action_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action_type text not null check (action_type in (
    'replace_exercise', 'adjust_next_workout', 'rebalance_week',
    'review_workout_session', 'adjust_for_low_readiness',
    'explain_progression', 'reduce_workout_volume',
    'reduce_workout_intensity', 'recovery_workout',
    'reduce_next_session', 'regenerate_meal', 'make_meal_cheaper',
    'make_meal_faster', 'make_meal_higher_protein',
    'replace_meal_ingredient', 'make_meal_dairy_free',
    'make_meal_gluten_free', 'make_meal_cuisine',
    'build_grocery_list', 'review_week'
  )),
  source_type text not null,
  source_id text,
  status text not null default 'ready_for_chatgpt' check (status in (
    'draft', 'ready_for_chatgpt', 'sent_to_chatgpt', 'resolved', 'cancelled'
  )),
  context_json jsonb not null default '{}'::jsonb check (jsonb_typeof(context_json) = 'object'),
  user_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.user_safety_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  injuries text[] not null default '{}',
  pain_areas text[] not null default '{}',
  medical_conditions text,
  doctor_restrictions text,
  medications_or_supplement_notes text,
  pregnancy_or_postpartum text,
  eating_disorder_risk_acknowledged boolean not null default false,
  under_18_flag boolean not null default false,
  movement_restrictions text,
  nutrition_restrictions text,
  risk_level text not null default 'green' check (risk_level in ('green', 'yellow', 'red')),
  emergency_warning_acknowledged boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_nutrition_preference_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  weekly_food_budget numeric(10,2) check (weekly_food_budget is null or weekly_food_budget >= 0),
  budget_currency text,
  max_cooking_time_minutes integer check (max_cooking_time_minutes is null or max_cooking_time_minutes between 0 and 1440),
  meal_prep_days text[] not null default '{}',
  cooking_skill text,
  kitchen_equipment text[] not null default '{}',
  preferred_cuisines text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  allergies text,
  repeat_tolerance text,
  meals_per_day integer check (meals_per_day is null or meals_per_day between 1 and 12),
  ingredient_reuse_preference text,
  grocery_style_preference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_progression_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_exercise_id uuid not null references public.user_workout_plan_exercises(id) on delete cascade,
  exercise_name text not null,
  next_target_weight_kg numeric(8,2) check (next_target_weight_kg is null or next_target_weight_kg >= 0),
  next_target_reps text,
  next_target_sets integer check (next_target_sets is null or next_target_sets > 0),
  progression_note text,
  ai_recommendation text,
  last_reviewed_at timestamptz,
  last_reviewed_by text check (last_reviewed_by is null or last_reviewed_by in ('user', 'chatgpt', 'system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, plan_exercise_id)
);

create table public.user_exercise_alternatives (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_exercise_id uuid not null references public.user_workout_plan_exercises(id) on delete cascade,
  original_exercise_name text not null,
  alternative_exercise_name text not null,
  reason text not null check (reason in (
    'machine_taken', 'no_equipment', 'pain_or_discomfort', 'too_hard',
    'home_alternative', 'same_muscle', 'lower_back_friendly',
    'knee_friendly', 'shoulder_friendly', 'other'
  )),
  target_muscle text,
  equipment text,
  pain_friendly_note text,
  created_by text not null default 'user' check (created_by in ('user', 'chatgpt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  source_meal_plan_item_id uuid references public.user_meal_plan_items(id) on delete set null,
  item_name text not null,
  quantity numeric(10,2) check (quantity is null or quantity >= 0),
  unit text,
  store_section text not null default 'Other' check (store_section in (
    'Protein', 'Carbs', 'Vegetables', 'Fruits', 'Dairy',
    'Pantry', 'Frozen', 'Drinks', 'Other'
  )),
  checked boolean not null default false,
  already_have boolean not null default false,
  notes text,
  created_by text not null default 'manual' check (created_by in ('manual', 'meal_plan', 'chatgpt')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  checkin_type text not null check (checkin_type in ('morning', 'evening')),
  sleep_hours numeric(4,1) check (sleep_hours is null or sleep_hours between 0 and 24),
  energy_level text,
  soreness_level text,
  stress_level text,
  motivation_level text,
  workout_readiness text,
  today_main_goal text,
  today_blocker text,
  workout_done boolean,
  protein_hit boolean,
  calories_hit boolean,
  water_hit boolean,
  steps_or_movement_done boolean,
  meal_plan_followed boolean,
  main_blocker text,
  tomorrow_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, checkin_date, checkin_type)
);

create table public.user_nutrition_target_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('default_day', 'training_day', 'rest_day', 'high_activity_day')),
  calories integer check (calories is null or calories between 0 and 15000),
  protein_g numeric(8,2) check (protein_g is null or protein_g between 0 and 1000),
  carbs_g numeric(8,2) check (carbs_g is null or carbs_g between 0 and 2000),
  fat_g numeric(8,2) check (fat_g is null or fat_g between 0 and 1000),
  water_ml integer check (water_ml is null or water_ml between 0 and 20000),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, target_type)
);

alter table public.workout_sessions
  add column if not exists skip_reason text,
  add column if not exists skip_followup_action text;

alter table public.workout_sessions
  drop constraint if exists workout_sessions_skip_reason_check,
  add constraint workout_sessions_skip_reason_check check (
    skip_reason is null or skip_reason in ('no_time', 'low_energy', 'sick', 'pain', 'travel', 'gym_closed', 'too_sore', 'other')
  ),
  drop constraint if exists workout_sessions_skip_followup_action_check,
  add constraint workout_sessions_skip_followup_action_check check (
    skip_followup_action is null or skip_followup_action in ('move_to_tomorrow', 'skip_and_continue', 'rebalance_week', 'reduce_next_session')
  );

create index idx_ai_action_requests_user_status_created on public.ai_action_requests(user_id, status, created_at desc);
create index idx_user_progression_targets_user_exercise on public.user_progression_targets(user_id, plan_exercise_id);
create index idx_user_exercise_alternatives_user_exercise on public.user_exercise_alternatives(user_id, plan_exercise_id, created_at desc);
create index idx_user_grocery_items_user_week_section on public.user_grocery_items(user_id, week_start, store_section);
create index idx_user_daily_checkins_user_date on public.user_daily_checkins(user_id, checkin_date desc);
create index idx_user_nutrition_target_profiles_user_type on public.user_nutrition_target_profiles(user_id, target_type);

alter table public.ai_action_requests enable row level security;
alter table public.user_safety_profiles enable row level security;
alter table public.user_nutrition_preference_profiles enable row level security;
alter table public.user_progression_targets enable row level security;
alter table public.user_exercise_alternatives enable row level security;
alter table public.user_grocery_items enable row level security;
alter table public.user_daily_checkins enable row level security;
alter table public.user_nutrition_target_profiles enable row level security;

revoke all on table public.ai_action_requests from anon;
revoke all on table public.user_safety_profiles from anon;
revoke all on table public.user_nutrition_preference_profiles from anon;
revoke all on table public.user_progression_targets from anon;
revoke all on table public.user_exercise_alternatives from anon;
revoke all on table public.user_grocery_items from anon;
revoke all on table public.user_daily_checkins from anon;
revoke all on table public.user_nutrition_target_profiles from anon;

grant select, insert, update, delete on table public.ai_action_requests to authenticated;
grant select, insert, update, delete on table public.user_safety_profiles to authenticated;
grant select, insert, update, delete on table public.user_nutrition_preference_profiles to authenticated;
grant select, insert, update, delete on table public.user_progression_targets to authenticated;
grant select, insert, update, delete on table public.user_exercise_alternatives to authenticated;
grant select, insert, update, delete on table public.user_grocery_items to authenticated;
grant select, insert, update, delete on table public.user_daily_checkins to authenticated;
grant select, insert, update, delete on table public.user_nutrition_target_profiles to authenticated;

grant all on table public.ai_action_requests to service_role;
grant all on table public.user_safety_profiles to service_role;
grant all on table public.user_nutrition_preference_profiles to service_role;
grant all on table public.user_progression_targets to service_role;
grant all on table public.user_exercise_alternatives to service_role;
grant all on table public.user_grocery_items to service_role;
grant all on table public.user_daily_checkins to service_role;
grant all on table public.user_nutrition_target_profiles to service_role;

create policy ai_action_requests_select_own on public.ai_action_requests
  for select to authenticated using ((select auth.uid()) = user_id);
create policy ai_action_requests_insert_own on public.ai_action_requests
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ai_action_requests_update_own on public.ai_action_requests
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ai_action_requests_delete_own on public.ai_action_requests
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_safety_profiles_select_own on public.user_safety_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_safety_profiles_insert_own on public.user_safety_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_safety_profiles_update_own on public.user_safety_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_safety_profiles_delete_own on public.user_safety_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_nutrition_preferences_select_own on public.user_nutrition_preference_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_nutrition_preferences_insert_own on public.user_nutrition_preference_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_nutrition_preferences_update_own on public.user_nutrition_preference_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_nutrition_preferences_delete_own on public.user_nutrition_preference_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_progression_targets_select_own on public.user_progression_targets
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_progression_targets_insert_own on public.user_progression_targets
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );
create policy user_progression_targets_update_own on public.user_progression_targets
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );
create policy user_progression_targets_delete_own on public.user_progression_targets
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_exercise_alternatives_select_own on public.user_exercise_alternatives
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_exercise_alternatives_insert_own on public.user_exercise_alternatives
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );
create policy user_exercise_alternatives_update_own on public.user_exercise_alternatives
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.user_workout_plan_exercises exercise
      join public.user_workout_plan_days day on day.id = exercise.plan_day_id
      join public.user_workout_plans plan on plan.id = day.plan_id
      where exercise.id = plan_exercise_id and plan.user_id = (select auth.uid())
    )
  );
create policy user_exercise_alternatives_delete_own on public.user_exercise_alternatives
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_grocery_items_select_own on public.user_grocery_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_grocery_items_insert_own on public.user_grocery_items
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (
      source_meal_plan_item_id is null
      or exists (
        select 1 from public.user_meal_plan_items meal
        where meal.id = source_meal_plan_item_id and meal.user_id = (select auth.uid())
      )
    )
  );
create policy user_grocery_items_update_own on public.user_grocery_items
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (
      source_meal_plan_item_id is null
      or exists (
        select 1 from public.user_meal_plan_items meal
        where meal.id = source_meal_plan_item_id and meal.user_id = (select auth.uid())
      )
    )
  );
create policy user_grocery_items_delete_own on public.user_grocery_items
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_daily_checkins_select_own on public.user_daily_checkins
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_daily_checkins_insert_own on public.user_daily_checkins
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_daily_checkins_update_own on public.user_daily_checkins
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_daily_checkins_delete_own on public.user_daily_checkins
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_nutrition_targets_select_own on public.user_nutrition_target_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_nutrition_targets_insert_own on public.user_nutrition_target_profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_nutrition_targets_update_own on public.user_nutrition_target_profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_nutrition_targets_delete_own on public.user_nutrition_target_profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

create trigger ai_action_requests_updated_at before update on public.ai_action_requests
  for each row execute function public.set_updated_at();
create trigger user_safety_profiles_updated_at before update on public.user_safety_profiles
  for each row execute function public.set_updated_at();
create trigger user_nutrition_preferences_updated_at before update on public.user_nutrition_preference_profiles
  for each row execute function public.set_updated_at();
create trigger user_progression_targets_updated_at before update on public.user_progression_targets
  for each row execute function public.set_updated_at();
create trigger user_exercise_alternatives_updated_at before update on public.user_exercise_alternatives
  for each row execute function public.set_updated_at();
create trigger user_grocery_items_updated_at before update on public.user_grocery_items
  for each row execute function public.set_updated_at();
create trigger user_daily_checkins_updated_at before update on public.user_daily_checkins
  for each row execute function public.set_updated_at();
create trigger user_nutrition_target_profiles_updated_at before update on public.user_nutrition_target_profiles
  for each row execute function public.set_updated_at();
