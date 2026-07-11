-- Additive, dry-run-first privacy lifecycle foundation.
-- This migration creates no destructive trigger and performs no account deletion.

create table if not exists public.account_access_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'active'
    check (state in ('active', 'deletion_pending', 'deletion_processing', 'legal_hold', 'disabled')),
  reason_code text,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.account_access_states (user_id, state)
select id, 'active'
from auth.users
on conflict (user_id) do nothing;

create or replace function public.ensure_account_access_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.account_access_states (user_id, state)
  values (new.id, 'active')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists ensure_account_access_state_on_profile on public.profiles;
create trigger ensure_account_access_state_on_profile
after insert on public.profiles
for each row execute function public.ensure_account_access_state();

revoke all on function public.ensure_account_access_state() from public, anon, authenticated;
grant execute on function public.ensure_account_access_state() to service_role;

alter table public.account_access_states enable row level security;
drop policy if exists account_access_states_select_own on public.account_access_states;
create policy account_access_states_select_own
  on public.account_access_states
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.account_access_states from public, anon, authenticated;
grant select on table public.account_access_states to authenticated;
grant all on table public.account_access_states to service_role;

create table if not exists public.privacy_deletion_legal_holds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason_code text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  release_reason_code text
);

create unique index if not exists privacy_deletion_legal_holds_active_user_idx
  on public.privacy_deletion_legal_holds (user_id)
  where released_at is null;

alter table public.privacy_deletion_legal_holds enable row level security;
revoke all on table public.privacy_deletion_legal_holds from public, anon, authenticated;
grant all on table public.privacy_deletion_legal_holds to service_role;

alter table public.privacy_requests
  add column if not exists reauthenticated_at timestamptz,
  add column if not exists impact_version text,
  add column if not exists idempotency_key_hash text;

create unique index if not exists privacy_requests_user_idempotency_idx
  on public.privacy_requests (user_id, idempotency_key_hash)
  where idempotency_key_hash is not null;

