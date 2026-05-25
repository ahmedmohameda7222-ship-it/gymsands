-- S&S Gym RLS and grant refresh
-- Use this only after 001_initial_schema.sql has already run.
-- It is safe to re-run because it drops and recreates app policies.

grant usage on schema public to anon, authenticated;
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

create policy "profiles_update_own_or_admin" on public.profiles
for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

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
