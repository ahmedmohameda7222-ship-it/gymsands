-- Plaivra clean initial schema reconstructed from the application schema contracts.
-- Historical source migrations are archived and are not discovered by Supabase.
-- Security/privacy/MCP restrictions are finalized by 202606290001.

-- Private application data is never exposed to the anonymous Data API role,
-- including during a clean rebuild before the hardening migration runs.
revoke usage on schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;


-- ===== Consolidated source: 001_initial_schema.sql =====

-- S&S Gym initial Supabase schema
-- Paste this file into Supabase SQL Editor and run it before seed files.

create extension if not exists "pgcrypto";

create type public.user_role as enum ('member', 'admin');
create type public.workout_session_status as enum ('started', 'completed');
create type public.welcome_frequency as enum ('every_login', 'once_per_day');

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role public.user_role not null default 'member',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  age_range text not null,
  gender text not null,
  height_cm numeric(5,2) not null check (height_cm > 0),
  weight_kg numeric(6,2) not null check (weight_kg > 0),
  goal text not null,
  training_level text not null,
  training_place text not null,
  training_days_per_week int not null check (training_days_per_week between 1 and 7),
  workout_duration_minutes int not null check (workout_duration_minutes > 0),
  nutrition_preferences text[] not null default '{}',
  allergies_limitations text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table public.calorie_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  daily_calories int not null default 2200 check (daily_calories > 0),
  protein_g numeric(7,2) not null default 150 check (protein_g >= 0),
  carbs_g numeric(7,2) not null default 250 check (carbs_g >= 0),
  fat_g numeric(7,2) not null default 70 check (fat_g >= 0),
  water_ml int not null default 2500 check (water_ml >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  food_name text not null,
  serving_size text not null,
  calories numeric(8,2) not null check (calories >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbs_g numeric(8,2) not null check (carbs_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  category text,
  cuisine text,
  tags text[] default '{}',
  notes text,
  source_type text not null default 'admin_created',
  is_global boolean not null default true,
  is_editable_by_user boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_food_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_name text not null,
  serving_size text not null,
  calories numeric(8,2) not null check (calories >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbs_g numeric(8,2) not null check (carbs_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  category text,
  tags text[] default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.food_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  user_food_item_id uuid references public.user_food_items(id) on delete set null,
  log_date date not null default current_date,
  meal_type text not null default 'Meal',
  food_name text not null,
  serving_size text not null,
  quantity numeric(8,3) not null check (quantity > 0),
  calories numeric(8,2) not null check (calories >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbs_g numeric(8,2) not null check (carbs_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_name text not null,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_food_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  user_food_item_id uuid references public.user_food_items(id) on delete set null,
  quantity numeric(8,3) not null check (quantity > 0),
  created_at timestamptz not null default now()
);

create table public.exercise_library (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  category text,
  target_muscle text,
  equipment text,
  difficulty text,
  instructions text,
  notes text,
  is_global boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  target_muscle text not null,
  equipment text not null,
  difficulty text not null,
  sets int check (sets is null or sets > 0),
  reps text,
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  instructions text not null,
  notes text,
  is_global boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts(id) on delete cascade,
  exercise_id uuid references public.exercise_library(id) on delete set null,
  exercise_name text not null,
  sort_order int not null default 1,
  sets int,
  reps text,
  rest_seconds int,
  notes text,
  created_at timestamptz not null default now()
);

create table public.exercise_videos (
  id uuid primary key default gen_random_uuid(),
  exercise_name text not null,
  category_type text,
  category text,
  exercise_url text not null,
  video_url text,
  instructions text,
  source text default 'admin_created',
  is_global boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(exercise_name, category_type, category)
);

create table public.workout_video_imports (
  id uuid primary key default gen_random_uuid(),
  imported_by uuid references public.profiles(id) on delete set null default auth.uid(),
  file_name text,
  status text not null default 'queued',
  imported_count int not null default 0,
  unmatched_count int not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  workout_name text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  status public.workout_session_status not null default 'started',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_name text not null,
  set_number int not null check (set_number > 0),
  reps int check (reps is null or reps >= 0),
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table public.progress_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  entry_date date not null default current_date,
  body_weight_kg numeric(6,2) check (body_weight_kg is null or body_weight_kg > 0),
  waist_cm numeric(6,2) check (waist_cm is null or waist_cm > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress_entry_id uuid references public.progress_entries(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  progress_entry_id uuid references public.progress_entries(id) on delete cascade,
  measured_at date not null default current_date,
  waist_cm numeric(6,2),
  hips_cm numeric(6,2),
  chest_cm numeric(6,2),
  bust_cm numeric(6,2),
  underbust_cm numeric(6,2),
  neck_cm numeric(6,2),
  shoulders_cm numeric(6,2),
  left_arm_cm numeric(6,2),
  right_arm_cm numeric(6,2),
  left_thigh_cm numeric(6,2),
  right_thigh_cm numeric(6,2),
  glutes_cm numeric(6,2),
  calves_cm numeric(6,2),
  created_at timestamptz not null default now()
);

create table public.user_welcome_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  popup_enabled boolean not null default true,
  show_frequency public.welcome_frequency not null default 'once_per_day',
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

create table public.admin_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', 'S&S Gym Member'))
  on conflict (id) do nothing;

  insert into public.calorie_targets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger onboarding_updated_at before update on public.onboarding_answers for each row execute function public.set_updated_at();
create trigger calorie_targets_updated_at before update on public.calorie_targets for each row execute function public.set_updated_at();
create trigger food_items_updated_at before update on public.food_items for each row execute function public.set_updated_at();
create trigger user_food_items_updated_at before update on public.user_food_items for each row execute function public.set_updated_at();
create trigger food_logs_updated_at before update on public.food_logs for each row execute function public.set_updated_at();
create trigger meals_updated_at before update on public.meals for each row execute function public.set_updated_at();
create trigger exercise_library_updated_at before update on public.exercise_library for each row execute function public.set_updated_at();
create trigger workouts_updated_at before update on public.workouts for each row execute function public.set_updated_at();
create trigger exercise_videos_updated_at before update on public.exercise_videos for each row execute function public.set_updated_at();
create trigger workout_video_imports_updated_at before update on public.workout_video_imports for each row execute function public.set_updated_at();
create trigger workout_sessions_updated_at before update on public.workout_sessions for each row execute function public.set_updated_at();
create trigger progress_entries_updated_at before update on public.progress_entries for each row execute function public.set_updated_at();
create trigger user_welcome_messages_updated_at before update on public.user_welcome_messages for each row execute function public.set_updated_at();
create trigger admin_settings_updated_at before update on public.admin_settings for each row execute function public.set_updated_at();

create index idx_food_items_search on public.food_items using gin (to_tsvector('english', food_name || ' ' || coalesce(category, '') || ' ' || coalesce(cuisine, '')));
create index idx_food_logs_user_date on public.food_logs(user_id, log_date desc);
create index idx_workouts_search on public.workouts using gin (to_tsvector('english', name || ' ' || target_muscle || ' ' || equipment));
create index idx_workout_sessions_user_date on public.workout_sessions(user_id, started_at desc);
create index idx_exercise_videos_name_category on public.exercise_videos(exercise_name, category);
create index idx_progress_entries_user_date on public.progress_entries(user_id, entry_date desc);

insert into public.admin_settings (key, value)
values (
  'welcome_settings',
  '{"popup_enabled": true, "show_frequency": "once_per_day", "default_message": "Welcome back to Plaivra. Ready for today?"}'::jsonb
)
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.calorie_targets enable row level security;
alter table public.food_items enable row level security;
alter table public.user_food_items enable row level security;
alter table public.food_logs enable row level security;
alter table public.meals enable row level security;
alter table public.meal_food_items enable row level security;
alter table public.exercise_library enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercise_videos enable row level security;
alter table public.workout_video_imports enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.progress_entries enable row level security;
alter table public.progress_photos enable row level security;
alter table public.body_measurements enable row level security;
alter table public.user_welcome_messages enable row level security;
alter table public.admin_settings enable row level security;

create policy "profiles_select_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "onboarding_own_all" on public.onboarding_answers for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "calorie_targets_own_all" on public.calorie_targets for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "food_items_read_global" on public.food_items for select using (auth.role() = 'authenticated' and is_global = true);
create policy "food_items_admin_all" on public.food_items for all using (public.is_admin()) with check (public.is_admin());

create policy "user_food_items_own_all" on public.user_food_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "food_logs_own_all" on public.food_logs for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "meals_own_all" on public.meals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "meal_food_items_own_all" on public.meal_food_items for all using (
  exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid())
) with check (
  exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid())
);

create policy "exercise_library_read_global" on public.exercise_library for select using (auth.role() = 'authenticated' and is_global = true);
create policy "exercise_library_admin_all" on public.exercise_library for all using (public.is_admin()) with check (public.is_admin());
create policy "workouts_read_global" on public.workouts for select using (auth.role() = 'authenticated' and is_global = true);
create policy "workouts_admin_all" on public.workouts for all using (public.is_admin()) with check (public.is_admin());
create policy "workout_exercises_read_global" on public.workout_exercises for select using (
  exists (select 1 from public.workouts w where w.id = workout_id and w.is_global = true)
);
create policy "workout_exercises_admin_all" on public.workout_exercises for all using (public.is_admin()) with check (public.is_admin());

create policy "exercise_videos_read_global" on public.exercise_videos for select using (auth.role() = 'authenticated' and is_global = true);
create policy "exercise_videos_admin_all" on public.exercise_videos for all using (public.is_admin()) with check (public.is_admin());
create policy "workout_video_imports_admin_all" on public.workout_video_imports for all using (public.is_admin()) with check (public.is_admin());

create policy "workout_sessions_own_all" on public.workout_sessions for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "exercise_logs_own_all" on public.exercise_logs for all using (
  exists (select 1 from public.workout_sessions ws where ws.id = workout_session_id and (ws.user_id = auth.uid() or public.is_admin()))
) with check (
  exists (select 1 from public.workout_sessions ws where ws.id = workout_session_id and (ws.user_id = auth.uid() or public.is_admin()))
);

create policy "progress_entries_own_all" on public.progress_entries for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "progress_photos_own_all" on public.progress_photos for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "body_measurements_own_all" on public.body_measurements for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "welcome_users_read_own" on public.user_welcome_messages for select using (user_id = auth.uid() or public.is_admin());
create policy "welcome_admin_all" on public.user_welcome_messages for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_settings_read_auth" on public.admin_settings for select using (auth.role() = 'authenticated');
create policy "admin_settings_admin_all" on public.admin_settings for all using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

create policy "progress_photos_storage_select_own"
on storage.objects for select
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "progress_photos_storage_insert_own"
on storage.objects for insert
with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "progress_photos_storage_update_own"
on storage.objects for update
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
)
with check (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "progress_photos_storage_delete_own"
on storage.objects for delete
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);


-- ===== Consolidated source: 002_policy_refresh.sql =====

-- S&S Gym RLS and grant refresh
-- Use this only after 001_initial_schema.sql has already run.
-- It is safe to re-run because it drops and recreates app policies.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

grant select on public.food_items to authenticated;
grant select on public.workouts to authenticated;
grant select on public.workout_exercises to authenticated;
grant select on public.exercise_library to authenticated;
grant select on public.exercise_videos to authenticated;
grant select on public.admin_settings to authenticated;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_basic" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;
drop policy if exists "onboarding_own_all" on public.onboarding_answers;
drop policy if exists "calorie_targets_own_all" on public.calorie_targets;
drop policy if exists "food_items_read_global" on public.food_items;
drop policy if exists "food_items_admin_all" on public.food_items;
drop policy if exists "user_food_items_own_all" on public.user_food_items;
drop policy if exists "food_logs_own_all" on public.food_logs;
drop policy if exists "meals_own_all" on public.meals;
drop policy if exists "meal_food_items_own_all" on public.meal_food_items;
drop policy if exists "exercise_library_read_global" on public.exercise_library;
drop policy if exists "exercise_library_admin_all" on public.exercise_library;
drop policy if exists "workouts_read_global" on public.workouts;
drop policy if exists "workouts_admin_all" on public.workouts;
drop policy if exists "workout_exercises_read_global" on public.workout_exercises;
drop policy if exists "workout_exercises_admin_all" on public.workout_exercises;
drop policy if exists "exercise_videos_read_global" on public.exercise_videos;
drop policy if exists "exercise_videos_admin_all" on public.exercise_videos;
drop policy if exists "workout_video_imports_admin_all" on public.workout_video_imports;
drop policy if exists "workout_sessions_own_all" on public.workout_sessions;
drop policy if exists "exercise_logs_own_all" on public.exercise_logs;
drop policy if exists "progress_entries_own_all" on public.progress_entries;
drop policy if exists "progress_photos_own_all" on public.progress_photos;
drop policy if exists "body_measurements_own_all" on public.body_measurements;
drop policy if exists "welcome_users_read_own" on public.user_welcome_messages;
drop policy if exists "welcome_admin_all" on public.user_welcome_messages;
drop policy if exists "admin_settings_read_auth" on public.admin_settings;
drop policy if exists "admin_settings_admin_all" on public.admin_settings;

create policy "profiles_select_own_or_admin" on public.profiles
for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "profiles_insert_own" on public.profiles
for insert to authenticated
with check (id = auth.uid());

create policy "profiles_update_own_basic" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = coalesce((select role from public.profiles where id = auth.uid()), role)
);

create policy "profiles_admin_update_all" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "onboarding_own_all" on public.onboarding_answers
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "calorie_targets_own_all" on public.calorie_targets
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "food_items_read_global" on public.food_items
for select to authenticated
using (is_global = true);

create policy "food_items_admin_all" on public.food_items
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "user_food_items_own_all" on public.user_food_items
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "food_logs_own_all" on public.food_logs
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "meals_own_all" on public.meals
for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "meal_food_items_own_all" on public.meal_food_items
for all to authenticated
using (
  exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid())
)
with check (
  exists (select 1 from public.meals m where m.id = meal_id and m.user_id = auth.uid())
);

create policy "exercise_library_read_global" on public.exercise_library
for select to authenticated
using (is_global = true);

create policy "exercise_library_admin_all" on public.exercise_library
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "workouts_read_global" on public.workouts
for select to authenticated
using (is_global = true);

create policy "workouts_admin_all" on public.workouts
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "workout_exercises_read_global" on public.workout_exercises
for select to authenticated
using (
  exists (select 1 from public.workouts w where w.id = workout_id and w.is_global = true)
);

create policy "workout_exercises_admin_all" on public.workout_exercises
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "exercise_videos_read_global" on public.exercise_videos
for select to authenticated
using (is_global = true);

create policy "exercise_videos_admin_all" on public.exercise_videos
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "workout_video_imports_admin_all" on public.workout_video_imports
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "workout_sessions_own_all" on public.workout_sessions
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "exercise_logs_own_all" on public.exercise_logs
for all to authenticated
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
);

create policy "progress_entries_own_all" on public.progress_entries
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "progress_photos_own_all" on public.progress_photos
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "body_measurements_own_all" on public.body_measurements
for all to authenticated
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

create policy "welcome_users_read_own" on public.user_welcome_messages
for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "welcome_admin_all" on public.user_welcome_messages
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "admin_settings_read_auth" on public.admin_settings
for select to authenticated
using (true);

create policy "admin_settings_admin_all" on public.admin_settings
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('progress-photos', 'progress-photos', false)
on conflict (id) do update set public = false;

drop policy if exists "progress_photos_storage_select_own" on storage.objects;
drop policy if exists "progress_photos_storage_insert_own" on storage.objects;
drop policy if exists "progress_photos_storage_update_own" on storage.objects;
drop policy if exists "progress_photos_storage_delete_own" on storage.objects;

create policy "progress_photos_storage_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "progress_photos_storage_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'progress-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "progress_photos_storage_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
)
with check (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);

create policy "progress_photos_storage_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'progress-photos'
  and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
);