create table if not exists public.account_deletion_jobs (
  id uuid primary key default gen_random_uuid(),
  request_id uuid unique references public.privacy_requests(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  subject_hash text not null,
  idempotency_key_hash text not null unique,
  state text not null default 'queued'
    check (state in ('queued', 'processing', 'blocked_legal_hold', 'retry_scheduled', 'completed', 'failed')),
  stage text not null default 'queued'
    check (stage in ('queued', 'revoking_connections', 'disabling_access', 'deleting_storage', 'provider_cleanup', 'deleting_database', 'notification', 'completed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error_code text,
  evidence jsonb not null default '{}'::jsonb,
  notification_status text not null default 'pending'
    check (notification_status in ('pending', 'sent', 'not_configured', 'failed')),
  notification_recipient_ciphertext text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists account_deletion_jobs_queue_idx
  on public.account_deletion_jobs (state, next_attempt_at, created_at)
  where state in ('queued', 'retry_scheduled');
create index if not exists account_deletion_jobs_user_idx
  on public.account_deletion_jobs (user_id, created_at desc);

alter table public.account_deletion_jobs enable row level security;
revoke all on table public.account_deletion_jobs from public, anon, authenticated;
grant all on table public.account_deletion_jobs to service_role;

create or replace function public.claim_account_deletion_jobs(p_batch_size integer default 5)
returns setof public.account_deletion_jobs
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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
  set
    state = 'processing',
    locked_at = now(),
    attempt_count = jobs.attempt_count + 1
  where jobs.id in (select id from candidates)
  returning jobs.*;
end;
$$;

revoke all on function public.claim_account_deletion_jobs(integer) from public, anon, authenticated;
grant execute on function public.claim_account_deletion_jobs(integer) to service_role;

drop trigger if exists account_access_states_updated_at on public.account_access_states;
create trigger account_access_states_updated_at
before update on public.account_access_states
for each row execute function public.set_updated_at();

drop trigger if exists account_deletion_jobs_updated_at on public.account_deletion_jobs;
create trigger account_deletion_jobs_updated_at
before update on public.account_deletion_jobs
for each row execute function public.set_updated_at();

create or replace function public.cleanup_privacy_retention_artifacts(
  p_batch_size integer,
  p_mcp_audit_days integer,
  p_security_log_days integer,
  p_completed_request_days integer,
  p_deletion_evidence_days integer,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch integer := greatest(1, least(coalesce(p_batch_size, 1000), 5000));
  mcp_count integer := 0;
  external_count integer := 0;
  email_count integer := 0;
  request_count integer := 0;
  evidence_count integer := 0;
begin
  if p_mcp_audit_days is null or p_security_log_days is null
    or p_completed_request_days is null or p_deletion_evidence_days is null
    or p_mcp_audit_days < 1 or p_security_log_days < 1
    or p_completed_request_days < 1 or p_deletion_evidence_days < 1 then
    raise exception 'Retention periods must be positive, owner-approved day counts';
  end if;

  select count(*) into mcp_count from (
    select 1 from public.mcp_audit_logs
    where created_at < now() - make_interval(days => p_mcp_audit_days)
    limit safe_batch
  ) candidates;
  select count(*) into external_count from (
    select 1 from public.external_api_logs
    where created_at < now() - make_interval(days => p_security_log_days)
    limit safe_batch
  ) candidates;
  select count(*) into email_count from (
    select 1 from public.email_logs
    where created_at < now() - make_interval(days => p_security_log_days)
    limit safe_batch
  ) candidates;
  select count(*) into request_count from (
    select 1 from public.privacy_requests
    where status = 'completed'
      and completed_at < now() - make_interval(days => p_completed_request_days)
    limit safe_batch
  ) candidates;
  select count(*) into evidence_count from (
    select 1 from public.account_deletion_jobs
    where state = 'completed'
      and notification_recipient_ciphertext is null
      and completed_at < now() - make_interval(days => p_deletion_evidence_days)
    limit safe_batch
  ) candidates;

  if not p_dry_run then
    delete from public.mcp_audit_logs where id in (
      select id from public.mcp_audit_logs where created_at < now() - make_interval(days => p_mcp_audit_days) order by created_at limit safe_batch
    );
    delete from public.external_api_logs where id in (
      select id from public.external_api_logs where created_at < now() - make_interval(days => p_security_log_days) order by created_at limit safe_batch
    );
    delete from public.email_logs where id in (
      select id from public.email_logs where created_at < now() - make_interval(days => p_security_log_days) order by created_at limit safe_batch
    );
    delete from public.privacy_requests where id in (
      select id from public.privacy_requests
      where status = 'completed' and completed_at < now() - make_interval(days => p_completed_request_days)
      order by completed_at limit safe_batch
    );
    delete from public.account_deletion_jobs where id in (
      select id from public.account_deletion_jobs
      where state = 'completed'
        and notification_recipient_ciphertext is null
        and completed_at < now() - make_interval(days => p_deletion_evidence_days)
      order by completed_at limit safe_batch
    );
  end if;

  return jsonb_build_object(
    'dry_run', p_dry_run,
    'batch_size', safe_batch,
    'mcp_audit_logs', mcp_count,
    'external_api_logs', external_count,
    'email_logs', email_count,
    'completed_privacy_requests', request_count,
    'account_deletion_evidence', evidence_count
  );
end;
$$;

revoke all on function public.cleanup_privacy_retention_artifacts(integer, integer, integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.cleanup_privacy_retention_artifacts(integer, integer, integer, integer, integer, boolean)
  to service_role;

create or replace function public.cleanup_expired_mcp_oauth_artifacts_v2(
  p_batch_size integer,
  p_code_hours integer,
  p_access_token_days integer,
  p_dry_run boolean default true
)
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
begin
  if p_code_hours < 1 or p_access_token_days < 1 then
    raise exception 'OAuth retention periods must be positive owner-approved values';
  end if;
  select count(*) into code_count from (
    select 1 from public.mcp_oauth_authorization_codes
    where expires_at < now() - make_interval(hours => p_code_hours)
       or used_at < now() - make_interval(hours => p_code_hours)
    limit safe_batch
  ) candidates;
  select count(*) into token_count from (
    select 1 from public.mcp_oauth_access_tokens
    where expires_at < now() - make_interval(days => p_access_token_days)
       or revoked_at < now() - make_interval(days => p_access_token_days)
    limit safe_batch
  ) candidates;
  select count(*) into assertion_count from (
    select 1 from public.mcp_oauth_client_assertions
    where expires_at < now() - make_interval(hours => p_code_hours)
    limit safe_batch
  ) candidates;
  if not p_dry_run then
    delete from public.mcp_oauth_authorization_codes where id in (
      select id from public.mcp_oauth_authorization_codes
      where expires_at < now() - make_interval(hours => p_code_hours)
         or used_at < now() - make_interval(hours => p_code_hours)
      order by expires_at limit safe_batch
    );
    delete from public.mcp_oauth_access_tokens where id in (
      select id from public.mcp_oauth_access_tokens
      where expires_at < now() - make_interval(days => p_access_token_days)
         or revoked_at < now() - make_interval(days => p_access_token_days)
      order by expires_at limit safe_batch
    );
    delete from public.mcp_oauth_client_assertions where id in (
      select id from public.mcp_oauth_client_assertions
      where expires_at < now() - make_interval(hours => p_code_hours)
      order by expires_at limit safe_batch
    );
  end if;
  return jsonb_build_object(
    'dry_run', p_dry_run,
    'authorization_codes', code_count,
    'access_tokens', token_count,
    'client_assertions', assertion_count
  );
end;
$$;

revoke all on function public.cleanup_expired_mcp_oauth_artifacts_v2(integer, integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_mcp_oauth_artifacts_v2(integer, integer, integer, boolean)
  to service_role;
revoke execute on function public.cleanup_expired_mcp_oauth_artifacts(integer) from service_role;

create or replace function public.cleanup_expired_mcp_idempotency_keys_v2(
  p_batch_size integer,
  p_days_after_expiry integer,
  p_dry_run boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  safe_batch integer := greatest(1, least(coalesce(p_batch_size, 1000), 5000));
  candidate_count integer := 0;
begin
  if p_days_after_expiry < 0 then
    raise exception 'Idempotency retention must be a non-negative owner-approved value';
  end if;
  select count(*) into candidate_count from (
    select 1 from public.mcp_idempotency_keys
    where expires_at < now() - make_interval(days => p_days_after_expiry)
    limit safe_batch
  ) candidates;
  if not p_dry_run then
    delete from public.mcp_idempotency_keys where id in (
      select id from public.mcp_idempotency_keys
      where expires_at < now() - make_interval(days => p_days_after_expiry)
      order by expires_at limit safe_batch
    );
  end if;
  return jsonb_build_object('dry_run', p_dry_run, 'idempotency_keys', candidate_count);
end;
$$;

revoke all on function public.cleanup_expired_mcp_idempotency_keys_v2(integer, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_mcp_idempotency_keys_v2(integer, integer, boolean)
  to service_role;
revoke execute on function public.cleanup_expired_mcp_idempotency_keys(integer) from service_role;

comment on table public.account_deletion_jobs is
  'Service-only idempotent deletion lifecycle and minimized audit evidence. Destructive execution is application-feature-flag gated.';
comment on table public.privacy_deletion_legal_holds is
  'Service-only active/released legal holds. A hold blocks deletion execution and does not silently reject the member request.';
comment on function public.cleanup_privacy_retention_artifacts(integer, integer, integer, integer, integer, boolean) is
  'Bounded dry-run-capable cleanup. Periods must be supplied from the owner/legal-approved retention policy configuration.';
