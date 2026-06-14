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