-- ===== Consolidated source: 003_production_hotfix.sql =====

-- S&S Gym production hotfix
-- Run this after 001_initial_schema.sql, 002_policy_refresh.sql, and the seed files.
-- It makes the requested admin email admin, keeps future signups stable,
-- tightens profile role updates, and materializes imported exercise videos as browsable workouts.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

drop policy if exists "profiles_update_own_or_admin" on public.profiles;
drop policy if exists "profiles_update_own_basic" on public.profiles;
drop policy if exists "profiles_admin_update_all" on public.profiles;

create policy "profiles_update_own_basic" on public.profiles
for update to authenticated
using (id = auth.uid())
with check (
  id = auth.uid()
  and role = coalesce((select role from public.profiles where id = auth.uid()), role)
);

create policy "profiles_admin_update_all" on public.profiles
for update to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'Plaivra Member'),
    'member'::public.user_role
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      updated_at = now();

  insert into public.calorie_targets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

insert into public.workouts (
  name,
  category,
  target_muscle,
  equipment,
  difficulty,
  sets,
  reps,
  rest_seconds,
  instructions,
  notes,
  is_global
)
select
  ev.exercise_name,
  coalesce(ev.category_type, 'Exercise') as category,
  coalesce(ev.category, 'General') as target_muscle,
  case
    when ev.category_type = 'Equipment' then coalesce(ev.category, 'Varies')
    else 'Varies'
  end as equipment,
  'Beginner' as difficulty,
  3 as sets,
  '8-12' as reps,
  75 as rest_seconds,
  coalesce(ev.instructions, 'Warm up first, keep each rep controlled, use a pain-free range of motion, and stop if you feel sharp or serious pain.') as instructions,
  ev.exercise_url as notes,
  true as is_global
