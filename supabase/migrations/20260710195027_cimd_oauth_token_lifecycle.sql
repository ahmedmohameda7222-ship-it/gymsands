-- CIMD client identity and opaque-token lifecycle hardening.

alter table public.chatgpt_connections
  add column if not exists oauth_client_id text;

create index if not exists idx_chatgpt_connections_user_oauth_client
  on public.chatgpt_connections(user_id, oauth_client_id)
  where oauth_client_id is not null and is_active = true;

alter table public.mcp_oauth_access_tokens
  add column if not exists client_id text,
  add column if not exists issuer text,
  add column if not exists not_before timestamptz not null default now(),
  add column if not exists revoked_at timestamptz,
  add column if not exists last_used_at timestamptz;

create index if not exists idx_mcp_oauth_access_tokens_client
  on public.mcp_oauth_access_tokens(client_id)
  where client_id is not null;

create index if not exists idx_mcp_oauth_access_tokens_cleanup
  on public.mcp_oauth_access_tokens(expires_at, revoked_at);

create table if not exists public.mcp_oauth_client_assertions (
  id uuid primary key default gen_random_uuid(),
  client_id text not null,
  jti_hash text not null unique,
  kid text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_client_assertions_expires
  on public.mcp_oauth_client_assertions(expires_at);

alter table public.mcp_oauth_client_assertions enable row level security;
revoke all on table public.mcp_oauth_client_assertions from public, anon, authenticated;
grant select, insert, delete on table public.mcp_oauth_client_assertions to service_role;

create table if not exists public.mcp_oauth_authorization_continuations (
  id uuid primary key default gen_random_uuid(),
  continuation_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_authorization_continuations_expires
  on public.mcp_oauth_authorization_continuations(expires_at);

alter table public.mcp_oauth_authorization_continuations enable row level security;
revoke all on table public.mcp_oauth_authorization_continuations from public, anon, authenticated;
grant select, insert, delete on table public.mcp_oauth_authorization_continuations to service_role;

create or replace function public.cleanup_expired_mcp_oauth_artifacts(p_batch_size integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch integer := greatest(1, least(coalesce(p_batch_size, 1000), 5000));
  code_count integer := 0;
  token_count integer := 0;
  assertion_count integer := 0;
  continuation_count integer := 0;
begin
  delete from public.mcp_oauth_authorization_codes
  where id in (
    select id from public.mcp_oauth_authorization_codes
    where expires_at < now() or used_at < now() - interval '1 hour'
    order by expires_at
    limit safe_batch
  );
  get diagnostics code_count = row_count;

  delete from public.mcp_oauth_access_tokens
  where id in (
    select id from public.mcp_oauth_access_tokens
    where expires_at < now() - interval '7 days'
       or revoked_at < now() - interval '7 days'
    order by expires_at
    limit safe_batch
  );
  get diagnostics token_count = row_count;

  delete from public.mcp_oauth_client_assertions
  where id in (
    select id from public.mcp_oauth_client_assertions
    where expires_at < now()
    order by expires_at
    limit safe_batch
  );
  get diagnostics assertion_count = row_count;

  delete from public.mcp_oauth_authorization_continuations
  where id in (
    select id from public.mcp_oauth_authorization_continuations
    where expires_at < now()
    order by expires_at
    limit safe_batch
  );
  get diagnostics continuation_count = row_count;

  return jsonb_build_object(
    'authorization_codes_deleted', code_count,
    'access_tokens_deleted', token_count,
    'client_assertions_deleted', assertion_count,
    'authorization_continuations_deleted', continuation_count
  );
end;
$$;

revoke all on function public.cleanup_expired_mcp_oauth_artifacts(integer) from public, anon, authenticated;
grant execute on function public.cleanup_expired_mcp_oauth_artifacts(integer) to service_role;

comment on function public.cleanup_expired_mcp_oauth_artifacts(integer) is
  'Bounded idempotent OAuth cleanup. Invoke from the authenticated maintenance schedule; never from a member client.';
