-- Additive migration: create the canonical non-diagnostic fitness-constraints store.
-- The legacy user_safety_profiles table remains temporarily for the currently deployed app.
-- Drop it only after the new application version is deployed and verified.

create table if not exists public.user_fitness_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  injury_or_limitation_labels text[] not null default '{}'::text[],
  areas_to_protect text[] not null default '{}'::text[],
  movement_restrictions text,
  nutrition_restrictions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.user_fitness_constraints is
  'User-authored functional fitness and food-planning constraints. This table is not a diagnosis, treatment, medication, or clinical-record store.';
comment on column public.user_fitness_constraints.injury_or_limitation_labels is
  'Optional labels entered by the user to help fitness planning; not verified or inferred diagnoses.';
comment on column public.user_fitness_constraints.areas_to_protect is
  'User-authored body areas that fitness planning should protect or avoid aggravating.';
comment on column public.user_fitness_constraints.movement_restrictions is
  'Practical movements or activities the user asks plans to avoid.';
comment on column public.user_fitness_constraints.nutrition_restrictions is
  'Practical meal-planning constraints; confirmed allergies remain in the nutrition preference profile.';

alter table public.user_fitness_constraints enable row level security;

create policy user_fitness_constraints_select_own
  on public.user_fitness_constraints
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy user_fitness_constraints_insert_own
  on public.user_fitness_constraints
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_fitness_constraints_update_own
  on public.user_fitness_constraints
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy user_fitness_constraints_delete_own
  on public.user_fitness_constraints
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create trigger set_user_fitness_constraints_updated_at
  before update on public.user_fitness_constraints
  for each row execute function public.set_updated_at();

revoke all on table public.user_fitness_constraints from anon, authenticated;
grant select, insert, update, delete on table public.user_fitness_constraints to authenticated;
grant all on table public.user_fitness_constraints to service_role;

-- Preserve the limited functional fields already entered by existing users.
insert into public.user_fitness_constraints (
  id,
  user_id,
  injury_or_limitation_labels,
  areas_to_protect,
  movement_restrictions,
  nutrition_restrictions,
  created_at,
  updated_at
)
select
  id,
  user_id,
  coalesce(injuries, '{}'::text[]),
  coalesce(pain_areas, '{}'::text[]),
  movement_restrictions,
  nutrition_restrictions,
  created_at,
  updated_at
from public.user_safety_profiles
on conflict (user_id) do update set
  injury_or_limitation_labels = excluded.injury_or_limitation_labels,
  areas_to_protect = excluded.areas_to_protect,
  movement_restrictions = excluded.movement_restrictions,
  nutrition_restrictions = excluded.nutrition_restrictions,
  updated_at = greatest(public.user_fitness_constraints.updated_at, excluded.updated_at);