from public.exercise_videos ev
where ev.is_global = true
  and not exists (
    select 1
    from public.workouts w
    where lower(w.name) = lower(ev.exercise_name)
      and lower(w.target_muscle) = lower(coalesce(ev.category, 'General'))
  );


-- ===== Consolidated source: 004_user_workout_plans.sql =====

-- S&S Gym user workout plans
-- Run this once in Supabase SQL Editor before using the workout plan builder.

create table if not exists public.user_workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  day_number int not null check (day_number > 0),
  day_name text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, day_number)
);

create table if not exists public.user_workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  exercise_name text not null,
  category text,
  target_muscle text,
  equipment text,
  sets int check (sets is null or sets > 0),
  reps text,
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  sort_order int not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

create trigger user_workout_plans_updated_at
before update on public.user_workout_plans
for each row execute function public.set_updated_at();

create trigger user_workout_plan_days_updated_at
before update on public.user_workout_plan_days
for each row execute function public.set_updated_at();

create index if not exists idx_user_workout_plans_user on public.user_workout_plans(user_id, created_at desc);
create index if not exists idx_user_workout_plan_days_plan on public.user_workout_plan_days(plan_id, day_number);
create index if not exists idx_user_workout_plan_exercises_day on public.user_workout_plan_exercises(plan_day_id, sort_order);

alter table public.user_workout_plans enable row level security;
alter table public.user_workout_plan_days enable row level security;
alter table public.user_workout_plan_exercises enable row level security;

drop policy if exists "user_workout_plans_own_all" on public.user_workout_plans;
create policy "user_workout_plans_own_all" on public.user_workout_plans
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_workout_plan_days_own_all" on public.user_workout_plan_days;
create policy "user_workout_plan_days_own_all" on public.user_workout_plan_days
for all
using (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises;
create policy "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises
for all
using (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
);


-- ===== Consolidated source: 005_weekly_workout_plan_calendar.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.user_workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_workout_plan_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  day_number int not null check (day_number > 0),
  day_name text not null,
  weekday text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(plan_id, day_number)
);

alter table public.user_workout_plan_days
  add column if not exists weekday text;

alter table public.user_workout_plan_days
  drop constraint if exists user_workout_plan_days_weekday_check;

alter table public.user_workout_plan_days
  add constraint user_workout_plan_days_weekday_check
  check (weekday is null or weekday in ('Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'));

create table if not exists public.user_workout_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
  workout_id uuid references public.workouts(id) on delete set null,
  source_workout_id text,
  exercise_name text not null,
  category text,
  target_muscle text,
  equipment text,
  sets int check (sets is null or sets > 0),
  reps text,
  rest_seconds int check (rest_seconds is null or rest_seconds >= 0),
  sort_order int not null default 1,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.user_workout_plan_exercises
  add column if not exists source_workout_id text;

create index if not exists idx_user_workout_plans_user on public.user_workout_plans(user_id, created_at desc);
create index if not exists idx_user_workout_plan_days_plan on public.user_workout_plan_days(plan_id, day_number);
create index if not exists idx_user_workout_plan_days_weekday on public.user_workout_plan_days(weekday);
create index if not exists idx_user_workout_plan_exercises_day on public.user_workout_plan_exercises(plan_day_id, sort_order);
create index if not exists idx_user_workout_plan_exercises_source on public.user_workout_plan_exercises(source_workout_id);

alter table public.user_workout_plans enable row level security;
alter table public.user_workout_plan_days enable row level security;
alter table public.user_workout_plan_exercises enable row level security;

drop trigger if exists user_workout_plans_updated_at on public.user_workout_plans;
create trigger user_workout_plans_updated_at
before update on public.user_workout_plans
for each row execute function public.set_updated_at();

drop trigger if exists user_workout_plan_days_updated_at on public.user_workout_plan_days;
create trigger user_workout_plan_days_updated_at
before update on public.user_workout_plan_days
for each row execute function public.set_updated_at();

drop policy if exists "user_workout_plans_own_all" on public.user_workout_plans;
create policy "user_workout_plans_own_all" on public.user_workout_plans
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_workout_plan_days_own_all" on public.user_workout_plan_days;
create policy "user_workout_plan_days_own_all" on public.user_workout_plan_days
for all
using (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.user_workout_plans p
    where p.id = plan_id and (p.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises;
create policy "user_workout_plan_exercises_own_all" on public.user_workout_plan_exercises
for all
using (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
);


-- ===== Consolidated source: 006_workout_session_tracking.sql =====

create extension if not exists "pgcrypto";

alter table public.workout_sessions
  add column if not exists plan_id uuid references public.user_workout_plans(id) on delete set null;

alter table public.workout_sessions
  add column if not exists plan_day_id uuid references public.user_workout_plan_days(id) on delete set null;

alter table public.workout_sessions
  add column if not exists workout_day_name text;

alter table public.user_workout_plan_exercises
  add column if not exists instructions text;

alter table public.user_workout_plan_exercises
  add column if not exists video_url text;

alter table public.exercise_logs
  add column if not exists plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null;

alter table public.exercise_logs
  add column if not exists planned_sets int check (planned_sets is null or planned_sets > 0);

alter table public.exercise_logs
  add column if not exists planned_reps text;

alter table public.exercise_logs
  add column if not exists planned_rest_seconds int check (planned_rest_seconds is null or planned_rest_seconds >= 0);

alter table public.exercise_logs
  add column if not exists completed_at timestamptz;

create index if not exists idx_workout_sessions_plan_day
on public.workout_sessions(user_id, plan_day_id, started_at desc);

create index if not exists idx_exercise_logs_session_order
on public.exercise_logs(workout_session_id, exercise_name, set_number);

create index if not exists idx_exercise_logs_plan_exercise
on public.exercise_logs(plan_exercise_id);

alter table public.workout_sessions enable row level security;
alter table public.exercise_logs enable row level security;

drop policy if exists "workout_sessions_own_all" on public.workout_sessions;

create policy "workout_sessions_own_all"
on public.workout_sessions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "exercise_logs_own_all" on public.exercise_logs;

create policy "exercise_logs_own_all"
on public.exercise_logs
for all
using (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.workout_sessions ws
    where ws.id = workout_session_id
    and (ws.user_id = auth.uid() or public.is_admin())
  )
);


-- ===== Consolidated source: 007_meal_plan_and_persistent_sessions.sql =====

create extension if not exists "pgcrypto";

create table if not exists public.user_meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_date date not null default current_date,
  meal_type text not null default 'Breakfast',
  food_item_id uuid references public.food_items(id) on delete set null,
  user_food_item_id uuid references public.user_food_items(id) on delete set null,
  food_name text not null,
  serving_size text not null,
  quantity numeric(8,3) not null check (quantity > 0),
  calories numeric(8,2) not null check (calories >= 0),
  protein_g numeric(8,2) not null check (protein_g >= 0),
  carbs_g numeric(8,2) not null check (carbs_g >= 0),
  fat_g numeric(8,2) not null check (fat_g >= 0),
  status text not null default 'planned',
  food_log_id uuid references public.food_logs(id) on delete set null,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_meal_plan_items
  add column if not exists food_log_id uuid references public.food_logs(id) on delete set null;

alter table public.user_meal_plan_items
  add column if not exists completed_at timestamptz;

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_meal_type_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_meal_type_check
  check (meal_type in ('Breakfast', 'Lunch', 'Snack', 'Dinner'));

alter table public.user_meal_plan_items
  drop constraint if exists user_meal_plan_items_status_check;

alter table public.user_meal_plan_items
  add constraint user_meal_plan_items_status_check
  check (status in ('planned', 'done'));

create index if not exists idx_user_meal_plan_items_user_date
on public.user_meal_plan_items(user_id, plan_date desc, meal_type);

create index if not exists idx_user_meal_plan_items_status
on public.user_meal_plan_items(user_id, status, plan_date desc);

create index if not exists idx_workout_sessions_user_plan_day_status
on public.workout_sessions(user_id, plan_day_id, status, started_at desc);

alter table public.user_meal_plan_items enable row level security;

drop trigger if exists user_meal_plan_items_updated_at on public.user_meal_plan_items;

create trigger user_meal_plan_items_updated_at
before update on public.user_meal_plan_items
for each row execute function public.set_updated_at();

drop policy if exists "user_meal_plan_items_own_all" on public.user_meal_plan_items;

create policy "user_meal_plan_items_own_all"
on public.user_meal_plan_items
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());


-- ===== Consolidated source: 008_workout_history_skip_status.sql =====

alter type public.workout_session_status add value if not exists 'skipped';

alter table public.workout_sessions
  add column if not exists workout_category text;

alter table public.workout_sessions
  add column if not exists skipped_at timestamptz;

alter table public.exercise_logs
  add column if not exists exercise_category text;

create index if not exists idx_workout_sessions_user_status_started
on public.workout_sessions(user_id, status, started_at desc);

