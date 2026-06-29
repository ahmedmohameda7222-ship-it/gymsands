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
comment on column public.user_ai_permission_settings.scopes is 'Array of explicit canonical plaivra.* scopes. Full access requires a user-saved plaivra.full_access scope.';

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

-- Existing connections are deliberately not granted settings here. The
-- application-specific hardening migration maps only safe section-level legacy
-- scopes and drops blanket/admin scopes. Users must explicitly save full mode.
