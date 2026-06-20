-- Make welcome messages persist across refreshes and readable by the intended user.

create table if not exists public.admin_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_welcome_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  popup_enabled boolean not null default true,
  show_frequency text not null default 'once_per_day' check (show_frequency in ('every_login', 'once_per_day')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists user_welcome_messages_user_id_idx on public.user_welcome_messages (user_id);
create index if not exists user_welcome_messages_active_user_idx on public.user_welcome_messages (user_id, is_active);

alter table public.admin_settings enable row level security;
alter table public.user_welcome_messages enable row level security;

drop policy if exists "welcome_settings_read" on public.admin_settings;
drop policy if exists "welcome_settings_admin_insert" on public.admin_settings;
drop policy if exists "welcome_settings_admin_update" on public.admin_settings;
drop policy if exists "welcome_settings_admin_delete" on public.admin_settings;

create policy "welcome_settings_read" on public.admin_settings
  for select
  to authenticated
  using (
    key = 'welcome_settings'
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "welcome_settings_admin_insert" on public.admin_settings
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "welcome_settings_admin_update" on public.admin_settings
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "welcome_settings_admin_delete" on public.admin_settings
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "user_welcome_messages_read_own_or_admin" on public.user_welcome_messages;
drop policy if exists "user_welcome_messages_admin_insert" on public.user_welcome_messages;
drop policy if exists "user_welcome_messages_admin_update" on public.user_welcome_messages;
drop policy if exists "user_welcome_messages_admin_delete" on public.user_welcome_messages;

create policy "user_welcome_messages_read_own_or_admin" on public.user_welcome_messages
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "user_welcome_messages_admin_insert" on public.user_welcome_messages
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "user_welcome_messages_admin_update" on public.user_welcome_messages
  for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "user_welcome_messages_admin_delete" on public.user_welcome_messages
  for delete
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