create index if not exists idx_workout_sessions_user_plan_started
on public.workout_sessions(user_id, plan_day_id, started_at desc);


-- ===== Consolidated source: 009_imported_workout_session_tracking.sql =====

-- FitLife Hub does not generate or recommend workout plans internally.
-- This migration only adds imported/manual plan metadata and scheduled-session storage.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.onboarding_answers
  add column if not exists available_equipment text[] not null default '{}';

alter table public.user_workout_plans
  add column if not exists source text not null default 'manual';

alter table public.user_workout_plans
  add column if not exists program_duration_weeks int;

alter table public.user_workout_plans
  add column if not exists days_per_week int;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'chatgpt', 'imported'));

create table if not exists public.user_workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_workout_plan_id uuid not null references public.user_workout_plans(id) on delete cascade,
  plan_day_id uuid references public.user_workout_plan_days(id) on delete set null,
  week_index int not null check (week_index > 0),
  day_index int not null check (day_index > 0),
  session_number int not null check (session_number > 0),
  scheduled_date date not null,
  day_title text not null,
  status text not null default 'scheduled',
  started_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  duration_minutes int check (duration_minutes is null or duration_minutes >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_workout_plan_id, week_index, day_index)
);

alter table public.user_workout_sessions
  drop constraint if exists user_workout_sessions_status_check;

alter table public.user_workout_sessions
  add constraint user_workout_sessions_status_check
  check (status in ('scheduled', 'started', 'completed', 'skipped'));

create table if not exists public.user_exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_workout_session_id uuid not null references public.user_workout_sessions(id) on delete cascade,
  plan_exercise_id uuid references public.user_workout_plan_exercises(id) on delete set null,
  exercise_order int not null check (exercise_order > 0),
  exercise_name text not null,
  planned_sets text,
  planned_reps text,
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  reps int check (reps is null or reps >= 0),
  notes text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_workout_session_id, exercise_order)
);

create index if not exists idx_user_workout_sessions_user_date
on public.user_workout_sessions(user_id, scheduled_date);

create index if not exists idx_user_workout_sessions_user_status
on public.user_workout_sessions(user_id, status, scheduled_date);

create index if not exists idx_user_exercise_logs_session
on public.user_exercise_logs(user_workout_session_id, exercise_order);

drop trigger if exists user_workout_sessions_updated_at on public.user_workout_sessions;
create trigger user_workout_sessions_updated_at
before update on public.user_workout_sessions
for each row execute function public.set_updated_at();

drop trigger if exists user_exercise_logs_updated_at on public.user_exercise_logs;
create trigger user_exercise_logs_updated_at
before update on public.user_exercise_logs
for each row execute function public.set_updated_at();

alter table public.user_workout_sessions enable row level security;
alter table public.user_exercise_logs enable row level security;

grant all on public.user_workout_sessions to authenticated;
grant all on public.user_exercise_logs to authenticated;

drop policy if exists "user_workout_sessions_own_all" on public.user_workout_sessions;
create policy "user_workout_sessions_own_all" on public.user_workout_sessions
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_exercise_logs_own_all" on public.user_exercise_logs;
create policy "user_exercise_logs_own_all" on public.user_exercise_logs
for all
using (
  exists (
    select 1
    from public.user_workout_sessions s
    where s.id = user_workout_session_id
    and (s.user_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.user_workout_sessions s
    where s.id = user_workout_session_id
    and (s.user_id = auth.uid() or public.is_admin())
  )
);


-- ===== Consolidated source: 010_exercise_metadata_and_order.sql =====

alter table public.exercise_videos
  add column if not exists muscle_category text;

alter table public.exercise_videos
  add column if not exists equipment_required text;

alter table public.exercise_videos
  add column if not exists mechanics text;

alter table public.exercise_videos
  add column if not exists force_type text;

alter table public.exercise_videos
  add column if not exists experience_level text;

alter table public.exercise_videos
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.workouts
  add column if not exists muscle_category text;

alter table public.workouts
  add column if not exists equipment_required text;

alter table public.workouts
  add column if not exists mechanics text;

alter table public.workouts
  add column if not exists force_type text;

alter table public.workouts
  add column if not exists experience_level text;

alter table public.workouts
  add column if not exists secondary_muscles text[] not null default '{}';

alter table public.workouts
  add column if not exists exercise_url text;

alter table public.exercise_logs
  add column if not exists exercise_order int;

create index if not exists idx_exercise_videos_metadata
on public.exercise_videos(muscle_category, equipment_required, mechanics, force_type, experience_level);

create index if not exists idx_workouts_metadata
on public.workouts(muscle_category, equipment_required, mechanics, force_type, experience_level);

drop index if exists public.idx_exercise_logs_session_order;

create index if not exists idx_exercise_logs_session_order
on public.exercise_logs(workout_session_id, exercise_order, set_number, created_at);


-- ===== Consolidated source: 011_user_nutrition_and_video_persistence.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.food_kitchens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.food_subcategories (
  id uuid primary key default gen_random_uuid(),
  kitchen_id uuid not null references public.food_kitchens(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(kitchen_id, name)
);

alter table public.food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.food_items
  add column if not exists subcategory_id uuid references public.food_subcategories(id) on delete set null;

alter table public.food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.food_items
  add column if not exists sodium_mg numeric(8,2) check (sodium_mg is null or sodium_mg >= 0);

alter table public.user_food_items
  add column if not exists cuisine text;

alter table public.user_food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.user_food_items
  add column if not exists subcategory_id uuid references public.food_subcategories(id) on delete set null;

alter table public.user_food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.user_food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.user_food_items
  add column if not exists sodium_mg numeric(8,2) check (sodium_mg is null or sodium_mg >= 0);

alter table public.meals
  add column if not exists meal_category text;

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  amount_ml int not null check (amount_ml > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.user_exercise_videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id text not null,
  custom_video_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, exercise_id)
);

insert into public.food_kitchens (name, is_system)
select 'Egyptian Food', true
where not exists (
  select 1 from public.food_kitchens where name = 'Egyptian Food' and is_system = true
);

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Food' and is_system = true limit 1
)
insert into public.food_subcategories (kitchen_id, name)
select egyptian.id, category.name
from egyptian
cross join (
  values
    ('Bread'),
    ('Breakfast'),
    ('Carb'),
    ('Dairy'),
    ('Dessert'),
    ('Dip'),
    ('Drink'),
    ('Legumes'),
    ('Snack'),
    ('Soup'),
    ('Stew'),
    ('Vegetable')
) as category(name)
on conflict (kitchen_id, name) do nothing;

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Food' and is_system = true limit 1
)
update public.food_items
set
  cuisine = 'Egyptian Food',
  kitchen_id = egyptian.id,
  category = case
    when category in ('Bread','Breakfast','Carb','Dairy','Dessert','Dip','Drink','Legumes','Snack','Soup','Stew','Vegetable') then category
    when category in ('Rice') then 'Carb'
    when category in ('Sauce','Salad') then 'Dip'
    when category in ('Protein','Sandwich','Meal','Side') then 'Breakfast'
    else 'Snack'
  end
from egyptian
where public.food_items.is_global = true
  and coalesce(public.food_items.cuisine, 'Egyptian') in ('Egyptian', 'Egyptian Food');

update public.food_items food
set subcategory_id = subcategory.id
from public.food_kitchens kitchen
join public.food_subcategories subcategory on subcategory.kitchen_id = kitchen.id
where kitchen.name = 'Egyptian Food'
  and kitchen.is_system = true
  and food.kitchen_id = kitchen.id
  and food.category = subcategory.name
  and food.subcategory_id is distinct from subcategory.id;

create index if not exists idx_food_kitchens_user on public.food_kitchens(user_id, name);
create unique index if not exists idx_food_kitchens_system_name on public.food_kitchens(name) where is_system = true;
create index if not exists idx_food_subcategories_kitchen on public.food_subcategories(kitchen_id, name);
create index if not exists idx_food_items_kitchen_subcategory on public.food_items(kitchen_id, subcategory_id, food_name);
create index if not exists idx_user_food_items_user_kitchen on public.user_food_items(user_id, kitchen_id, subcategory_id, food_name);
create index if not exists idx_water_logs_user_date on public.water_logs(user_id, log_date desc);
create index if not exists idx_user_exercise_videos_user_exercise on public.user_exercise_videos(user_id, exercise_id);

drop trigger if exists food_kitchens_updated_at on public.food_kitchens;
create trigger food_kitchens_updated_at
before update on public.food_kitchens
for each row execute function public.set_updated_at();

drop trigger if exists food_subcategories_updated_at on public.food_subcategories;
create trigger food_subcategories_updated_at
before update on public.food_subcategories
for each row execute function public.set_updated_at();

drop trigger if exists user_exercise_videos_updated_at on public.user_exercise_videos;
create trigger user_exercise_videos_updated_at
before update on public.user_exercise_videos
for each row execute function public.set_updated_at();

