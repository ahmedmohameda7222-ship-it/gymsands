create table if not exists public.mcp_idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid references public.chatgpt_connections(id) on delete set null,
  tool_name text not null,
  key_hash text not null,
  input_hash text not null,
  status text not null default 'pending',
  response jsonb,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tool_name, key_hash),
  constraint mcp_idempotency_keys_status_check check (status in ('pending', 'completed', 'failed'))
);

create index if not exists idx_mcp_idempotency_keys_cleanup
  on public.mcp_idempotency_keys(expires_at);

alter table public.mcp_idempotency_keys enable row level security;
revoke all on table public.mcp_idempotency_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.mcp_idempotency_keys to service_role;

drop trigger if exists mcp_idempotency_keys_updated_at on public.mcp_idempotency_keys;
create trigger mcp_idempotency_keys_updated_at
before update on public.mcp_idempotency_keys
for each row execute function public.set_updated_at();

create or replace function public.cleanup_expired_mcp_idempotency_keys(p_batch_size integer default 1000)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  deleted_count integer := 0;
begin
  delete from public.mcp_idempotency_keys
  where id in (
    select id from public.mcp_idempotency_keys
    where expires_at < now()
    order by expires_at
    limit greatest(1, least(coalesce(p_batch_size, 1000), 5000))
  );
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.cleanup_expired_mcp_idempotency_keys(integer) from public, anon, authenticated;
grant execute on function public.cleanup_expired_mcp_idempotency_keys(integer) to service_role;

comment on table public.mcp_idempotency_keys is
  'Service-only replay ledger for public MCP create/log/composite mutations. Stores hashes and minimized response envelopes, never raw idempotency keys.';
