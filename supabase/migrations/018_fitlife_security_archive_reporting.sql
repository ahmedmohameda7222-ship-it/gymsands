create extension if not exists "pgcrypto";

alter table public.user_workout_plans
  add column if not exists archived_at timestamptz;

alter table public.user_workout_plans
  add column if not exists archived_reason text;

create index if not exists idx_user_workout_plans_user_archive
on public.user_workout_plans(user_id, archived_at, updated_at desc);

create table if not exists public.mcp_rate_limits (
  connection_id uuid primary key references public.chatgpt_connections(id) on delete cascade,
  request_count int not null default 0,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_table text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_rate_limits_reset
on public.mcp_rate_limits(reset_at);

create index if not exists idx_admin_audit_logs_created
on public.admin_audit_logs(created_at desc);

alter table public.mcp_rate_limits enable row level security;
alter table public.admin_audit_logs enable row level security;

revoke all on public.mcp_rate_limits from anon, authenticated;
grant select on public.admin_audit_logs to authenticated;

drop policy if exists "admin_audit_logs_admin_select" on public.admin_audit_logs;
create policy "admin_audit_logs_admin_select"
on public.admin_audit_logs
for select
using (public.is_admin());