alter table public.food_kitchens enable row level security;
alter table public.food_subcategories enable row level security;
alter table public.water_logs enable row level security;
alter table public.user_exercise_videos enable row level security;

grant select, insert, update, delete on public.food_kitchens to authenticated;
grant select, insert, update, delete on public.food_subcategories to authenticated;
grant select, insert, update, delete on public.water_logs to authenticated;
grant select, insert, update, delete on public.user_exercise_videos to authenticated;

drop policy if exists "food_kitchens_read_system_or_own" on public.food_kitchens;
create policy "food_kitchens_read_system_or_own" on public.food_kitchens
for select
using (is_system = true or user_id = auth.uid() or public.is_admin());

drop policy if exists "food_kitchens_own_insert" on public.food_kitchens;
create policy "food_kitchens_own_insert" on public.food_kitchens
for insert
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_kitchens_own_update_delete" on public.food_kitchens;
create policy "food_kitchens_own_update_delete" on public.food_kitchens
for all
using ((user_id = auth.uid() and is_system = false) or public.is_admin())
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_subcategories_read_system_or_own" on public.food_subcategories;
create policy "food_subcategories_read_system_or_own" on public.food_subcategories
for select
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and (kitchen.is_system = true or kitchen.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "food_subcategories_own_all" on public.food_subcategories;
create policy "food_subcategories_own_all" on public.food_subcategories
for all
using (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and ((kitchen.user_id = auth.uid() and kitchen.is_system = false) or public.is_admin())
  )
)
with check (
  exists (
    select 1 from public.food_kitchens kitchen
    where kitchen.id = kitchen_id
    and ((kitchen.user_id = auth.uid() and kitchen.is_system = false) or public.is_admin())
  )
);

drop policy if exists "water_logs_own_all" on public.water_logs;
create policy "water_logs_own_all" on public.water_logs
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_exercise_videos_own_all" on public.user_exercise_videos;
create policy "user_exercise_videos_own_all" on public.user_exercise_videos
for all
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());


-- ===== Consolidated source: 012_default_plan_and_egyptian_kitchen.sql =====

create extension if not exists "pgcrypto";

alter table public.user_workout_plans
  add column if not exists is_default boolean not null default false;

with preferred as (
  select distinct on (user_id) id
  from public.user_workout_plans
  order by user_id, is_active desc, created_at desc
)
update public.user_workout_plans plan
set is_default = plan.id = preferred.id,
    is_active = plan.id = preferred.id
from preferred
where plan.user_id = (select user_id from public.user_workout_plans where id = preferred.id);

create unique index if not exists idx_user_workout_plans_one_default
on public.user_workout_plans(user_id)
where is_default = true;

do $$
declare
  target_kitchen_id uuid;
  legacy_kitchen_id uuid;
begin
  select id into target_kitchen_id
  from public.food_kitchens
  where is_system = true and name = 'Egyptian Kitchen'
  limit 1;

  if target_kitchen_id is null then
    select id into target_kitchen_id
    from public.food_kitchens
    where is_system = true and name = 'Egyptian Food'
    limit 1;

    if target_kitchen_id is not null then
      update public.food_kitchens
      set name = 'Egyptian Kitchen'
      where id = target_kitchen_id;
    else
      insert into public.food_kitchens (name, is_system)
      values ('Egyptian Kitchen', true)
      returning id into target_kitchen_id;
    end if;
  end if;

  for legacy_kitchen_id in
    select id
    from public.food_kitchens
    where is_system = true
      and id <> target_kitchen_id
      and name in ('Egyptian Food', 'Egyptian', 'Egyptian Kitchen')
  loop
    update public.food_items
    set kitchen_id = target_kitchen_id,
        cuisine = 'Egyptian Kitchen'
    where kitchen_id = legacy_kitchen_id;

    update public.user_food_items
    set kitchen_id = target_kitchen_id,
        cuisine = 'Egyptian Kitchen'
    where kitchen_id = legacy_kitchen_id;

    delete from public.food_subcategories where kitchen_id = legacy_kitchen_id;
    delete from public.food_kitchens where id = legacy_kitchen_id;
  end loop;
end $$;

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Kitchen' and is_system = true limit 1
)
insert into public.food_subcategories (kitchen_id, name)
select egyptian.id, category.name
from egyptian
cross join (
  values
    ('Bread'),
    ('Breakfast'),
    ('Carb'),
    ('Dairy'),
    ('Dessert'),
    ('Dip'),
    ('Drink'),
    ('Legumes'),
    ('Snack'),
    ('Soup'),
    ('Stew'),
    ('Vegetable')
) as category(name)
on conflict (kitchen_id, name) do nothing;

with egyptian as (
  select id from public.food_kitchens where name = 'Egyptian Kitchen' and is_system = true limit 1
)
update public.food_items
set
  cuisine = 'Egyptian Kitchen',
  kitchen_id = egyptian.id,
  category = case
    when category in ('Bread','Breakfast','Carb','Dairy','Dessert','Dip','Drink','Legumes','Snack','Soup','Stew','Vegetable') then category
    when category in ('Rice') then 'Carb'
    when category in ('Sauce','Salad') then 'Dip'
    when category in ('Protein','Sandwich','Meal','Side') then 'Breakfast'
    else 'Snack'
  end
from egyptian
where public.food_items.is_global = true
  and (
    public.food_items.kitchen_id is null
    or public.food_items.kitchen_id = egyptian.id
    or coalesce(public.food_items.cuisine, 'Egyptian') in ('Egyptian', 'Egyptian Food', 'Egyptian Kitchen')
  );

update public.food_items food
set subcategory_id = subcategory.id
from public.food_kitchens kitchen
join public.food_subcategories subcategory on subcategory.kitchen_id = kitchen.id
where kitchen.name = 'Egyptian Kitchen'
  and kitchen.is_system = true
  and food.kitchen_id = kitchen.id
  and food.category = subcategory.name
  and food.subcategory_id is distinct from subcategory.id;


-- ===== Consolidated source: 013_fitlife_hub_wellness_generated_plans.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.onboarding_answers
  add column if not exists goals text[] not null default '{}';

alter table public.onboarding_answers
  add column if not exists training_cycle text;

alter table public.onboarding_answers
  add column if not exists min_workout_duration_minutes int;

alter table public.onboarding_answers
  add column if not exists max_workout_duration_minutes int;

alter table public.user_workout_plan_exercises
  add column if not exists exercise_url text;

alter table public.user_workout_plan_exercises
  add column if not exists custom_video_url text;

create table if not exists public.daily_fit_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  task_date date not null default current_date,
  title text not null,
  notes text,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.fitness_habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_date date not null default current_date,
  name text not null,
  completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sleep_recovery_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null default current_date,
  hours_slept numeric(4,2) check (hours_slept is null or hours_slept >= 0),
  sleep_quality text,
  recovery_level text,
  fatigue_level text,
  soreness_level text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  supplement_date date not null default current_date,
  name text not null,
  dose text,
  time text,
  reminder text,
  taken_today boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  exercise_name text not null,
  record_type text not null,
  weight_kg numeric(8,2) check (weight_kg is null or weight_kg >= 0),
  reps int check (reps is null or reps >= 0),
  record_date date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_daily_fit_tasks_user_date on public.daily_fit_tasks(user_id, task_date desc);
create index if not exists idx_fitness_habits_user_date on public.fitness_habits(user_id, habit_date desc);
create index if not exists idx_sleep_recovery_logs_user_date on public.sleep_recovery_logs(user_id, log_date desc);
create index if not exists idx_supplement_logs_user_date on public.supplement_logs(user_id, supplement_date desc);
create index if not exists idx_personal_records_user_exercise on public.personal_records(user_id, exercise_name, record_date desc);

drop trigger if exists daily_fit_tasks_updated_at on public.daily_fit_tasks;
create trigger daily_fit_tasks_updated_at
before update on public.daily_fit_tasks
for each row execute function public.set_updated_at();

drop trigger if exists fitness_habits_updated_at on public.fitness_habits;
create trigger fitness_habits_updated_at
before update on public.fitness_habits
for each row execute function public.set_updated_at();

drop trigger if exists sleep_recovery_logs_updated_at on public.sleep_recovery_logs;
create trigger sleep_recovery_logs_updated_at
before update on public.sleep_recovery_logs
for each row execute function public.set_updated_at();

drop trigger if exists supplement_logs_updated_at on public.supplement_logs;
create trigger supplement_logs_updated_at
before update on public.supplement_logs
for each row execute function public.set_updated_at();

drop trigger if exists personal_records_updated_at on public.personal_records;
create trigger personal_records_updated_at
before update on public.personal_records
for each row execute function public.set_updated_at();

alter table public.daily_fit_tasks enable row level security;
alter table public.fitness_habits enable row level security;
alter table public.sleep_recovery_logs enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.personal_records enable row level security;

