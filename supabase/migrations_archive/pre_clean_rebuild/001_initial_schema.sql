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
  '{"popup_enabled": true, "show_frequency": "once_per_day", "default_message": "Welcome back to S&S Gym. Ready for today?"}'::jsonb
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
