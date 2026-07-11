-- Runtime safety corrections discovered during independent branch verification.
-- Depends on the nine pending pre-launch migrations and performs no production action by itself.

create table if not exists public.release_schema_compatibility (
  singleton boolean primary key default true check (singleton),
  version text not null check (version ~ '^[0-9]+$'),
  migration_version text not null,
  applied_at timestamptz not null default now()
);
alter table public.release_schema_compatibility enable row level security;
revoke all on table public.release_schema_compatibility from public, anon, authenticated;
grant select, insert, update on table public.release_schema_compatibility to service_role;
insert into public.release_schema_compatibility (singleton, version, migration_version, applied_at)
values (true, '2', '20260711013000', now())
on conflict (singleton) do update set
  version = excluded.version,
  migration_version = excluded.migration_version,
  applied_at = excluded.applied_at;

create or replace function public.consume_mcp_oauth_authorization_code(
  p_code_hash text,
  p_client_id text,
  p_redirect_uri text,
  p_code_challenge text,
  p_resource text
)
returns table(scope text[], user_id uuid, connection_id uuid)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  return query
  update public.mcp_oauth_authorization_codes codes
  set used_at = now()
  where codes.code_hash = p_code_hash
    and codes.used_at is null
    and codes.expires_at > now()
    and codes.client_id = p_client_id
    and codes.redirect_uri = p_redirect_uri
    and codes.code_challenge_method = 'S256'
    and codes.code_challenge = p_code_challenge
    and codes.resource = p_resource
  returning codes.scope, codes.user_id, codes.connection_id;
end;
$$;
revoke all on function public.consume_mcp_oauth_authorization_code(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.consume_mcp_oauth_authorization_code(text, text, text, text, text) to service_role;

alter table public.mcp_idempotency_keys
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0 check (attempt_count >= 0);

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
  where keys.user_id = p_user_id and keys.tool_name = p_tool_name and keys.key_hash = p_key_hash
  for update;

  if existing.id is null then
    return query select 'review_required'::text, null::uuid, null::jsonb;
    return;
  end if;
  if existing.input_hash <> p_input_hash then
    return query select 'conflict'::text, existing.id, existing.response;
    return;
  end if;
  if existing.status = 'completed' then
    if existing.response is null then
      return query select 'review_required'::text, existing.id, null::jsonb;
    else
      return query select 'replay'::text, existing.id, existing.response;
    end if;
    return;
  end if;
  if existing.status = 'pending' and existing.lease_expires_at is not null and existing.lease_expires_at > now() then
    return query select 'in_progress'::text, existing.id, existing.response;
    return;
  end if;

  update public.mcp_idempotency_keys keys
  set status = 'pending', response = null,
      connection_id = p_connection_id,
      lease_expires_at = now() + make_interval(secs => safe_lease),
      expires_at = now() + make_interval(secs => safe_ttl),
      attempt_count = keys.attempt_count + 1
  where keys.id = existing.id;
  return query select 'execute'::text, existing.id, null::jsonb;
end;
$$;
revoke all on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.claim_mcp_idempotency_key(uuid, uuid, text, text, text, integer, integer) to service_role;

create or replace function public.claim_account_deletion_jobs(p_batch_size integer default 5)
returns setof public.account_deletion_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.account_deletion_jobs jobs
  set state = 'retry_scheduled',
      next_attempt_at = now(),
      locked_at = null,
      last_error_code = coalesce(jobs.last_error_code, 'stale_processing_recovered')
  where jobs.state = 'processing'
    and jobs.locked_at < now() - interval '15 minutes';

  return query
  with candidates as (
    select jobs.id
    from public.account_deletion_jobs jobs
    where jobs.state in ('queued', 'retry_scheduled')
      and jobs.next_attempt_at <= now()
    order by jobs.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 5), 25))
  )
  update public.account_deletion_jobs jobs
  set state = 'processing',
      locked_at = now(),
      attempt_count = jobs.attempt_count + 1
  where jobs.id in (select id from candidates)
  returning jobs.*;
end;
$$;
revoke all on function public.claim_account_deletion_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_jobs(integer) to service_role;

alter table public.billing_event_ledger
  add column if not exists next_attempt_at timestamptz not null default now(),
  add column if not exists locked_at timestamptz;
alter table public.billing_event_ledger drop constraint if exists billing_event_ledger_processing_status_check;
alter table public.billing_event_ledger add constraint billing_event_ledger_processing_status_check
  check (processing_status in ('received', 'processing', 'processed', 'ignored', 'retryable_error', 'terminal_error'));
drop index if exists public.billing_event_ledger_retry_idx;
create index billing_event_ledger_retry_idx
  on public.billing_event_ledger (processing_status, next_attempt_at, received_at)
  where processing_status in ('received', 'retryable_error', 'processing');

create or replace function public.claim_billing_event(
  p_provider text,
  p_provider_event_id text,
  p_lease_seconds integer default 120
)
returns setof public.billing_event_ledger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  return query
  update public.billing_event_ledger events
  set processing_status = 'processing',
      processing_attempts = events.processing_attempts + 1,
      locked_at = now(),
      next_attempt_at = now() + make_interval(secs => safe_lease)
  where events.provider = p_provider
    and events.provider_event_id = p_provider_event_id
    and events.processing_status in ('received', 'retryable_error', 'processing')
    and events.next_attempt_at <= now()
    and (events.locked_at is null or events.locked_at < now() - make_interval(secs => safe_lease))
  returning events.*;
end;
$$;

create or replace function public.claim_billing_events(
  p_batch_size integer default 10,
  p_lease_seconds integer default 120
)
returns setof public.billing_event_ledger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_lease integer := greatest(30, least(coalesce(p_lease_seconds, 120), 600));
begin
  return query
  with candidates as (
    select events.id
    from public.billing_event_ledger events
    where events.processing_status in ('received', 'retryable_error', 'processing')
      and events.next_attempt_at <= now()
      and (events.locked_at is null or events.locked_at < now() - make_interval(secs => safe_lease))
    order by events.received_at
    for update skip locked
    limit greatest(1, least(coalesce(p_batch_size, 10), 100))
  )
  update public.billing_event_ledger events
  set processing_status = 'processing',
      processing_attempts = events.processing_attempts + 1,
      locked_at = now(),
      next_attempt_at = now() + make_interval(secs => safe_lease)
  where events.id in (select id from candidates)
  returning events.*;
end;
$$;
revoke all on function public.claim_billing_event(text, text, integer) from public, anon, authenticated;
revoke all on function public.claim_billing_events(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_billing_event(text, text, integer) to service_role;
grant execute on function public.claim_billing_events(integer, integer) to service_role;
