-- User app settings: database-backed preferences, goals, reminders, and privacy.

create table public.user_app_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  theme text not null default 'system',
  accent_color text not null default 'olive',
  language text not null default 'en',
  weight_unit text not null default 'kg',
  height_unit text not null default 'cm',
  distance_unit text not null default 'km',
  liquid_unit text not null default 'ml',
  energy_unit text not null default 'kcal',
  body_measurement_unit text not null default 'cm',
  week_starts_on text not null default 'monday',
  default_start_page text not null default 'today',
  compact_mode boolean not null default false,
  reduce_animations boolean not null default false,
  large_text_mode boolean not null default false,

  days_per_week text,
  workout_duration text,
  preferred_split text,
  daily_calories text,
  protein_target text,
  carbs_target text,
  fat_target text,
  daily_water_goal text,
  track_body_weight boolean not null default false,
  track_body_measurements boolean not null default false,
  track_progress_photos boolean not null default false,
  sleep_target text,
  track_sleep_quality boolean not null default false,
  step_target text,
  track_steps boolean not null default false,
  track_habits boolean not null default false,

  workout_reminders boolean not null default false,
  workout_time text,
  meal_reminders boolean not null default false,
  remind_before_meals boolean not null default false,
  hydration_reminders boolean not null default false,
  hydration_interval text,
  bedtime_reminder boolean not null default false,
  bedtime text,
  supplement_reminders boolean not null default false,
  weigh_in_reminder boolean not null default false,
  weigh_in_day text,
  photo_reminder boolean not null default false,
  photo_frequency text,
  habit_reminders boolean not null default false,
  quiet_hours boolean not null default false,
  quiet_start text,
  quiet_end text,

  hide_body_weight_on_dashboard boolean not null default false,
  hide_calories_on_dashboard boolean not null default false,
  hide_progress_photos boolean not null default false,
  hide_profile_details boolean not null default false,
  private_profile_mode boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id),
  constraint user_app_settings_theme_check check (theme in ('light', 'dark', 'system')),
  constraint user_app_settings_accent_color_check check (accent_color in ('olive', 'champagne', 'sage')),
  constraint user_app_settings_language_check check (language in ('en', 'de', 'ar', 'system')),
  constraint user_app_settings_weight_unit_check check (weight_unit in ('kg', 'lb')),
  constraint user_app_settings_height_unit_check check (height_unit in ('cm', 'ft-in')),
  constraint user_app_settings_distance_unit_check check (distance_unit in ('km', 'miles')),
  constraint user_app_settings_liquid_unit_check check (liquid_unit in ('ml', 'oz')),
  constraint user_app_settings_energy_unit_check check (energy_unit in ('kcal', 'kJ')),
  constraint user_app_settings_body_measurement_unit_check check (body_measurement_unit in ('cm', 'inches')),
  constraint user_app_settings_week_starts_on_check check (week_starts_on in ('monday', 'sunday')),
  constraint user_app_settings_default_start_page_check check (default_start_page in ('today', 'dashboard', 'train', 'eat', 'progress'))
);

comment on table public.user_app_settings is 'Stores per-user app preferences, goals/tracking settings, reminder preferences, and privacy controls.';

alter table public.user_app_settings enable row level security;

grant select, insert, update, delete on public.user_app_settings to authenticated;

create policy "user_app_settings_select_own"
  on public.user_app_settings
  for select
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "user_app_settings_insert_own"
  on public.user_app_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "user_app_settings_update_own"
  on public.user_app_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "user_app_settings_delete_own"
  on public.user_app_settings
  for delete
  to authenticated
  using (user_id = auth.uid());

create trigger user_app_settings_updated_at
  before update on public.user_app_settings
  for each row
  execute function public.set_updated_at();
