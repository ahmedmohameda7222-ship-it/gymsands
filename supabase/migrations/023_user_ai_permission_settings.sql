-- AI Permissions: user-level permission settings for MCP/AI access
-- This is the source of truth for what scopes an MCP connection should have.

create table public.user_ai_permission_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  access_mode text not null check (access_mode in ('full', 'custom')),
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

comment on table public.user_ai_permission_settings is 'Stores each user chosen AI permission mode and scopes for MCP/ChatGPT connections.';
comment on column public.user_ai_permission_settings.access_mode is 'full = all normal user scopes, custom = only selected scopes';
comment on column public.user_ai_permission_settings.scopes is 'Array of explicit fitlife.* scopes. For full access, includes fitlife.full_access.';

-- Enable RLS
alter table public.user_ai_permission_settings enable row level security;

-- RLS: users can read their own settings
-- Admins can read all (for support/audit)
create policy "Users can read own AI permission settings"
  on public.user_ai_permission_settings
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- RLS: users can insert their own settings
create policy "Users can insert own AI permission settings"
  on public.user_ai_permission_settings
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- RLS: users can update their own settings
create policy "Users can update own AI permission settings"
  on public.user_ai_permission_settings
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Trigger: updated_at
create trigger user_ai_permission_settings_updated_at
  before update on public.user_ai_permission_settings
  for each row
  execute function public.set_updated_at();

-- Migrate existing users who have active chatgpt_connections.
-- Give them explicit full access with normal-user scopes only.
-- Do NOT grant fitlife.admin through this migration.
insert into public.user_ai_permission_settings (user_id, access_mode, scopes)
select distinct on (c.user_id)
  c.user_id,
  'full',
  array[
    'fitlife.full_access',
    'fitlife.workouts.read',
    'fitlife.workouts.write',
    'fitlife.nutrition.read',
    'fitlife.nutrition.write',
    'fitlife.meal_plans.read',
    'fitlife.meal_plans.write',
    'fitlife.hydration.read',
    'fitlife.hydration.write',
    'fitlife.progress.read',
    'fitlife.progress.write',
    'fitlife.wellness.read',
    'fitlife.wellness.write',
    'fitlife.profile.read',
    'fitlife.profile.write',
    'fitlife.settings.read'
  ]
from public.chatgpt_connections c
where c.is_active = true
  and c.revoked_at is null
  and not exists (
    select 1 from public.user_ai_permission_settings u
    where u.user_id = c.user_id
  )
on conflict (user_id) do nothing;