grant select, insert, update, delete on public.daily_fit_tasks to authenticated;
grant select, insert, update, delete on public.fitness_habits to authenticated;
grant select, insert, update, delete on public.sleep_recovery_logs to authenticated;
grant select, insert, update, delete on public.supplement_logs to authenticated;
grant select, insert, update, delete on public.personal_records to authenticated;

drop policy if exists "daily_fit_tasks_own_all" on public.daily_fit_tasks;
create policy "daily_fit_tasks_own_all" on public.daily_fit_tasks
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "fitness_habits_own_all" on public.fitness_habits;
create policy "fitness_habits_own_all" on public.fitness_habits
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "sleep_recovery_logs_own_all" on public.sleep_recovery_logs;
create policy "sleep_recovery_logs_own_all" on public.sleep_recovery_logs
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "supplement_logs_own_all" on public.supplement_logs;
create policy "supplement_logs_own_all" on public.supplement_logs
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "personal_records_own_all" on public.personal_records;
create policy "personal_records_own_all" on public.personal_records
for all using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());


-- ===== Consolidated source: 014_clean_exercise_library_and_api_integrations.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.onboarding_answers
  alter column height_cm drop not null,
  alter column weight_kg drop not null;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_height_cm_check,
  drop constraint if exists onboarding_answers_weight_kg_check;

alter table public.onboarding_answers
  add constraint onboarding_answers_height_cm_check check (height_cm is null or height_cm > 0),
  add constraint onboarding_answers_weight_kg_check check (weight_kg is null or weight_kg > 0);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'manual',
  source_id text,
  source_url text,
  license text,
  license_author text,
  name text not null,
  slug text unique,
  primary_muscle text,
  secondary_muscles text[] not null default '{}',
  equipment text[] not null default '{}',
  difficulty text,
  mechanics text,
  movement_pattern text,
  force_type text,
  instructions text,
  image_url text,
  video_url text,
  is_approved boolean not null default false,
  is_global boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(source, source_id)
);

create table if not exists public.exercise_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null default 'pending',
  imported_count integer default 0,
  approved_count integer default 0,
  rejected_count integer default 0,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.external_api_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  provider text not null,
  endpoint text not null,
  status text,
  request_hash text,
  response_status integer,
  error_message text,
  created_at timestamptz default now()
);

create table if not exists public.imported_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  source text not null,
  source_id text,
  barcode text,
  name text not null,
  brand text,
  serving_size text,
  calories numeric,
  protein numeric,
  carbs numeric,
  fat numeric,
  fiber numeric,
  sugar numeric,
  sodium numeric,
  raw_data jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.user_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] default '{}',
  provider_user_id text,
  connected_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id, provider)
);

create table if not exists public.imported_cardio_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null,
  provider_activity_id text,
  activity_type text,
  title text,
  distance_meters numeric,
  duration_seconds numeric,
  calories numeric,
  average_heart_rate numeric,
  started_at timestamptz,
  raw_data jsonb,
  created_at timestamptz default now(),
  unique(user_id, provider, provider_activity_id)
);

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  email_type text not null,
  to_email text not null,
  provider text default 'resend',
  provider_message_id text,
  status text,
  error_message text,
  created_at timestamptz default now()
);

alter table public.user_workout_plans
  add column if not exists is_default boolean not null default false,
  add column if not exists source text not null default 'manual',
  add column if not exists program_duration_weeks int,
  add column if not exists days_per_week int;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'chatgpt', 'imported'));

alter table public.user_workout_plan_days
  add column if not exists weekday text;

alter table public.user_workout_plan_exercises
  add column if not exists source_workout_id text,
  add column if not exists instructions text,
  add column if not exists exercise_url text,
  add column if not exists video_url text,
  add column if not exists custom_video_url text;

