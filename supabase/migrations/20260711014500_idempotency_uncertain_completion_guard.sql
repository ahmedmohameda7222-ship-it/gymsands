-- Prevent duplicate mutations after an expired lease where completion cannot be proven.
-- A fresh key may execute once. Completed/failed responses replay deterministically.
-- An abandoned pending key requires record review instead of automatic re-execution.

create or replace function public.claim_mcp_idempotency_key(
  p_user_id uuid,
  p_connection_id uuid,
  p_tool_name text,
  p_key_hash text,
  p_input_hash text,
  p_lease_seconds integer default 120,
  p_ttl_seconds integer default 604800
)
returns table(action text, ledger_id uuid, response jsonb)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  existing public.mcp_idempotency_keys%rowtype;
  inserted_id uuid;
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
  safe_ttl integer := greatest(300, least(coalesce(p_ttl_seconds, 604800), 2592000));
begin
  insert into public.mcp_idempotency_keys (
    user_id, connection_id, tool_name, key_hash, input_hash, status,
    lease_expires_at, expires_at, attempt_count
  ) values (
    p_user_id, p_connection_id, p_tool_name, p_key_hash, p_input_hash, 'pending',
    now() + make_interval(secs => safe_lease), now() + make_interval(secs => safe_ttl), 1
  ) on conflict (user_id, tool_name, key_hash) do nothing
  returning id into inserted_id;

  if inserted_id is not null then
    return query select 'execute'::text, inserted_id, null::jsonb;
    return;
  end if;

  select * into existing
  from public.mcp_idempotency_keys keys
  where keys.user_id = p_user_id
    and keys.tool_name = p_tool_name
    and keys.key_hash = p_key_hash
  for update;

  if existing.id is null then
    return query select 'review_required'::text, null::uuid, null::jsonb;
    return;
  end if;

  if existing.input_hash <> p_input_hash then
    return query select 'conflict'::text, existing.id, existing.response;
    return;
  end if;

  if existing.status in ('completed', 'failed') then
    if existing.response is null then
      return query select 'review_required'::text, existing.id, null::jsonb;
    else
      return query select 'replay'::text, existing.id, existing.response;
    end if;
    return;
  end if;

  if existing.status = 'pending' then
    if existing.lease_expires_at is not null and existing.lease_expires_at > now() then
      return query select 'in_progress'::text, existing.id, existing.response;
    else
      return query select 'review_required'::text, existing.id, existing.response;
    end if;
    return;
  end if;

  return query select 'review_required'::text, existing.id, existing.response;
end;
$$;

revoke all on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer)
  to service_role;

update public.release_schema_compatibility
set migration_version = '20260711014500', applied_at = now()
where singleton = true and version = '2';
