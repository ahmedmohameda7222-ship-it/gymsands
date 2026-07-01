-- First MCP security launch-blocker batch:
-- - atomically rotate to one active ChatGPT connection per user
-- - atomically increment/check per-connection MCP rate limits
-- Both RPCs are callable only by service_role and use invoker privileges.

create unique index if not exists chatgpt_connections_one_active_per_user_idx
  on public.chatgpt_connections (user_id)
  where is_active = true and revoked_at is null;

create or replace function public.rotate_chatgpt_connection(
  p_user_id uuid,
  p_token_hash text,
  p_scopes text[]
)
returns table (
  id uuid,
  scopes text[],
  is_active boolean,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_connection public.chatgpt_connections;
begin
  if p_user_id is null or p_token_hash is null or length(p_token_hash) < 32 then
    raise exception 'invalid connection rotation input';
  end if;

  if p_scopes is null or cardinality(p_scopes) = 0 then
    raise exception 'saved AI permission scopes are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  update public.chatgpt_connections
  set is_active = false,
      revoked_at = coalesce(revoked_at, statement_timestamp()),
      updated_at = statement_timestamp()
  where user_id = p_user_id
    and is_active = true;

  insert into public.chatgpt_connections (user_id, token_hash, scopes, is_active)
  values (p_user_id, p_token_hash, p_scopes, true)
  returning * into created_connection;

  return query
  select
    created_connection.id,
    created_connection.scopes,
    created_connection.is_active,
    created_connection.created_at;
end;
$$;

revoke all on function public.rotate_chatgpt_connection(uuid, text, text[]) from public, anon, authenticated;
grant execute on function public.rotate_chatgpt_connection(uuid, text, text[]) to service_role;

create or replace function public.consume_mcp_rate_limit(
  p_connection_id uuid,
  p_limit integer default 60,
  p_window_seconds integer default 60
)
returns table (allowed boolean, request_count integer, reset_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  counter public.mcp_rate_limits;
  v_now timestamptz := clock_timestamp();
begin
  if p_connection_id is null or p_limit < 1 or p_limit > 10000 or p_window_seconds < 1 or p_window_seconds > 3600 then
    raise exception 'invalid rate limit input';
  end if;

  insert into public.mcp_rate_limits as limits (
    connection_id,
    request_count,
    window_start,
    reset_at,
    updated_at
  )
  values (
    p_connection_id,
    1,
    v_now,
    v_now + make_interval(secs => p_window_seconds),
    v_now
  )
  on conflict (connection_id) do update
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

revoke all on function public.consume_mcp_rate_limit(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_mcp_rate_limit(uuid, integer, integer) to service_role;