create table if not exists public.user_workout_plan_blocks (
  id uuid primary key default gen_random_uuid(),
  plan_day_id uuid not null references public.user_workout_plan_days(id) on delete cascade,
  block_type text not null check (block_type in ('warmup', 'strength', 'cardio', 'cooldown')),
  title text not null,
  instructions text,
  duration_minutes integer,
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists public.user_workout_plan_block_items (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.user_workout_plan_blocks(id) on delete cascade,
  exercise_id uuid references public.exercises(id),
  name text not null,
  sets integer,
  reps text,
  duration_seconds integer,
  distance_meters numeric,
  rest_seconds integer,
  intensity text,
  notes text,
  sort_order integer not null default 0,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz default now()
);

create index if not exists idx_exercises_approved_global on public.exercises(is_approved, is_global, primary_muscle);
create index if not exists idx_exercises_slug on public.exercises(slug);
create index if not exists idx_external_api_logs_user_provider on public.external_api_logs(user_id, provider, created_at desc);
create index if not exists idx_imported_foods_user_source on public.imported_foods(user_id, source, created_at desc);
create index if not exists idx_user_integrations_user_provider on public.user_integrations(user_id, provider);
create index if not exists idx_imported_cardio_user_started on public.imported_cardio_activities(user_id, started_at desc);
create index if not exists idx_email_logs_user_type on public.email_logs(user_id, email_type, created_at desc);
create index if not exists idx_plan_blocks_day_order on public.user_workout_plan_blocks(plan_day_id, sort_order);
create index if not exists idx_plan_block_items_block_order on public.user_workout_plan_block_items(block_id, sort_order);

drop trigger if exists exercises_updated_at on public.exercises;
create trigger exercises_updated_at before update on public.exercises for each row execute function public.set_updated_at();

drop trigger if exists imported_foods_updated_at on public.imported_foods;
create trigger imported_foods_updated_at before update on public.imported_foods for each row execute function public.set_updated_at();

drop trigger if exists user_integrations_updated_at on public.user_integrations;
create trigger user_integrations_updated_at before update on public.user_integrations for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;
alter table public.exercise_import_batches enable row level security;
alter table public.external_api_logs enable row level security;
alter table public.imported_foods enable row level security;
alter table public.user_integrations enable row level security;
alter table public.imported_cardio_activities enable row level security;
alter table public.email_logs enable row level security;
alter table public.user_workout_plan_blocks enable row level security;
alter table public.user_workout_plan_block_items enable row level security;

grant select on public.exercises to authenticated;
grant all on public.exercise_import_batches to authenticated;
grant all on public.external_api_logs to authenticated;
grant all on public.imported_foods to authenticated;
grant all on public.user_integrations to authenticated;
grant all on public.imported_cardio_activities to authenticated;
grant all on public.email_logs to authenticated;
grant all on public.user_workout_plan_blocks to authenticated;
grant all on public.user_workout_plan_block_items to authenticated;

drop policy if exists "exercises_read_approved_global" on public.exercises;
create policy "exercises_read_approved_global" on public.exercises
for select using (auth.role() = 'authenticated' and is_global = true and is_approved = true);

drop policy if exists "exercises_admin_all" on public.exercises;
create policy "exercises_admin_all" on public.exercises
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "exercise_import_batches_admin_all" on public.exercise_import_batches;
create policy "exercise_import_batches_admin_all" on public.exercise_import_batches
for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "external_api_logs_admin_select" on public.external_api_logs;
create policy "external_api_logs_admin_select" on public.external_api_logs
for select using (public.is_admin());

drop policy if exists "external_api_logs_service_insert" on public.external_api_logs;
create policy "external_api_logs_service_insert" on public.external_api_logs
for insert with check (auth.role() = 'service_role' or public.is_admin());

drop policy if exists "imported_foods_own_all" on public.imported_foods;
create policy "imported_foods_own_all" on public.imported_foods
for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "user_integrations_own_all" on public.user_integrations;
create policy "user_integrations_own_all" on public.user_integrations
for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "imported_cardio_activities_own_all" on public.imported_cardio_activities;
create policy "imported_cardio_activities_own_all" on public.imported_cardio_activities
for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "email_logs_own_select" on public.email_logs;
create policy "email_logs_own_select" on public.email_logs
for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "email_logs_service_insert" on public.email_logs;
create policy "email_logs_service_insert" on public.email_logs
for insert with check (auth.role() = 'service_role' or user_id = auth.uid() or public.is_admin());

drop policy if exists "plan_blocks_own_all" on public.user_workout_plan_blocks;
create policy "plan_blocks_own_all" on public.user_workout_plan_blocks
for all using (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
) with check (
  exists (
    select 1
    from public.user_workout_plan_days d
    join public.user_workout_plans p on p.id = d.plan_id
    where d.id = plan_day_id and (p.user_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "plan_block_items_own_all" on public.user_workout_plan_block_items;
create policy "plan_block_items_own_all" on public.user_workout_plan_block_items
for all using (
  exists (
    select 1
    from public.user_workout_plan_blocks b
    join public.user_workout_plan_days d on d.id = b.plan_day_id
    join public.user_workout_plans p on p.id = d.plan_id
    where b.id = block_id and (p.user_id = auth.uid() or public.is_admin())
  )
) with check (
  exists (
    select 1
    from public.user_workout_plan_blocks b
    join public.user_workout_plan_days d on d.id = b.plan_day_id
    join public.user_workout_plans p on p.id = d.plan_id
    where b.id = block_id and (p.user_id = auth.uid() or public.is_admin())
  )
);


-- ===== Consolidated source: 015_chatgpt_manual_workout_food_profile_tools.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- FitLife no longer generates workout plans internally. Keep user-owned plan storage and expand it
-- so ChatGPT can persist exact manual plans without depending on a global exercise library.
alter table public.user_workout_plans
  add column if not exists goal text;

alter table public.user_workout_plans
  add column if not exists description text;

alter table public.user_workout_plans
  add column if not exists session_duration_minutes int check (session_duration_minutes is null or session_duration_minutes > 0);

alter table public.user_workout_plans
  add column if not exists chatgpt_source boolean not null default false;

alter table public.user_workout_plans
  add column if not exists is_default boolean not null default false;

alter table public.user_workout_plans
  drop constraint if exists user_workout_plans_source_check;

alter table public.user_workout_plans
  add constraint user_workout_plans_source_check
  check (source in ('manual', 'chatgpt', 'imported'));

alter table public.user_workout_plan_days
  add column if not exists focus text;

alter table public.user_workout_plan_days
  add column if not exists weekday text;

alter table public.user_workout_plan_days
  add column if not exists session_duration_minutes int check (session_duration_minutes is null or session_duration_minutes > 0);

alter table public.user_workout_plan_exercises
  add column if not exists weight text;

alter table public.user_workout_plan_exercises
  add column if not exists tempo text;

alter table public.user_workout_plan_exercises
  add column if not exists block_type text;

alter table public.user_workout_plan_exercises
  add column if not exists order_index int;

alter table public.user_workout_plan_exercises
  add column if not exists instructions text;

alter table public.user_workout_plan_exercises
  add column if not exists exercise_url text;

alter table public.user_workout_plan_exercises
  add column if not exists video_url text;

alter table public.user_workout_plan_exercises
  add column if not exists custom_video_url text;

update public.user_workout_plan_exercises
set order_index = sort_order
where order_index is null;

create index if not exists idx_user_workout_plans_user_active
on public.user_workout_plans(user_id, is_active, created_at desc);

create index if not exists idx_user_workout_plan_exercises_block
on public.user_workout_plan_exercises(plan_day_id, block_type, coalesce(order_index, sort_order));

-- Kitchen/custom food support for ChatGPT-created foods.
create table if not exists public.food_kitchens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table public.user_food_items
  add column if not exists cuisine text;

alter table public.user_food_items
  add column if not exists kitchen_id uuid references public.food_kitchens(id) on delete set null;

alter table public.user_food_items
  add column if not exists fiber_g numeric(8,2) check (fiber_g is null or fiber_g >= 0);

alter table public.user_food_items
  add column if not exists sugar_g numeric(8,2) check (sugar_g is null or sugar_g >= 0);

alter table public.user_food_items
  add column if not exists sodium_mg numeric(10,2) check (sodium_mg is null or sodium_mg >= 0);

create index if not exists idx_food_kitchens_user_name on public.food_kitchens(user_id, name);
create index if not exists idx_user_food_items_user_kitchen_name on public.user_food_items(user_id, kitchen_id, food_name);

-- Profile/target fields commonly updated through ChatGPT.
alter table public.profiles
  add column if not exists height_cm numeric(8,2);

alter table public.profiles
  add column if not exists weight_kg numeric(8,2);

alter table public.profiles
  add column if not exists target_weight_kg numeric(8,2);

alter table public.profiles
  add column if not exists age int;

alter table public.profiles
  add column if not exists gender text;

alter table public.profiles
  add column if not exists activity_level text;

alter table public.profiles
  add column if not exists training_level text;

alter table public.profiles
  add column if not exists goal text;

alter table public.profiles
  add column if not exists body_goal text;

alter table public.calorie_targets
  add column if not exists water_ml int;

alter table public.food_kitchens enable row level security;

grant select, insert, update, delete on public.food_kitchens to authenticated;

drop policy if exists "food_kitchens_read_system_or_own" on public.food_kitchens;
create policy "food_kitchens_read_system_or_own"
on public.food_kitchens
for select
using (is_system = true or user_id = auth.uid() or public.is_admin());

drop policy if exists "food_kitchens_insert_own" on public.food_kitchens;
create policy "food_kitchens_insert_own"
on public.food_kitchens
for insert
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop policy if exists "food_kitchens_update_delete_own" on public.food_kitchens;
create policy "food_kitchens_update_delete_own"
on public.food_kitchens
for all
using ((user_id = auth.uid() and is_system = false) or public.is_admin())
with check ((user_id = auth.uid() and is_system = false) or public.is_admin());

drop trigger if exists food_kitchens_updated_at on public.food_kitchens;
create trigger food_kitchens_updated_at
before update on public.food_kitchens
for each row execute function public.set_updated_at();


-- ===== Consolidated source: 015_chatgpt_mcp_connections.sql =====

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.chatgpt_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  label text not null default 'ChatGPT',
  scopes text[] not null default '{}',
  is_active boolean not null default true,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mcp_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.chatgpt_connections(id) on delete set null,
  tool_name text not null,
  input jsonb,
  output_summary jsonb,
  status text not null check (status in ('success', 'error')),
  error_message text,
  created_at timestamptz not null default now()
);

create index if not exists idx_chatgpt_connections_user_active on public.chatgpt_connections(user_id, is_active, created_at desc);
create index if not exists idx_chatgpt_connections_token_hash on public.chatgpt_connections(token_hash);
create index if not exists idx_mcp_audit_logs_user_created on public.mcp_audit_logs(user_id, created_at desc);
create index if not exists idx_mcp_audit_logs_connection_created on public.mcp_audit_logs(connection_id, created_at desc);

drop trigger if exists chatgpt_connections_updated_at on public.chatgpt_connections;
create trigger chatgpt_connections_updated_at
before update on public.chatgpt_connections
for each row execute function public.set_updated_at();

alter table public.chatgpt_connections enable row level security;
alter table public.mcp_audit_logs enable row level security;

grant select, update, delete on public.chatgpt_connections to authenticated;
grant select on public.mcp_audit_logs to authenticated;

drop policy if exists "chatgpt_connections_select_own_or_admin" on public.chatgpt_connections;
create policy "chatgpt_connections_select_own_or_admin"
on public.chatgpt_connections
for select
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "chatgpt_connections_update_own_or_admin" on public.chatgpt_connections;
create policy "chatgpt_connections_update_own_or_admin"
on public.chatgpt_connections
for update
using (user_id = auth.uid() or public.is_admin())
with check (user_id = auth.uid() or public.is_admin());

drop policy if exists "chatgpt_connections_delete_own_or_admin" on public.chatgpt_connections;
create policy "chatgpt_connections_delete_own_or_admin"
on public.chatgpt_connections
for delete
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "mcp_audit_logs_select_own_or_admin" on public.mcp_audit_logs;
create policy "mcp_audit_logs_select_own_or_admin"
on public.mcp_audit_logs
for select
using (user_id = auth.uid() or public.is_admin());


-- ===== Consolidated source: 017_onboarding_duration_and_barcode.sql =====

-- Adds the onboarding field used by profile setup.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.onboarding_answers
  add column if not exists desired_duration_weeks int;

alter table public.onboarding_answers
  drop constraint if exists onboarding_answers_desired_duration_weeks_check;

alter table public.onboarding_answers
  add constraint onboarding_answers_desired_duration_weeks_check
  check (desired_duration_weeks is null or desired_duration_weeks between 1 and 52);

notify pgrst, 'reload schema';


-- ===== Consolidated source: 018_fitlife_security_archive_reporting.sql =====

create extension if not exists "pgcrypto";

alter table public.user_workout_plans
  add column if not exists archived_at timestamptz;

alter table public.user_workout_plans
  add column if not exists archived_reason text;

create index if not exists idx_user_workout_plans_user_archive
on public.user_workout_plans(user_id, archived_at, updated_at desc);

create table if not exists public.mcp_rate_limits (
  connection_id uuid primary key references public.chatgpt_connections(id) on delete cascade,
  request_count int not null default 0,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_rate_limits_reset
on public.mcp_rate_limits(reset_at);

create index if not exists idx_admin_audit_logs_created
on public.admin_audit_logs(created_at desc);

alter table public.mcp_rate_limits enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.mcp_rate_limits from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

drop policy if exists "admin_audit_logs_admin_select" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_select"
on public.admin_audit_logs
for select
using (public.is_admin());


-- ===== Consolidated source: 019_progress_photos_measurements.sql =====

create extension if not exists "pgcrypto";

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create table if not exists public.progress_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  progress_entry_id uuid references public.progress_entries(id) on delete set null,
  photo_type text not null default 'front' check (photo_type in ('front', 'side', 'back')),
  taken_on date not null default current_date,
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

alter table public.progress_photos
  add column if not exists photo_type text not null default 'front';

alter table public.progress_photos
  add column if not exists taken_on date not null default current_date;

alter table public.body_measurements
  add column if not exists body_fat_percent numeric;

alter table public.body_measurements
  add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_progress_photos_user_date
on public.progress_photos(user_id, taken_on desc, created_at desc);

create index if not exists idx_body_measurements_user_measured
on public.body_measurements(user_id, measured_at desc);

alter table public.progress_photos enable row level security;
alter table public.body_measurements enable row level security;

drop policy if exists "progress_photos_owner_select" on public.progress_photos;
create policy "progress_photos_owner_select"
on public.progress_photos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "progress_photos_owner_insert" on public.progress_photos;
create policy "progress_photos_owner_insert"
on public.progress_photos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "progress_photos_owner_delete" on public.progress_photos;
create policy "progress_photos_owner_delete"
on public.progress_photos
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_select" on public.body_measurements;
create policy "body_measurements_owner_select"
on public.body_measurements
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_insert" on public.body_measurements;
create policy "body_measurements_owner_insert"
on public.body_measurements
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_update" on public.body_measurements;
create policy "body_measurements_owner_update"
on public.body_measurements
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "body_measurements_owner_delete" on public.body_measurements;
create policy "body_measurements_owner_delete"
on public.body_measurements
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "progress_photos_storage_owner_select" on storage.objects;
create policy "progress_photos_storage_owner_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_insert" on storage.objects;
create policy "progress_photos_storage_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_update" on storage.objects;
create policy "progress_photos_storage_owner_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "progress_photos_storage_owner_delete" on storage.objects;
create policy "progress_photos_storage_owner_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'progress-photos'
  and auth.uid()::text = (storage.foldername(name))[1]
);


-- ===== Consolidated source: 020_wellness_sleep_recovery_fields.sql =====

alter table public.sleep_recovery_logs
  add column if not exists bedtime time;

alter table public.sleep_recovery_logs
  add column if not exists wake_time time;

alter table public.sleep_recovery_logs
  add column if not exists stress_level text;

create index if not exists idx_sleep_recovery_logs_user_date
on public.sleep_recovery_logs(user_id, log_date desc);

create index if not exists idx_fitness_habits_user_date_name
on public.fitness_habits(user_id, habit_date desc, name);

create index if not exists idx_supplement_logs_user_date_name
on public.supplement_logs(user_id, supplement_date desc, name);


-- ===== Consolidated source: 021_cloud_sync_persistence.sql =====

-- Migration 021: Cloud Sync Persistence

-- 1. Custom Exercises
CREATE TABLE IF NOT EXISTS public.user_custom_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  target_muscle text,
  equipment text,
  difficulty text,
  sets integer,
  reps text,
  rest_seconds integer,
  instructions text,
  notes text,
  muscle_category text,
  equipment_required text,
  mechanics text,
  force_type text,
  experience_level text,
  secondary_muscles text[],
  exercise_url text,
  video_url text,
  custom_video_url text,
  is_global boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.user_custom_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own custom exercises"
  ON public.user_custom_exercises
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Exercise Favorites
CREATE TABLE IF NOT EXISTS public.user_exercise_favorites (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exercise_id text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, exercise_id)
);

ALTER TABLE public.user_exercise_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own exercise favorites"
  ON public.user_exercise_favorites
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. Shopping Checks
CREATE TABLE IF NOT EXISTS public.user_shopping_checks (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start text NOT NULL,
  item_key text NOT NULL,
  checked boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (user_id, week_start, item_key)
);

ALTER TABLE public.user_shopping_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own shopping checks"
  ON public.user_shopping_checks
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_custom_exercises TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_exercise_favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_shopping_checks TO authenticated;


-- ===== Consolidated source: 022_saved_nutrition_favorites_recipes.sql =====

-- Migration 022: Account-synced saved nutrition helpers
-- Keeps food favorites and recipes available across devices without changing food logs.

create table if not exists public.user_food_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  food_key text not null,
  label text,
  created_at timestamp with time zone default now(),
  primary key (user_id, food_key)
);

alter table public.user_food_favorites enable row level security;

drop policy if exists "user_food_favorites_own_all" on public.user_food_favorites;
create policy "user_food_favorites_own_all"
  on public.user_food_favorites
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create table if not exists public.saved_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  portions integer not null default 1 check (portions > 0),
  notes text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table public.saved_recipes enable row level security;

drop policy if exists "saved_recipes_own_all" on public.saved_recipes;
create policy "saved_recipes_own_all"
  on public.saved_recipes
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

drop trigger if exists saved_recipes_updated_at on public.saved_recipes;
create trigger saved_recipes_updated_at
before update on public.saved_recipes
for each row execute function public.set_updated_at();

create table if not exists public.saved_recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.saved_recipes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  food_name text not null,
  quantity numeric not null default 1 check (quantity > 0),
  serving_unit text not null default 'serving',
  calories numeric not null default 0 check (calories >= 0),
  protein_g numeric not null default 0 check (protein_g >= 0),
  carbs_g numeric not null default 0 check (carbs_g >= 0),
  fat_g numeric not null default 0 check (fat_g >= 0),
  created_at timestamp with time zone default now()
);

