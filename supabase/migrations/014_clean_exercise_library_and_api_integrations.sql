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
