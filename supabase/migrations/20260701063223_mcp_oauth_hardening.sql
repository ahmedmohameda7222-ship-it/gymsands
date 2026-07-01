-- MCP OAuth hardening: Phase 2
-- - Real authorization-code flow with PKCE (S256 only)
-- - Server-side stored authorization codes (single-use, short-lived)
-- - Distinct access tokens with enforced expiry
-- - Resource/audience binding for protected-resource metadata
-- - Database-backed rate limiting for OAuth endpoints
-- - Service-role-only access to auth internals

-- ---------------------------------------------------------------------------
-- Authorization codes: server-side, single-use, short-lived, PKCE-bound, resource-bound
-- ---------------------------------------------------------------------------

create table if not exists public.mcp_oauth_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  user_id uuid not null references public.profiles(id) on delete cascade,
  connection_id uuid not null references public.chatgpt_connections(id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scope text[] not null default '{}',
  resource text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_auth_codes_hash
  on public.mcp_oauth_authorization_codes(code_hash);

create index if not exists idx_mcp_oauth_auth_codes_expires
  on public.mcp_oauth_authorization_codes(expires_at);

create index if not exists idx_mcp_oauth_auth_codes_resource
  on public.mcp_oauth_authorization_codes(resource);

-- ---------------------------------------------------------------------------
-- Access tokens: distinct from connection secret, with enforced expiry, resource-bound
-- ---------------------------------------------------------------------------

create table if not exists public.mcp_oauth_access_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  connection_id uuid not null references public.chatgpt_connections(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text[] not null default '{}',
  resource text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_mcp_oauth_access_tokens_hash
  on public.mcp_oauth_access_tokens(token_hash);

create index if not exists idx_mcp_oauth_access_tokens_expires
  on public.mcp_oauth_access_tokens(expires_at);

create index if not exists idx_mcp_oauth_access_tokens_resource
  on public.mcp_oauth_access_tokens(resource);

-- ---------------------------------------------------------------------------
-- OAuth rate limits: keyed by arbitrary string (IP, client_id, etc.)
-- ---------------------------------------------------------------------------

create table if not exists public.oauth_rate_limits (
  key text primary key,
  request_count int not null default 0,
  window_start timestamptz not null default now(),
  reset_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_oauth_rate_limits_reset
  on public.oauth_rate_limits(reset_at);

-- ---------------------------------------------------------------------------
-- RLS and grants: auth internals are service-role only
-- ---------------------------------------------------------------------------

alter table public.mcp_oauth_authorization_codes enable row level security;
alter table public.mcp_oauth_access_tokens enable row level security;
alter table public.oauth_rate_limits enable row level security;

revoke all privileges on public.mcp_oauth_authorization_codes from anon, authenticated, public;
revoke all privileges on public.mcp_oauth_access_tokens from anon, authenticated, public;
revoke all privileges on public.oauth_rate_limits from anon, authenticated, public;

grant all privileges on public.mcp_oauth_authorization_codes to service_role;
grant all privileges on public.mcp_oauth_access_tokens to service_role;
grant all privileges on public.oauth_rate_limits to service_role;

-- ---------------------------------------------------------------------------
-- Atomic OAuth rate-limit RPC (same pattern as consume_mcp_rate_limit)
-- ---------------------------------------------------------------------------

create or replace function public.consume_oauth_rate_limit(
  p_key text,
  p_limit integer default 10,
  p_window_seconds integer default 60
)
returns table (allowed boolean, request_count integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  counter public.oauth_rate_limits;
  v_now timestamptz := clock_timestamp();
begin
  if p_key is null or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit input';
  end if;

  insert into public.oauth_rate_limits as limits (
    key,
    request_count,
    window_start,
    reset_at,
    updated_at
  )
  values (
    p_key,
    1,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (key) do update
  set request_count = case
        when limits.reset_at <= v_now then 1
        else limits.request_count + 1
      end,
      window_start = case
        when limits.reset_at <= v_now then v_now
        else limits.window_start
      end,
      reset_at = case
        when limits.reset_at <= v_now then v_now + make_interval(secs => p_window_seconds)
        else limits.reset_at
      end,
      updated_at = v_now
  returning limits.* into counter;

  return query
  select counter.request_count <= p_limit, counter.request_count, counter.reset_at;
end;
$$;

revoke all on function public.consume_oauth_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_oauth_rate_limit(text, integer, integer) to service_role;

notify pgrst, 'reload schema';