alter table public.saved_recipe_ingredients enable row level security;

drop policy if exists "saved_recipe_ingredients_own_all" on public.saved_recipe_ingredients;
create policy "saved_recipe_ingredients_own_all"
  on public.saved_recipe_ingredients
  for all
  using (auth.uid() = user_id or public.is_admin())
  with check (auth.uid() = user_id or public.is_admin());

create index if not exists idx_user_food_favorites_user_created
  on public.user_food_favorites(user_id, created_at desc);

create index if not exists idx_saved_recipes_user_created
  on public.saved_recipes(user_id, created_at desc);

create index if not exists idx_saved_recipe_ingredients_recipe
  on public.saved_recipe_ingredients(recipe_id);

grant select, insert, update, delete on public.user_food_favorites to authenticated;
grant select, insert, update, delete on public.saved_recipes to authenticated;
grant select, insert, update, delete on public.saved_recipe_ingredients to authenticated;

-- ===== Current application schema additions not present in historical SQL =====
-- Calorie reference structure is required before the hardening migration;
-- deterministic rows are loaded later by the seed migration.
create table public.exercise_calorie_reference (
  id uuid primary key default gen_random_uuid(),
  activity_key text not null unique,
  display_name text not null,
  category text,
  default_intensity text,
  met numeric(5,2) not null check (met > 0),
  calories_per_minute numeric,
  aliases text[] not null default '{}',
  source_note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_exercise_calorie_reference_active
on public.exercise_calorie_reference(is_active, display_name);
create trigger exercise_calorie_reference_updated_at
before update on public.exercise_calorie_reference
for each row execute function public.set_updated_at();
alter table public.exercise_calorie_reference enable row level security;
grant select, insert, update, delete on public.exercise_calorie_reference to authenticated;
create policy "exercise_calorie_reference_read" on public.exercise_calorie_reference
for select to authenticated using (is_active = true or (select public.is_admin()));
create policy "exercise_calorie_reference_admin_manage" on public.exercise_calorie_reference
for all to authenticated
using ((select public.is_admin()))
with check ((select public.is_admin()));

-- MCP custom meal creation writes to these dedicated tables.
create table public.custom_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_name text not null,
  meal_category text,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.custom_meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.custom_meals(id) on delete cascade,
  food_item_id uuid references public.food_items(id) on delete set null,
  user_food_item_id uuid references public.user_food_items(id) on delete set null,
  food_name text not null,
  serving_size text not null,
  quantity numeric(8,3) not null check (quantity > 0),
  calories numeric(8,2) not null default 0 check (calories >= 0),
  protein_g numeric(8,2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8,2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8,2) not null default 0 check (fat_g >= 0),
  created_at timestamptz not null default now()
);

create index idx_custom_meals_user_created on public.custom_meals(user_id, created_at desc);
create index idx_custom_meal_items_meal on public.custom_meal_items(meal_id, created_at);
create trigger custom_meals_updated_at before update on public.custom_meals
for each row execute function public.set_updated_at();

alter table public.custom_meals enable row level security;
alter table public.custom_meal_items enable row level security;
grant select, insert, update, delete on public.custom_meals to authenticated;
grant select, insert, update, delete on public.custom_meal_items to authenticated;

create policy "custom_meals_own_all" on public.custom_meals
for all to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()))
with check (user_id = (select auth.uid()) or (select public.is_admin()));

create policy "custom_meal_items_own_all" on public.custom_meal_items
for all to authenticated
using (
  exists (
    select 1 from public.custom_meals meal
    where meal.id = custom_meal_items.meal_id
      and (meal.user_id = (select auth.uid()) or (select public.is_admin()))
  )
)
with check (
  exists (
    select 1 from public.custom_meals meal
    where meal.id = custom_meal_items.meal_id
      and (meal.user_id = (select auth.uid()) or (select public.is_admin()))
  )
);