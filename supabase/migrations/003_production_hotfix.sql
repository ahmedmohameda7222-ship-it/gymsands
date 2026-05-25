-- S&S Gym production hotfix
-- Run this after 001_initial_schema.sql, 002_policy_refresh.sql, and the seed files.
-- It makes the requested admin email admin, keeps future signups stable,
-- tightens profile role updates, and materializes imported exercise videos as browsable workouts.

grant usage on schema public to anon, authenticated;
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
    coalesce(new.raw_user_meta_data->>'full_name', 'S&S Gym Member'),
    case
      when lower(new.email) = lower('ahmeedmostafaa@hotmail.com') then 'admin'::public.user_role
      else 'member'::public.user_role
    end
  )
  on conflict (id) do update
  set email = excluded.email,
      full_name = coalesce(public.profiles.full_name, excluded.full_name),
      role = case
        when lower(excluded.email) = lower('ahmeedmostafaa@hotmail.com') then 'admin'::public.user_role
        else public.profiles.role
      end,
      updated_at = now();

  insert into public.calorie_targets (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

update public.profiles
set role = 'admin',
    updated_at = now()
where lower(email) = lower('ahmeedmostafaa@hotmail.com');

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
