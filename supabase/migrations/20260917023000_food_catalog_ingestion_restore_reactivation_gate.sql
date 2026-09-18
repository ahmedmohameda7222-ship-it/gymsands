create table public.food_catalog_ingestion_restore_blocks (
  run_id uuid primary key references public.food_ingestion_runs(id) on delete restrict,
  restored_status text not null,
  restored_lease_epoch bigint not null check (restored_lease_epoch >= 0),
  blocked_at timestamptz not null default clock_timestamp(),
  constraint food_catalog_ingestion_restore_blocks_status_check
    check (restored_status in ('prepared', 'running'))
);

alter table public.food_catalog_ingestion_restore_blocks enable row level security;

revoke all privileges on table public.food_catalog_ingestion_restore_blocks from public;
revoke all privileges on table public.food_catalog_ingestion_restore_blocks from anon;
revoke all privileges on table public.food_catalog_ingestion_restore_blocks from authenticated;
revoke all privileges on table public.food_catalog_ingestion_restore_blocks from service_role;

create or replace function private.food_catalog_ingestion_require_not_restore_blocked_v1(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.food_catalog_ingestion_restore_blocks restore_block
    where restore_block.run_id = p_run_id
  ) then
    raise exception 'Restored Food Catalog ingestion run is operationally blocked pending explicit reconciliation.'
      using errcode = '55000';
  end if;
end
$function$;

revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid) from public;
revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid) from anon;
revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid) from authenticated;
revoke all on function private.food_catalog_ingestion_require_not_restore_blocked_v1(uuid) from service_role;

create or replace function private.food_catalog_ingestion_replay_acquire_operation_v2(
  p_command jsonb,
  p_caller_run_id uuid
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_operation_id uuid;
  v_checksum text;
  v_row public.food_ingestion_control_operations%rowtype;
  v_result_run_id uuid;
begin
  v_operation_id := nullif(p_command->>'operationId', '')::uuid;
  v_checksum := lower(coalesce(p_command->>'commandChecksumSha256', ''));
  if v_operation_id is null or v_checksum !~ '^[0-9a-f]{64}
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_owner text := btrim(coalesce(p_command->>'leaseOwner', ''));
  v_token uuid := (p_command->>'leaseToken')::uuid;
  v_seconds integer := coalesce((p_command->>'leaseSeconds')::integer, 120);
  v_batch_id uuid;
  v_run public.food_ingestion_runs%rowtype;
  v_takeover boolean := false;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_acquire_operation_v2(
    p_command,
    v_run_id
  );
  if v_replay is not null then return v_replay; end if;
  if v_owner = '' or v_seconds < 15 or v_seconds > 900 then raise exception 'Invalid Food Catalog ingestion lease request.' using errcode = '22023'; end if;

  select run.batch_id into v_batch_id
  from public.food_ingestion_runs run
  where run.id = v_run_id and run.execution_mode = 'production' and run.status in ('prepared', 'running');
  if not found then
    raise exception 'Lease acquisition requires a nonterminal Production ingestion run.' using errcode = '55000';
  end if;

  perform 1 from public.food_ingestion_batches where id = v_batch_id for update;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found or v_run.execution_mode <> 'production' or v_run.status not in ('prepared', 'running') then
    raise exception 'Lease acquisition target changed before authority could be locked.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.food_ingestion_runs other_run
    where other_run.batch_id = v_batch_id
      and other_run.id <> v_run_id
      and other_run.execution_mode = 'production'
      and other_run.status = 'running'
      and other_run.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'Food Catalog ingestion batch already has another live Production lease.' using errcode = '55P03';
  end if;
  if v_run.lease_token is not null and v_run.lease_expires_at > clock_timestamp() then
    raise exception 'Food Catalog ingestion run already has a live lease.' using errcode = '55P03';
  end if;

  perform 1
  from public.food_ingestion_runs stale_run
  where stale_run.batch_id = v_batch_id
    and stale_run.id <> v_run_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp()
  order by stale_run.attempt_number, stale_run.id
  for update;

  v_takeover := exists (
    select 1 from public.food_ingestion_runs stale_run
    where stale_run.batch_id = v_batch_id
      and stale_run.execution_mode = 'production'
      and stale_run.status = 'running'
      and stale_run.lease_token is not null
      and stale_run.lease_expires_at <= clock_timestamp()
  );

  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  select stale_run.batch_id, stale_run.id, 'lease_lost',
         jsonb_build_object('leaseOwner', stale_run.lease_owner, 'leaseToken', stale_run.lease_token, 'leaseEpoch', stale_run.lease_epoch, 'leaseExpiresAt', stale_run.lease_expires_at),
         lower(p_command->>'commandChecksumSha256')
  from public.food_ingestion_runs stale_run
  where stale_run.batch_id = v_batch_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp()
    and not exists (
      select 1 from public.food_ingestion_operational_events lost_event
      where lost_event.run_id = stale_run.id
        and lost_event.event_type = 'lease_lost'
        and nullif(lost_event.payload_json->>'leaseEpoch', '')::bigint = stale_run.lease_epoch
    );

  update public.food_ingestion_runs stale_run
  set status = 'cancelled',
      completed_at = clock_timestamp(),
      error_summary = coalesce(stale_run.error_summary, 'superseded by cross-attempt stale lease takeover'),
      lease_owner = null,
      lease_token = null,
      lease_acquired_at = null,
      lease_heartbeat_at = null,
      lease_expires_at = null
  where stale_run.batch_id = v_batch_id
    and stale_run.id <> v_run_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp();

  update public.food_ingestion_runs
  set status = 'running',
      started_at = coalesce(started_at, clock_timestamp()),
      lease_owner = v_owner,
      lease_token = v_token,
      lease_epoch = food_ingestion_runs.lease_epoch + 1,
      lease_acquired_at = clock_timestamp(),
      lease_heartbeat_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => v_seconds)
  where id = v_run_id
  returning * into v_run;

  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  values (
    v_batch_id, v_run.id, case when v_takeover then 'lease_takeover' else 'lease_acquired' end,
    jsonb_build_object('leaseOwner', v_run.lease_owner, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at),
    lower(p_command->>'commandChecksumSha256')
  );

  v_result := jsonb_build_object('runId', v_run.id, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_acquire_lease_v2', v_run.id, v_result);
end
$function$;
 then
    raise exception 'Food Catalog ingestion command requires operationId and SHA-256 command checksum.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_operation_id::text, 0));

  select *
    into v_row
  from public.food_ingestion_control_operations
  where operation_id = v_operation_id;

  if not found then
    perform private.food_catalog_ingestion_require_not_restore_blocked_v1(p_caller_run_id);
    return null;
  end if;

  if v_row.command_name <> 'food_catalog_ingestion_acquire_lease_v2'
     or lower(v_row.command_checksum_sha256) <> v_checksum then
    raise exception 'Food Catalog ingestion operation replay conflict.'
      using errcode = '23505';
  end if;

  if v_row.run_id is null then
    raise exception 'Food Catalog acquire replay authority is missing persisted run identity.'
      using errcode = '23514';
  end if;

  begin
    v_result_run_id := nullif(v_row.result_json->>'runId', '')::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Food Catalog acquire replay authority has invalid persisted result run identity.'
        using errcode = '23514';
  end;

  if v_result_run_id is null or v_result_run_id is distinct from v_row.run_id then
    raise exception 'Food Catalog acquire replay authority run identity is inconsistent.'
      using errcode = '23514';
  end if;

  perform private.food_catalog_ingestion_require_not_restore_blocked_v1(v_row.run_id);

  if p_caller_run_id is distinct from v_row.run_id then
    raise exception 'Food Catalog ingestion acquire replay run identity conflict.'
      using errcode = '23505';
  end if;

  return v_row.result_json;
end
$function$;

revoke all on function private.food_catalog_ingestion_replay_acquire_operation_v2(jsonb, uuid) from public;
revoke all on function private.food_catalog_ingestion_replay_acquire_operation_v2(jsonb, uuid) from anon;
revoke all on function private.food_catalog_ingestion_replay_acquire_operation_v2(jsonb, uuid) from authenticated;
revoke all on function private.food_catalog_ingestion_replay_acquire_operation_v2(jsonb, uuid) from service_role;

create or replace function public.food_catalog_ingestion_acquire_lease_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_owner text := btrim(coalesce(p_command->>'leaseOwner', ''));
  v_token uuid := (p_command->>'leaseToken')::uuid;
  v_seconds integer := coalesce((p_command->>'leaseSeconds')::integer, 120);
  v_batch_id uuid;
  v_run public.food_ingestion_runs%rowtype;
  v_takeover boolean := false;
  v_result jsonb;
begin
  perform private.food_catalog_ingestion_require_not_restore_blocked_v1(v_run_id);
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_acquire_lease_v2');
  if v_replay is not null then return v_replay; end if;
  if v_owner = '' or v_seconds < 15 or v_seconds > 900 then raise exception 'Invalid Food Catalog ingestion lease request.' using errcode = '22023'; end if;

  select run.batch_id into v_batch_id
  from public.food_ingestion_runs run
  where run.id = v_run_id and run.execution_mode = 'production' and run.status in ('prepared', 'running');
  if not found then
    raise exception 'Lease acquisition requires a nonterminal Production ingestion run.' using errcode = '55000';
  end if;

  perform 1 from public.food_ingestion_batches where id = v_batch_id for update;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found or v_run.execution_mode <> 'production' or v_run.status not in ('prepared', 'running') then
    raise exception 'Lease acquisition target changed before authority could be locked.' using errcode = '55000';
  end if;

  if exists (
    select 1 from public.food_ingestion_runs other_run
    where other_run.batch_id = v_batch_id
      and other_run.id <> v_run_id
      and other_run.execution_mode = 'production'
      and other_run.status = 'running'
      and other_run.lease_expires_at > clock_timestamp()
  ) then
    raise exception 'Food Catalog ingestion batch already has another live Production lease.' using errcode = '55P03';
  end if;
  if v_run.lease_token is not null and v_run.lease_expires_at > clock_timestamp() then
    raise exception 'Food Catalog ingestion run already has a live lease.' using errcode = '55P03';
  end if;

  perform 1
  from public.food_ingestion_runs stale_run
  where stale_run.batch_id = v_batch_id
    and stale_run.id <> v_run_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp()
  order by stale_run.attempt_number, stale_run.id
  for update;

  v_takeover := exists (
    select 1 from public.food_ingestion_runs stale_run
    where stale_run.batch_id = v_batch_id
      and stale_run.execution_mode = 'production'
      and stale_run.status = 'running'
      and stale_run.lease_token is not null
      and stale_run.lease_expires_at <= clock_timestamp()
  );

  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  select stale_run.batch_id, stale_run.id, 'lease_lost',
         jsonb_build_object('leaseOwner', stale_run.lease_owner, 'leaseToken', stale_run.lease_token, 'leaseEpoch', stale_run.lease_epoch, 'leaseExpiresAt', stale_run.lease_expires_at),
         lower(p_command->>'commandChecksumSha256')
  from public.food_ingestion_runs stale_run
  where stale_run.batch_id = v_batch_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp()
    and not exists (
      select 1 from public.food_ingestion_operational_events lost_event
      where lost_event.run_id = stale_run.id
        and lost_event.event_type = 'lease_lost'
        and nullif(lost_event.payload_json->>'leaseEpoch', '')::bigint = stale_run.lease_epoch
    );

  update public.food_ingestion_runs stale_run
  set status = 'cancelled',
      completed_at = clock_timestamp(),
      error_summary = coalesce(stale_run.error_summary, 'superseded by cross-attempt stale lease takeover'),
      lease_owner = null,
      lease_token = null,
      lease_acquired_at = null,
      lease_heartbeat_at = null,
      lease_expires_at = null
  where stale_run.batch_id = v_batch_id
    and stale_run.id <> v_run_id
    and stale_run.execution_mode = 'production'
    and stale_run.status = 'running'
    and stale_run.lease_token is not null
    and stale_run.lease_expires_at <= clock_timestamp();

  update public.food_ingestion_runs
  set status = 'running',
      started_at = coalesce(started_at, clock_timestamp()),
      lease_owner = v_owner,
      lease_token = v_token,
      lease_epoch = food_ingestion_runs.lease_epoch + 1,
      lease_acquired_at = clock_timestamp(),
      lease_heartbeat_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => v_seconds)
  where id = v_run_id
  returning * into v_run;

  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  values (
    v_batch_id, v_run.id, case when v_takeover then 'lease_takeover' else 'lease_acquired' end,
    jsonb_build_object('leaseOwner', v_run.lease_owner, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at),
    lower(p_command->>'commandChecksumSha256')
  );

  v_result := jsonb_build_object('runId', v_run.id, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_acquire_lease_v2', v_run.id, v_result);
end
$function$;
