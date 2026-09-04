begin;

-- Food Catalog Intelligence Plan 4: provider-neutral ingestion V2 authority only.
-- This migration creates draft-only ingestion command authority. It does not populate
-- Production Food data, activate/verify Foods, create/promote generations, or move the
-- released compatibility marker.

-- Catalog drafts may have no legacy serving label. Structured serving evidence remains
-- authoritative; released active Foods are not changed by this nullable relaxation.
alter table public.food_items alter column serving_size drop not null;

alter table public.food_ingestion_batches
  add column semantic_identity_checksum_sha256 text,
  add column expected_quarantine_count integer not null default 0 check (expected_quarantine_count >= 0),
  add constraint food_ingestion_batches_semantic_identity_checksum_check check (
    semantic_identity_checksum_sha256 is null
    or semantic_identity_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'
  );

-- Batch 0's source/config uniqueness was a readiness placeholder. Plan 4 makes the full
-- semantic checksum (source + deterministic manifest + expected counts) authoritative.
do $drop_batch0_semantic_placeholder$
declare
  v_constraint text;
begin
  select constraint_row.conname
    into v_constraint
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.food_ingestion_batches'::pg_catalog.regclass
    and constraint_row.contype = 'u'
    and pg_catalog.pg_get_constraintdef(constraint_row.oid) ilike '%provider%dataset_name%source_version%source_checksum_sha256%importer_version%config_checksum_sha256%'
  limit 1;

  if v_constraint is not null then
    execute pg_catalog.format('alter table public.food_ingestion_batches drop constraint %I', v_constraint);
  end if;
end
$drop_batch0_semantic_placeholder$;

create unique index food_ingestion_batches_semantic_identity_uq
  on public.food_ingestion_batches(semantic_identity_checksum_sha256)
  where semantic_identity_checksum_sha256 is not null;

alter table public.food_ingestion_runs
  add column observed_possible_duplicate_count integer check (observed_possible_duplicate_count is null or observed_possible_duplicate_count >= 0),
  add column observed_quarantine_count integer check (observed_quarantine_count is null or observed_quarantine_count >= 0),
  add column lease_owner text,
  add column lease_token uuid,
  add column lease_epoch bigint not null default 0 check (lease_epoch >= 0),
  add column lease_acquired_at timestamptz,
  add column lease_heartbeat_at timestamptz,
  add column lease_expires_at timestamptz,
  add constraint food_ingestion_runs_lease_shape_check check (
    (
      lease_owner is null and lease_token is null and lease_acquired_at is null
      and lease_heartbeat_at is null and lease_expires_at is null
    )
    or (
      execution_mode = 'production'
      and status = 'running'
      and lease_owner is not null and length(btrim(lease_owner)) > 0
      and lease_token is not null
      and lease_epoch > 0
      and lease_acquired_at is not null
      and lease_heartbeat_at is not null
      and lease_expires_at is not null
      and lease_expires_at >= lease_heartbeat_at
      and lease_heartbeat_at >= lease_acquired_at
    )
  );

create or replace function public.food_ingestion_batch_identity_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.review_state <> 'prepared' and new.review_state = 'prepared' then
    raise exception 'Reviewed Food ingestion batch cannot return to prepared.' using errcode = '23514';
  end if;

  if new.review_state is distinct from old.review_state
     and not (
       (old.review_state = 'prepared' and new.review_state = 'reviewed')
       or (old.review_state = 'reviewed' and new.review_state in ('approved', 'rejected'))
       or (old.review_state = 'approved' and new.review_state = 'superseded')
     )
  then
    raise exception 'Invalid Food ingestion batch review-state transition: % -> %.', old.review_state, new.review_state
      using errcode = '23514';
  end if;

  if old.review_state = 'approved' and new.review_state = 'superseded' then
    perform 1
    from public.food_ingestion_batches
    where id = old.id
    for update;

    if exists (
      select 1
      from public.food_ingestion_runs
      where batch_id = old.id
        and execution_mode = 'production'
        and status in ('prepared', 'running')
    ) then
      raise exception 'Approved Food ingestion batch cannot be superseded while Production runs are nonterminal.'
        using errcode = '23514';
    end if;
  end if;

  if old.review_state <> 'prepared' or new.review_state <> 'prepared' then
    if new.provider is distinct from old.provider
       or new.dataset_name is distinct from old.dataset_name
       or new.source_version is distinct from old.source_version
       or new.source_release_date is distinct from old.source_release_date
       or new.license_name is distinct from old.license_name
       or new.license_reference is distinct from old.license_reference
       or new.source_reference is distinct from old.source_reference
       or new.source_checksum_sha256 is distinct from old.source_checksum_sha256
       or new.importer_version is distinct from old.importer_version
       or new.config_checksum_sha256 is distinct from old.config_checksum_sha256
       or new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256
       or new.semantic_identity_checksum_sha256 is distinct from old.semantic_identity_checksum_sha256
       or new.input_count is distinct from old.input_count
       or new.accepted_count is distinct from old.accepted_count
       or new.rejected_count is distinct from old.rejected_count
       or new.matched_count is distinct from old.matched_count
       or new.created_count is distinct from old.created_count
       or new.possible_duplicate_count is distinct from old.possible_duplicate_count
       or new.expected_quarantine_count is distinct from old.expected_quarantine_count
    then
      raise exception 'Reviewed Food ingestion batch semantic authority is immutable.' using errcode = '23514';
    end if;
  end if;

  if old.reviewed_at is not null and new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Established Food ingestion batch reviewed_at is immutable.' using errcode = '23514';
  end if;
  if old.approved_at is not null and new.approved_at is distinct from old.approved_at then
    raise exception 'Established Food ingestion batch approved_at is immutable.' using errcode = '23514';
  end if;
  if old.approval_reference is not null and new.approval_reference is distinct from old.approval_reference then
    raise exception 'Established Food ingestion batch approval_reference is immutable.' using errcode = '23514';
  end if;
  return new;
end
$function$;

create table public.food_ingestion_control_operations (
  operation_id uuid primary key,
  command_name text not null check (command_name ~ '^food_catalog_ingestion_[a-z0-9_]+_v2$'),
  command_checksum_sha256 text not null check (command_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  run_id uuid references public.food_ingestion_runs(id) on delete restrict,
  result_json jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);

-- Immutable deterministic per-record authority captured during the reviewed dry run.
create table public.food_ingestion_manifest_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  source_record_key text not null check (length(btrim(source_record_key)) > 0),
  source_record_id uuid not null references public.food_source_records(id) on delete restrict,
  manifest_content_checksum_sha256 text not null check (manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  candidate_json jsonb not null,
  decision_json jsonb not null check (decision_json->>'kind' in ('match', 'create', 'possible_duplicate', 'reject')),
  disposition_json jsonb not null check (disposition_json->>'kind' in ('accept', 'quarantine', 'reject')),
  planned_food_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  unique (batch_id, source_record_key),
  unique (batch_id, source_record_id),
  check (
    (disposition_json->>'kind' = 'accept' and decision_json->>'kind' in ('match', 'create') and planned_food_id is not null)
    or not (disposition_json->>'kind' = 'accept' and decision_json->>'kind' in ('match', 'create'))
  )
);

-- One materialized accepted canonical write per semantic batch/source record. This table
-- is intentionally run-attempt independent so a later attempt can acknowledge an already
-- committed mutation without re-inserting canonical facts.
create table public.food_ingestion_materialized_results (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  source_record_key text not null check (length(btrim(source_record_key)) > 0),
  source_record_id uuid not null references public.food_source_records(id) on delete restrict,
  food_id uuid not null references public.food_items(id) on delete restrict,
  decision_kind text not null check (decision_kind in ('match', 'create')),
  disposition_kind text not null check (disposition_kind = 'accept'),
  manifest_content_checksum_sha256 text not null check (manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  first_run_id uuid not null references public.food_ingestion_runs(id) on delete restrict,
  result_json jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (batch_id, source_record_key)
);

create table public.food_ingestion_quarantines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  run_id uuid not null references public.food_ingestion_runs(id) on delete restrict,
  source_record_key text not null check (length(btrim(source_record_key)) > 0),
  source_record_id uuid references public.food_source_records(id) on delete restrict,
  manifest_content_checksum_sha256 text not null check (manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  canonical_outcome text not null check (canonical_outcome in ('match', 'create', 'possible_duplicate', 'reject')),
  reason_codes text[] not null check (
    cardinality(reason_codes) > 0
    and reason_codes <@ array[
      'possible_duplicate', 'identity_conflict', 'barcode_conflict', 'nutrition_anomaly',
      'serving_conflict', 'source_release_break', 'mapping_ambiguity',
      'evidence_inconsistency', 'suspicious_material_change'
    ]::text[]
  ),
  candidate_food_ids uuid[] not null default '{}'::uuid[],
  evidence_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (run_id, source_record_key)
);

create table public.food_ingestion_quarantine_resolutions (
  id uuid primary key default gen_random_uuid(),
  quarantine_id uuid not null unique references public.food_ingestion_quarantines(id) on delete restrict,
  resolution_action text not null check (resolution_action in ('match', 'create', 'reject')),
  resolved_food_id uuid references public.food_items(id) on delete restrict,
  reason_code text not null check (length(btrim(reason_code)) > 0),
  authority_reference text not null check (length(btrim(authority_reference)) > 0),
  created_at timestamptz not null default clock_timestamp(),
  check (
    (resolution_action in ('match', 'create') and resolved_food_id is not null)
    or (resolution_action = 'reject' and resolved_food_id is null)
  )
);

create table public.food_ingestion_reconciliations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.food_ingestion_runs(id) on delete restrict,
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  manifest_content_checksum_sha256 text not null check (manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  semantic_identity_checksum_sha256 text not null check (semantic_identity_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  expected_counts jsonb not null,
  observed_counts jsonb not null,
  mismatch_codes text[] not null default '{}'::text[] check (
    mismatch_codes <@ array[
      'manifest_checksum_mismatch', 'missing_expected_write', 'unexpected_extra_write', 'duplicate_semantic_result',
      'idempotency_mismatch', 'partial_execution', 'quarantine_divergence', 'outcome_count_mismatch'
    ]::text[]
  ),
  reconciled boolean not null,
  created_at timestamptz not null default clock_timestamp(),
  check ((reconciled and cardinality(mismatch_codes) = 0) or (not reconciled and cardinality(mismatch_codes) > 0))
);

create table public.food_ingestion_release_diffs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  previous_batch_id uuid references public.food_ingestion_batches(id) on delete restrict,
  diff_checksum_sha256 text not null check (diff_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (batch_id, previous_batch_id, diff_checksum_sha256),
  check (previous_batch_id is null or previous_batch_id <> batch_id)
);

create table public.food_ingestion_release_diff_records (
  id uuid primary key default gen_random_uuid(),
  release_diff_id uuid not null references public.food_ingestion_release_diffs(id) on delete restrict,
  source_record_key text not null check (length(btrim(source_record_key)) > 0),
  classifications text[] not null check (
    cardinality(classifications) > 0
    and classifications <@ array[
      'unchanged', 'source_record_added', 'source_record_removed', 'source_record_changed',
      'nutrition_changed', 'serving_changed', 'naming_changed', 'barcode_changed',
      'taxonomy_changed', 'market_evidence_changed', 'canonical_match_changed',
      'newly_quarantined', 'quarantine_resolved', 'suspicious_material_change'
    ]::text[]
  ),
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default clock_timestamp(),
  unique (release_diff_id, source_record_key)
);

create table public.food_ingestion_operational_events (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid references public.food_ingestion_batches(id) on delete restrict,
  run_id uuid references public.food_ingestion_runs(id) on delete restrict,
  source_record_key text,
  event_type text not null check (event_type in (
    'execution_prepared', 'lease_acquired', 'lease_takeover', 'lease_lost', 'lease_heartbeat', 'source_record_added',
    'candidate_recorded', 'candidate_persisted', 'quarantine_recorded',
    'quarantine_resolved', 'reconciliation_recorded', 'release_diff_recorded',
    'execution_completed', 'execution_failed'
  )),
  payload_json jsonb not null default '{}'::jsonb,
  event_checksum_sha256 text not null check (event_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  check (batch_id is not null or run_id is not null)
);

create index food_ingestion_manifest_records_batch_idx on public.food_ingestion_manifest_records(batch_id, source_record_key, id);
create index food_ingestion_materialized_results_batch_idx on public.food_ingestion_materialized_results(batch_id, source_record_key, id);
create index food_ingestion_quarantines_batch_run_idx on public.food_ingestion_quarantines(batch_id, run_id, created_at, id);
create index food_ingestion_release_diffs_batch_idx on public.food_ingestion_release_diffs(batch_id, previous_batch_id, created_at, id);
create index food_ingestion_operational_events_run_idx on public.food_ingestion_operational_events(run_id, created_at, id);

create or replace function private.reject_food_catalog_ingestion_authority_mutation_v2()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception 'Food Catalog ingestion V2 authority rows are immutable.' using errcode = '23514';
end
$function$;

create trigger food_ingestion_control_operations_immutable before update or delete on public.food_ingestion_control_operations for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_manifest_records_immutable before update or delete on public.food_ingestion_manifest_records for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_materialized_results_immutable before update or delete on public.food_ingestion_materialized_results for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_quarantines_immutable before update or delete on public.food_ingestion_quarantines for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_quarantine_resolutions_immutable before update or delete on public.food_ingestion_quarantine_resolutions for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_reconciliations_immutable before update or delete on public.food_ingestion_reconciliations for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_release_diffs_immutable before update or delete on public.food_ingestion_release_diffs for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_release_diff_records_immutable before update or delete on public.food_ingestion_release_diff_records for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();
create trigger food_ingestion_operational_events_immutable before update or delete on public.food_ingestion_operational_events for each row execute function private.reject_food_catalog_ingestion_authority_mutation_v2();

create or replace function private.food_catalog_ingestion_replay_operation_v2(
  p_command jsonb,
  p_command_name text
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_operation_id uuid;
  v_checksum text;
  v_row public.food_ingestion_control_operations%rowtype;
begin
  v_operation_id := nullif(p_command->>'operationId', '')::uuid;
  v_checksum := lower(coalesce(p_command->>'commandChecksumSha256', ''));
  if v_operation_id is null or v_checksum !~ '^[0-9a-f]{64}$' then
    raise exception 'Food Catalog ingestion command requires operationId and SHA-256 command checksum.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_operation_id::text, 0));
  select * into v_row from public.food_ingestion_control_operations where operation_id = v_operation_id;
  if found then
    if v_row.command_name <> p_command_name or lower(v_row.command_checksum_sha256) <> v_checksum then
      raise exception 'Food Catalog ingestion operation replay conflict.' using errcode = '23505';
    end if;
    return v_row.result_json;
  end if;
  return null;
end
$function$;

create or replace function private.food_catalog_ingestion_finish_operation_v2(
  p_command jsonb,
  p_command_name text,
  p_run_id uuid,
  p_result jsonb
)
returns jsonb
language plpgsql
set search_path = pg_catalog, public, private, extensions
as $function$
begin
  insert into public.food_ingestion_control_operations(
    operation_id, command_name, command_checksum_sha256, run_id, result_json
  ) values (
    (p_command->>'operationId')::uuid,
    p_command_name,
    lower(p_command->>'commandChecksumSha256'),
    p_run_id,
    p_result
  );
  return p_result;
end
$function$;

create or replace function private.food_catalog_ingestion_assert_active_lease_v2(
  p_run_id uuid,
  p_lease_token uuid,
  p_lease_epoch bigint
)
returns uuid
language plpgsql
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_batch_id uuid;
begin
  select run.batch_id
    into v_batch_id
  from public.food_ingestion_runs run
  where run.id = p_run_id
    and run.execution_mode = 'production'
    and run.status = 'running'
    and run.lease_token = p_lease_token
    and run.lease_epoch = p_lease_epoch
    and run.lease_expires_at > clock_timestamp()
  for update;
  if not found then
    raise exception 'Food Catalog ingestion Production mutation requires the exact live execution lease.' using errcode = '55000';
  end if;
  return v_batch_id;
end
$function$;

create or replace function public.food_catalog_ingestion_prepare_execution_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_source jsonb := p_command->'source';
  v_expected jsonb := p_command->'expectedMutations';
  v_mode text := p_command->>'executionMode';
  v_attempt integer := coalesce((p_command->>'attemptNumber')::integer, 1);
  v_manifest text := lower(coalesce(p_command->>'manifestContentChecksumSha256', ''));
  v_semantic text := lower(coalesce(p_command->>'semanticIdentityChecksumSha256', ''));
  v_batch public.food_ingestion_batches%rowtype;
  v_run public.food_ingestion_runs%rowtype;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_prepare_execution_v2');
  if v_replay is not null then return v_replay; end if;
  if v_mode not in ('dry_run', 'production') or v_attempt < 1 or v_manifest !~ '^[0-9a-f]{64}$' or v_semantic !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid Food Catalog ingestion execution identity.' using errcode = '22023';
  end if;

  select * into v_batch
  from public.food_ingestion_batches
  where semantic_identity_checksum_sha256 = v_semantic
  for update;

  if not found then
    if v_mode = 'production' then
      raise exception 'Production ingestion cannot create an unreviewed semantic batch.' using errcode = '23514';
    end if;
    insert into public.food_ingestion_batches(
      provider, dataset_name, source_version, source_release_date,
      license_name, license_reference, source_reference, source_checksum_sha256,
      importer_version, config_checksum_sha256, manifest_content_checksum_sha256,
      semantic_identity_checksum_sha256, input_count, accepted_count, rejected_count,
      matched_count, created_count, possible_duplicate_count, expected_quarantine_count
    ) values (
      v_source->>'provider', v_source->>'dataset', v_source->>'sourceVersion', nullif(v_source->>'sourceReleaseDate', '')::date,
      v_source->>'licenseName', nullif(v_source->>'licenseReference', ''), nullif(v_source->>'sourceReference', ''), lower(v_source->>'sourceChecksumSha256'),
      v_source->>'importerVersion', lower(v_source->>'configChecksumSha256'), v_manifest,
      v_semantic, coalesce((v_expected->>'input')::integer, 0), coalesce((v_expected->>'accepted')::integer, 0),
      coalesce((v_expected->>'rejected')::integer, 0), coalesce((v_expected->>'matched')::integer, 0),
      coalesce((v_expected->>'created')::integer, 0), coalesce((v_expected->>'possibleDuplicate')::integer, 0),
      coalesce((v_expected->>'quarantined')::integer, 0)
    ) returning * into v_batch;
  else
    if lower(coalesce(v_batch.manifest_content_checksum_sha256, '')) <> v_manifest then
      raise exception 'Semantic batch identity conflicts with manifest checksum.' using errcode = '23514';
    end if;
    if v_mode = 'production' and (v_batch.review_state <> 'approved' or v_batch.approved_at is null) then
      raise exception 'Production ingestion requires an approved semantic batch.' using errcode = '23514';
    end if;
  end if;

  select * into v_run
  from public.food_ingestion_runs
  where batch_id = v_batch.id and execution_mode = v_mode and attempt_number = v_attempt
  for update;
  if not found then
    insert into public.food_ingestion_runs(
      batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256,
      observed_input_count, observed_accepted_count, observed_rejected_count,
      observed_created_count, observed_matched_count, observed_possible_duplicate_count,
      observed_quarantine_count
    ) values (
      v_batch.id, v_mode, v_attempt, 'prepared', v_manifest,
      0, 0, 0, 0, 0, 0, 0
    ) returning * into v_run;
  elsif lower(v_run.manifest_content_checksum_sha256) <> v_manifest then
    raise exception 'Execution attempt manifest checksum conflict.' using errcode = '23514';
  end if;

  v_result := jsonb_build_object('batchId', v_batch.id, 'runId', v_run.id, 'reviewState', v_batch.review_state, 'executionMode', v_mode);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_prepare_execution_v2', v_run.id, v_result);
end
$function$;

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
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_acquire_lease_v2');
  if v_replay is not null then return v_replay; end if;
  if v_owner = '' or v_seconds < 15 or v_seconds > 900 then raise exception 'Invalid Food Catalog ingestion lease request.' using errcode = '22023'; end if;

  select run.batch_id into v_batch_id
  from public.food_ingestion_runs run
  where run.id = v_run_id and run.execution_mode = 'production' and run.status in ('prepared', 'running');
  if not found then
    raise exception 'Lease acquisition requires a nonterminal Production ingestion run.' using errcode = '55000';
  end if;

  -- Serialize lease authority at semantic-batch scope before locking the individual run.
  perform 1 from public.food_ingestion_batches where id = v_batch_id for update;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;

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

  v_takeover := exists (
    select 1 from public.food_ingestion_runs stale_run
    where stale_run.batch_id = v_batch_id
      and stale_run.execution_mode = 'production'
      and stale_run.status = 'running'
      and stale_run.lease_token is not null
      and stale_run.lease_expires_at <= clock_timestamp()
  );

  -- Record each expired lease epoch once before replacing batch authority.
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

create or replace function public.food_catalog_ingestion_heartbeat_lease_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_token uuid := (p_command->>'leaseToken')::uuid;
  v_epoch bigint := (p_command->>'leaseEpoch')::bigint;
  v_seconds integer := coalesce((p_command->>'leaseSeconds')::integer, 120);
  v_run public.food_ingestion_runs%rowtype;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_heartbeat_lease_v2');
  if v_replay is not null then return v_replay; end if;
  if v_seconds < 15 or v_seconds > 900 then raise exception 'Invalid lease heartbeat duration.' using errcode = '22023'; end if;
  perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, v_token, v_epoch);
  update public.food_ingestion_runs
  set lease_heartbeat_at = clock_timestamp(),
      lease_expires_at = clock_timestamp() + make_interval(secs => v_seconds)
  where id = v_run_id
  returning * into v_run;

  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  values (
    v_run.batch_id, v_run.id, 'lease_heartbeat',
    jsonb_build_object('leaseOwner', v_run.lease_owner, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at),
    lower(p_command->>'commandChecksumSha256')
  );

  v_result := jsonb_build_object('runId', v_run.id, 'leaseToken', v_run.lease_token, 'leaseEpoch', v_run.lease_epoch, 'leaseExpiresAt', v_run.lease_expires_at);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_heartbeat_lease_v2', v_run.id, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_persist_candidate_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_candidate jsonb := p_command->'candidate';
  v_decision_json jsonb := p_command->'decision';
  v_disposition_json jsonb := p_command->'disposition';
  v_decision text := p_command->>'decisionKind';
  v_disposition text := p_command->>'dispositionKind';
  v_run public.food_ingestion_runs%rowtype;
  v_batch public.food_ingestion_batches%rowtype;
  v_source_record public.food_source_records%rowtype;
  v_manifest_record public.food_ingestion_manifest_records%rowtype;
  v_materialized public.food_ingestion_materialized_results%rowtype;
  v_food_id uuid := nullif(p_command->>'foodId', '')::uuid;
  v_membership_outcome text;
  v_revision_number integer;
  v_fact jsonb;
  v_gtin text;
  v_resumed boolean := false;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_persist_candidate_v2');
  if v_replay is not null then return v_replay; end if;

  if jsonb_typeof(v_candidate) <> 'object'
     or jsonb_typeof(v_decision_json) <> 'object'
     or jsonb_typeof(v_disposition_json) <> 'object'
     or v_decision not in ('match', 'create', 'possible_duplicate', 'reject')
     or v_disposition not in ('accept', 'quarantine', 'reject')
     or v_decision <> v_decision_json->>'kind'
     or v_disposition <> v_disposition_json->>'kind'
  then
    raise exception 'Invalid candidate decision/disposition authority.' using errcode = '22023';
  end if;

  if v_disposition = 'accept' and v_decision in ('match', 'create') and v_food_id is null then
    raise exception 'Accepted MATCH/CREATE candidate requires planned canonical foodId.' using errcode = '22023';
  end if;
  if v_decision = 'match' and nullif(v_decision_json->>'foodId', '')::uuid is distinct from v_food_id then
    raise exception 'MATCH decision and planned canonical foodId disagree.' using errcode = '23514';
  end if;

  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found then raise exception 'Unknown Food Catalog ingestion run.' using errcode = '23503'; end if;
  select * into v_batch from public.food_ingestion_batches where id = v_run.batch_id for update;

  if v_run.execution_mode = 'dry_run' and v_run.status not in ('prepared', 'running') then
    raise exception 'Completed dry-run rejects candidate mutation; dry-run run must be prepared or running.' using errcode = '55000';
  end if;

  if v_run.execution_mode = 'production' then
    perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);

    -- Production candidate authority must equal the exact approved per-record manifest.
    select manifest.* into v_manifest_record
    from public.food_ingestion_manifest_records manifest
    join public.food_source_records source on source.id = manifest.source_record_id
    where manifest.batch_id = v_batch.id
      and manifest.source_record_key = v_candidate->>'sourceRecordId'
      and source.provider = v_batch.provider
      and source.source_dataset = v_batch.dataset_name
      and source.source_version = v_batch.source_version
    for share of manifest;

    if not found
       or v_batch.review_state <> 'approved'
       or v_batch.approved_at is null
       or lower(v_manifest_record.manifest_content_checksum_sha256) <> lower(v_batch.manifest_content_checksum_sha256)
       or lower(v_manifest_record.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256)
       or v_manifest_record.candidate_json is distinct from v_candidate
       or v_manifest_record.decision_json is distinct from v_decision_json
       or v_manifest_record.disposition_json is distinct from v_disposition_json
       or v_manifest_record.planned_food_id is distinct from v_food_id
    then
      raise exception 'Production candidate does not match the exact approved per-record manifest authority.' using errcode = '23514';
    end if;

    select source.* into v_source_record
    from public.food_source_records source
    where source.id = v_manifest_record.source_record_id
    for update;

    if v_disposition = 'accept' and v_decision in ('match', 'create') then
      select * into v_materialized
      from public.food_ingestion_materialized_results materialized
      where materialized.batch_id = v_batch.id
        and materialized.source_record_key = v_candidate->>'sourceRecordId'
      for share;

      if found then
        if v_materialized.source_record_id <> v_source_record.id
           or v_materialized.food_id <> v_food_id
           or v_materialized.decision_kind <> v_decision
           or v_materialized.disposition_kind <> v_disposition
           or lower(v_materialized.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256)
        then
          raise exception 'Materialized Food ingestion result conflicts with reviewed semantic authority.' using errcode = '23514';
        end if;
        v_resumed := true;
      else
        if v_decision = 'create' then
          insert into public.food_items(
            id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
            saturated_fat_g, fiber_g, sugars_g, sodium_mg,
            nutrition_basis_amount, nutrition_basis_unit,
            category, cuisine, brand_name, source_type, is_global, is_market_global,
            is_editable_by_user, lifecycle_status
          ) values (
            v_food_id,
            v_candidate->>'canonicalName',
            nullif(v_candidate->>'servingLabel', ''),
            nullif(v_candidate->'nutrition'->>'calories', '')::numeric,
            nullif(v_candidate->'nutrition'->>'protein_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'carbs_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'saturated_fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fiber_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sugars_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sodium_mg', '')::numeric,
            nullif(v_candidate->'nutrition'->>'basis_amount', '')::numeric,
            nullif(v_candidate->'nutrition'->>'basis_unit', ''),
            nullif(v_candidate->>'category', ''), nullif(v_candidate->>'cuisine', ''), nullif(v_candidate->>'brandName', ''),
            'catalog_ingestion_v2', false, false, false, 'draft'
          );
        else
          perform 1 from public.food_items where id = v_food_id and merged_into_food_id is null for update;
          if not found then raise exception 'MATCH target must be a current canonical Food root.' using errcode = '23514'; end if;
        end if;

        if v_source_record.food_id is not null and v_source_record.food_id <> v_food_id then
          raise exception 'Source evidence is already associated with a different canonical Food.' using errcode = '23514';
        end if;
        update public.food_source_records set food_id = v_food_id where id = v_source_record.id and food_id is null;

        -- Persist source-backed Plan 1 structured nutrition facts.
        if v_candidate->'nutrition' is not null
           and coalesce(nullif(v_candidate->'nutrition'->>'basis_amount', '')::numeric, 0) > 0
           and v_candidate->'nutrition'->>'basis_unit' in ('g', 'ml')
           and (
             v_candidate->'nutrition'->>'calories' is not null
             or v_candidate->'nutrition'->>'protein_g' is not null
             or v_candidate->'nutrition'->>'carbs_g' is not null
             or v_candidate->'nutrition'->>'fat_g' is not null
             or v_candidate->'nutrition'->>'saturated_fat_g' is not null
             or v_candidate->'nutrition'->>'fiber_g' is not null
             or v_candidate->'nutrition'->>'sugars_g' is not null
             or v_candidate->'nutrition'->>'sodium_mg' is not null
           )
        then
          select coalesce(max(revision_number), 0) + 1 into v_revision_number
          from public.food_nutrition_revisions
          where food_id = v_food_id;
          insert into public.food_nutrition_revisions(
            food_id, revision_number, calories, protein_g, carbs_g, fat_g,
            saturated_fat_g, fiber_g, sugars_g, sodium_mg, basis_amount, basis_unit,
            source_record_id, nutrient_mapping_version, authority_reference
          ) values (
            v_food_id, v_revision_number,
            nullif(v_candidate->'nutrition'->>'calories', '')::numeric,
            nullif(v_candidate->'nutrition'->>'protein_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'carbs_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'saturated_fat_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'fiber_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sugars_g', '')::numeric,
            nullif(v_candidate->'nutrition'->>'sodium_mg', '')::numeric,
            (v_candidate->'nutrition'->>'basis_amount')::numeric,
            v_candidate->'nutrition'->>'basis_unit',
            v_source_record.id, v_batch.importer_version,
            v_batch.id::text || ':' || v_batch.manifest_content_checksum_sha256
          );
        end if;

        -- Persist structured source names and aliases without inventing locale evidence.
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'names', '[]'::jsonb)) loop
          insert into public.food_names(
            food_id, language_tag, name_role, name_text, normalized_text, script_code,
            origin, source_record_id, policy_version
          ) values (
            v_food_id,
            v_fact->>'locale',
            case v_fact->>'role'
              when 'source' then 'source_name'
              when 'normalized' then 'preferred_display'
              when 'alias' then 'search_alias'
              when 'transliteration' then 'transliteration'
              else 'source_name'
            end,
            v_fact->>'value', v_fact->>'normalizedValue', nullif(v_fact->>'script', ''),
            'source', v_source_record.id, 'food_catalog_ingestion_v2'
          );
        end loop;
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'aliases', '[]'::jsonb)) loop
          insert into public.food_names(
            food_id, language_tag, name_role, name_text, normalized_text,
            origin, source_record_id, policy_version
          ) values (
            v_food_id, v_fact->>'locale', 'search_alias', v_fact->>'value', v_fact->>'normalizedValue',
            'source', v_source_record.id, 'food_catalog_ingestion_v2'
          );
        end loop;

        -- Persist explicit serving evidence without density inference. Household portions
        -- carrying a source milliliter volume are materialized as that exact ml amount.
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'servings', '[]'::jsonb)) loop
          if coalesce(nullif(v_fact->>'amount', '')::numeric, 0) > 0
             and length(btrim(coalesce(v_fact->>'unit', ''))) > 0
             and (
               nullif(v_fact->>'gramWeight', '') is not null
               or v_fact->>'unit' in ('g', 'ml')
               or coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
             )
          then
            insert into public.food_serving_options(
              food_id, label, amount, unit_code, gram_weight, source_record_id,
              source_portion_code, evidence_class, source_primary, authority_reference
            ) values (
              v_food_id, coalesce(nullif(v_fact->>'label', ''), v_fact->>'servingKey'),
              case
                when nullif(v_fact->>'gramWeight', '') is null
                  and v_fact->>'unit' not in ('g', 'ml')
                  and coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
                then (v_fact->>'milliliterVolume')::numeric
                else (v_fact->>'amount')::numeric
              end,
              case
                when nullif(v_fact->>'gramWeight', '') is null
                  and v_fact->>'unit' not in ('g', 'ml')
                  and coalesce(nullif(v_fact->>'milliliterVolume', '')::numeric, 0) > 0
                then 'ml'
                else v_fact->>'unit'
              end,
              nullif(v_fact->>'gramWeight', '')::numeric,
              v_source_record.id, nullif(v_fact->>'servingKey', ''), 'exact_source', false,
              v_batch.id::text || ':' || v_batch.manifest_content_checksum_sha256
            );
          end if;
        end loop;

        -- Persist normalized GTIN ownership, failing closed on an existing different owner.
        for v_gtin in select jsonb_array_elements_text(coalesce(v_candidate->'gtins', '[]'::jsonb)) loop
          insert into public.food_barcodes(food_id, gtin, source_record_id)
          values (v_food_id, v_gtin, v_source_record.id)
          on conflict (gtin) do nothing;
          if exists (select 1 from public.food_barcodes where gtin = v_gtin and food_id <> v_food_id) then
            raise exception 'GTIN is already owned by a different canonical Food.' using errcode = '23514';
          end if;
        end loop;

        -- Persist provider-mapped taxonomy only; no locale/provider inference is permitted.
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'taxonomyEvidence', '[]'::jsonb)) loop
          if nullif(v_fact->>'mappedTaxonomyId', '') is not null then
            insert into public.food_taxonomy_assignments(
              food_id, node_code, source_record_id, assignment_action, policy_version
            ) values (
              v_food_id, v_fact->>'mappedTaxonomyId', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
            );
          end if;
        end loop;

        -- Persist only explicit market evidence from the reviewed manifest.
        for v_fact in select value from jsonb_array_elements(coalesce(v_candidate->'marketScopes', '[]'::jsonb)) loop
          insert into public.food_market_assignments(
            food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
          ) values (
            v_food_id, v_fact->>'code', v_fact->>'relevanceLevel', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
          );
        end loop;
        if coalesce((v_candidate->>'globallyRelevant')::boolean, false) then
          insert into public.food_market_assignments(
            food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
          ) values (
            v_food_id, 'GLOBAL', 'primary', v_source_record.id, 'assign', 'food_catalog_ingestion_v2'
          );
        end if;

        v_result := jsonb_build_object(
          'batchId', v_batch.id, 'sourceRecordId', v_candidate->>'sourceRecordId', 'foodId', v_food_id,
          'decisionKind', v_decision, 'dispositionKind', v_disposition
        );
        insert into public.food_ingestion_materialized_results(
          batch_id, source_record_key, source_record_id, food_id, decision_kind, disposition_kind,
          manifest_content_checksum_sha256, first_run_id, result_json
        ) values (
          v_batch.id, v_candidate->>'sourceRecordId', v_source_record.id, v_food_id, v_decision, v_disposition,
          v_run.manifest_content_checksum_sha256, v_run.id, v_result
        );
      end if;
    end if;
  else
    if v_batch.review_state <> 'prepared' then raise exception 'Dry-run staging requires a prepared semantic batch.' using errcode = '23514'; end if;
    insert into public.food_source_records(
      food_id, provider, source_record_id, source_reference, license_name, license_reference,
      retrieved_at, source_nutrition, source_serving, source_dataset, source_version,
      source_release_date, source_record_checksum_sha256
    ) values (
      null, v_batch.provider, v_candidate->>'sourceRecordId', nullif(v_candidate->>'sourceReference', ''),
      v_batch.license_name, v_batch.license_reference, clock_timestamp(),
      v_candidate->'sourceNutrition', v_candidate->'sourceServing', v_batch.dataset_name, v_batch.source_version,
      v_batch.source_release_date, nullif(lower(v_candidate->>'sourceRecordChecksumSha256'), '')
    )
    on conflict (provider, source_dataset, source_version, source_record_id)
      where source_dataset is not null and source_version is not null
    do nothing;

    select * into v_source_record
    from public.food_source_records
    where provider = v_batch.provider and source_dataset = v_batch.dataset_name
      and source_version = v_batch.source_version and source_record_id = v_candidate->>'sourceRecordId'
    for update;
    if lower(coalesce(v_source_record.source_record_checksum_sha256, '')) is distinct from lower(coalesce(v_candidate->>'sourceRecordChecksumSha256', '')) then
      raise exception 'Dry-run source snapshot conflicts with existing immutable source evidence.' using errcode = '23514';
    end if;

    v_membership_outcome := case
      when v_disposition = 'reject' then 'rejected'
      when v_disposition = 'quarantine' and v_decision = 'possible_duplicate' then 'possible_duplicate'
      when v_disposition = 'quarantine' then 'accepted'
      when v_decision = 'match' then 'matched'
      when v_decision = 'create' then 'created'
      else 'accepted'
    end;
    insert into public.food_ingestion_batch_records(batch_id, source_record_id, outcome)
    values (v_batch.id, v_source_record.id, v_membership_outcome);

    insert into public.food_ingestion_manifest_records(
      batch_id, source_record_key, source_record_id, manifest_content_checksum_sha256,
      candidate_json, decision_json, disposition_json, planned_food_id
    ) values (
      v_batch.id, v_candidate->>'sourceRecordId', v_source_record.id, v_run.manifest_content_checksum_sha256,
      v_candidate, v_decision_json, v_disposition_json, v_food_id
    );
  end if;

  if v_run.status = 'prepared' and v_run.execution_mode = 'dry_run' then
    update public.food_ingestion_runs
    set status = 'running', started_at = coalesce(started_at, clock_timestamp())
    where id = v_run.id
    returning * into v_run;
  end if;

  update public.food_ingestion_runs
  set observed_input_count = coalesce(observed_input_count, 0) + 1,
      observed_accepted_count = coalesce(observed_accepted_count, 0) + case when v_disposition = 'accept' then 1 else 0 end,
      observed_rejected_count = coalesce(observed_rejected_count, 0) + case when v_disposition = 'reject' then 1 else 0 end,
      observed_matched_count = coalesce(observed_matched_count, 0) + case when v_disposition = 'accept' and v_decision = 'match' then 1 else 0 end,
      observed_created_count = coalesce(observed_created_count, 0) + case when v_disposition = 'accept' and v_decision = 'create' then 1 else 0 end,
      observed_possible_duplicate_count = coalesce(observed_possible_duplicate_count, 0) + case when v_decision = 'possible_duplicate' then 1 else 0 end
  where id = v_run.id;

  insert into public.food_ingestion_operational_events(batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256)
  values (
    v_batch.id, v_run.id, v_candidate->>'sourceRecordId',
    case when v_run.execution_mode = 'production' and v_disposition = 'accept' then 'candidate_persisted' else 'candidate_recorded' end,
    jsonb_build_object('decisionKind', v_decision, 'dispositionKind', v_disposition, 'foodId', v_food_id, 'materializedResume', v_resumed),
    lower(p_command->>'commandChecksumSha256')
  );

  v_result := jsonb_build_object(
    'runId', v_run.id, 'sourceRecordId', v_candidate->>'sourceRecordId', 'foodId', v_food_id,
    'decisionKind', v_decision, 'dispositionKind', v_disposition, 'materializedResume', v_resumed
  );
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_persist_candidate_v2', v_run.id, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_record_quarantine_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_run public.food_ingestion_runs%rowtype;
  v_source_record_id uuid;
  v_quarantine_id uuid;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_record_quarantine_v2');
  if v_replay is not null then return v_replay; end if;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found then raise exception 'Unknown Food Catalog ingestion run.' using errcode = '23503'; end if;
  if v_run.execution_mode = 'production' then
    perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);
  elsif v_run.status not in ('prepared', 'running') then
    raise exception 'Dry-run quarantine mutation requires a nonterminal run.' using errcode = '55000';
  end if;
  select membership.source_record_id into v_source_record_id
  from public.food_ingestion_batch_records membership
  join public.food_source_records source on source.id = membership.source_record_id
  where membership.batch_id = v_run.batch_id and source.source_record_id = p_command->>'sourceRecordId';
  insert into public.food_ingestion_quarantines(
    batch_id, run_id, source_record_key, source_record_id, manifest_content_checksum_sha256,
    canonical_outcome, reason_codes, candidate_food_ids, evidence_json
  ) values (
    v_run.batch_id, v_run.id, p_command->>'sourceRecordId', v_source_record_id, v_run.manifest_content_checksum_sha256,
    p_command->>'decisionKind', array(select jsonb_array_elements_text(p_command->'reasonCodes')),
    coalesce(array(select value::uuid from jsonb_array_elements_text(coalesce(p_command->'candidateFoodIds', '[]'::jsonb)) value), '{}'::uuid[]),
    coalesce(p_command->'evidence', '{}'::jsonb)
  ) returning id into v_quarantine_id;
  update public.food_ingestion_runs set observed_quarantine_count = coalesce(observed_quarantine_count, 0) + 1 where id = v_run.id;
  insert into public.food_ingestion_operational_events(batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256)
  values (v_run.batch_id, v_run.id, p_command->>'sourceRecordId', 'quarantine_recorded', jsonb_build_object('quarantineId', v_quarantine_id), lower(p_command->>'commandChecksumSha256'));
  v_result := jsonb_build_object('quarantineId', v_quarantine_id, 'runId', v_run.id);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_record_quarantine_v2', v_run.id, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_resolve_quarantine_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_quarantine public.food_ingestion_quarantines%rowtype;
  v_resolution_id uuid;
  v_action text := p_command->>'resolutionAction';
  v_food_id uuid := nullif(p_command->>'resolvedFoodId', '')::uuid;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_resolve_quarantine_v2');
  if v_replay is not null then return v_replay; end if;
  select * into v_quarantine from public.food_ingestion_quarantines where id = (p_command->>'quarantineId')::uuid;
  if not found then raise exception 'Unknown Food Catalog ingestion quarantine.' using errcode = '23503'; end if;
  insert into public.food_ingestion_quarantine_resolutions(quarantine_id, resolution_action, resolved_food_id, reason_code, authority_reference)
  values (v_quarantine.id, v_action, v_food_id, p_command->>'reasonCode', p_command->>'authorityReference')
  returning id into v_resolution_id;
  insert into public.food_ingestion_operational_events(batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256)
  values (v_quarantine.batch_id, v_quarantine.run_id, v_quarantine.source_record_key, 'quarantine_resolved', jsonb_build_object('resolutionId', v_resolution_id, 'action', v_action), lower(p_command->>'commandChecksumSha256'));
  v_result := jsonb_build_object('resolutionId', v_resolution_id, 'quarantineId', v_quarantine.id);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_resolve_quarantine_v2', v_quarantine.run_id, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_record_reconciliation_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_run public.food_ingestion_runs%rowtype;
  v_batch public.food_ingestion_batches%rowtype;
  v_expected jsonb;
  v_observed jsonb;
  v_mismatches text[] := '{}'::text[];
  v_reconciliation_id uuid;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_record_reconciliation_v2');
  if v_replay is not null then return v_replay; end if;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found then raise exception 'Unknown Food Catalog ingestion run.' using errcode = '23503'; end if;
  select * into v_batch from public.food_ingestion_batches where id = v_run.batch_id for update;
  if v_run.execution_mode = 'production' then
    perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);
  elsif v_run.status not in ('prepared', 'running') then
    raise exception 'Dry-run reconciliation requires a nonterminal run.' using errcode = '55000';
  end if;

  v_expected := jsonb_build_object(
    'input', v_batch.input_count, 'accepted', v_batch.accepted_count, 'rejected', v_batch.rejected_count,
    'matched', v_batch.matched_count, 'created', v_batch.created_count,
    'possibleDuplicate', v_batch.possible_duplicate_count, 'quarantined', v_batch.expected_quarantine_count
  );
  v_observed := jsonb_build_object(
    'input', coalesce(v_run.observed_input_count, 0), 'accepted', coalesce(v_run.observed_accepted_count, 0),
    'rejected', coalesce(v_run.observed_rejected_count, 0), 'matched', coalesce(v_run.observed_matched_count, 0),
    'created', coalesce(v_run.observed_created_count, 0), 'possibleDuplicate', coalesce(v_run.observed_possible_duplicate_count, 0),
    'quarantined', coalesce(v_run.observed_quarantine_count, 0)
  );

  if lower(v_run.manifest_content_checksum_sha256) <> lower(coalesce(p_command->>'manifestContentChecksumSha256', '')) then
    v_mismatches := array_append(v_mismatches, 'manifest_checksum_mismatch');
  end if;

  if exists (
    select 1
    from public.food_ingestion_manifest_records manifest
    where manifest.batch_id = v_batch.id
      and not exists (
        select 1
        from public.food_ingestion_operational_events event
        where event.run_id = v_run.id
          and event.event_type in ('candidate_recorded', 'candidate_persisted')
          and event.source_record_key = manifest.source_record_key
      )
  ) then
    v_mismatches := array_append(v_mismatches, 'missing_expected_write');
  end if;

  if exists (
    select 1
    from public.food_ingestion_operational_events event
    where event.run_id = v_run.id
      and event.event_type in ('candidate_recorded', 'candidate_persisted')
      and event.source_record_key is not null
      and not exists (
        select 1
        from public.food_ingestion_manifest_records manifest
        where manifest.batch_id = v_batch.id
          and manifest.source_record_key = event.source_record_key
      )
  ) then
    v_mismatches := array_append(v_mismatches, 'unexpected_extra_write');
  end if;

  if exists (
    select event.source_record_key
    from public.food_ingestion_operational_events event
    where event.run_id = v_run.id
      and event.event_type in ('candidate_recorded', 'candidate_persisted')
      and event.source_record_key is not null
    group by event.source_record_key
    having count(*) > 1
  ) then
    v_mismatches := array_append(v_mismatches, 'duplicate_semantic_result');
  end if;

  if lower(coalesce(v_batch.semantic_identity_checksum_sha256, '')) <> lower(coalesce(p_command->>'semanticIdentityChecksumSha256', '')) then
    v_mismatches := array_append(v_mismatches, 'idempotency_mismatch');
  end if;
  if coalesce(p_command->>'completed', 'false') <> 'true' then
    v_mismatches := array_append(v_mismatches, 'partial_execution');
  end if;
  if coalesce((v_observed->>'quarantined')::integer, 0) <> v_batch.expected_quarantine_count then
    v_mismatches := array_append(v_mismatches, 'quarantine_divergence');
  end if;
  if v_expected <> v_observed then
    v_mismatches := array_append(v_mismatches, 'outcome_count_mismatch');
  end if;

  insert into public.food_ingestion_reconciliations(
    run_id, batch_id, manifest_content_checksum_sha256, semantic_identity_checksum_sha256,
    expected_counts, observed_counts, mismatch_codes, reconciled
  ) values (
    v_run.id, v_batch.id, v_run.manifest_content_checksum_sha256, v_batch.semantic_identity_checksum_sha256,
    v_expected, v_observed, v_mismatches, cardinality(v_mismatches) = 0
  ) returning id into v_reconciliation_id;
  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  values (v_batch.id, v_run.id, 'reconciliation_recorded', jsonb_build_object('reconciliationId', v_reconciliation_id, 'mismatchCodes', v_mismatches), lower(p_command->>'commandChecksumSha256'));
  v_result := jsonb_build_object('reconciliationId', v_reconciliation_id, 'ok', cardinality(v_mismatches) = 0, 'mismatchCodes', to_jsonb(v_mismatches));
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_record_reconciliation_v2', v_run.id, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_record_release_diff_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_diff_id uuid;
  v_record jsonb;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_record_release_diff_v2');
  if v_replay is not null then return v_replay; end if;
  insert into public.food_ingestion_release_diffs(batch_id, previous_batch_id, diff_checksum_sha256)
  values ((p_command->>'batchId')::uuid, nullif(p_command->>'previousBatchId', '')::uuid, lower(p_command->>'diffChecksumSha256'))
  returning id into v_diff_id;
  for v_record in select value from jsonb_array_elements(coalesce(p_command->'records', '[]'::jsonb)) loop
    insert into public.food_ingestion_release_diff_records(release_diff_id, source_record_key, classifications, before_json, after_json)
    values (
      v_diff_id, v_record->>'sourceRecordId', array(select jsonb_array_elements_text(v_record->'classifications')),
      v_record->'before', v_record->'after'
    );
  end loop;
  insert into public.food_ingestion_operational_events(batch_id, event_type, payload_json, event_checksum_sha256)
  values ((p_command->>'batchId')::uuid, 'release_diff_recorded', jsonb_build_object('releaseDiffId', v_diff_id), lower(p_command->>'commandChecksumSha256'));
  v_result := jsonb_build_object('releaseDiffId', v_diff_id);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_record_release_diff_v2', null, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_append_event_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_event_id uuid;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_append_event_v2');
  if v_replay is not null then return v_replay; end if;
  if nullif(p_command->>'runId', '') is not null then
    perform private.food_catalog_ingestion_assert_active_lease_v2((p_command->>'runId')::uuid, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);
  end if;
  insert into public.food_ingestion_operational_events(batch_id, run_id, source_record_key, event_type, payload_json, event_checksum_sha256)
  values (
    nullif(p_command->>'batchId', '')::uuid, nullif(p_command->>'runId', '')::uuid, nullif(p_command->>'sourceRecordId', ''),
    p_command->>'eventType', coalesce(p_command->'payload', '{}'::jsonb), lower(p_command->>'eventChecksumSha256')
  ) returning id into v_event_id;
  v_result := jsonb_build_object('eventId', v_event_id);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_append_event_v2', nullif(p_command->>'runId', '')::uuid, v_result);
end
$function$;

create or replace function public.food_catalog_ingestion_complete_run_v2(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $function$
declare
  v_replay jsonb;
  v_run_id uuid := (p_command->>'runId')::uuid;
  v_run public.food_ingestion_runs%rowtype;
  v_reconciliation public.food_ingestion_reconciliations%rowtype;
  v_result jsonb;
begin
  v_replay := private.food_catalog_ingestion_replay_operation_v2(p_command, 'food_catalog_ingestion_complete_run_v2');
  if v_replay is not null then return v_replay; end if;
  select * into v_run from public.food_ingestion_runs where id = v_run_id for update;
  if not found or v_run.status <> 'running' then raise exception 'Only a running ingestion attempt can complete.' using errcode = '55000'; end if;
  if v_run.execution_mode = 'production' then
    perform private.food_catalog_ingestion_assert_active_lease_v2(v_run_id, (p_command->>'leaseToken')::uuid, (p_command->>'leaseEpoch')::bigint);
  end if;
  select * into v_reconciliation from public.food_ingestion_reconciliations where run_id = v_run.id;
  if not found or not v_reconciliation.reconciled or lower(v_reconciliation.manifest_content_checksum_sha256) <> lower(v_run.manifest_content_checksum_sha256) then
    raise exception 'Food Catalog ingestion completion requires exact successful reconciliation.' using errcode = '23514';
  end if;
  update public.food_ingestion_runs
  set status = 'completed', completed_at = clock_timestamp(),
      lease_owner = null, lease_token = null, lease_acquired_at = null,
      lease_heartbeat_at = null, lease_expires_at = null
  where id = v_run.id;
  insert into public.food_ingestion_operational_events(batch_id, run_id, event_type, payload_json, event_checksum_sha256)
  values (v_run.batch_id, v_run.id, 'execution_completed', jsonb_build_object('reconciliationId', v_reconciliation.id), lower(p_command->>'commandChecksumSha256'));
  v_result := jsonb_build_object('runId', v_run.id, 'status', 'completed', 'reconciliationId', v_reconciliation.id);
  return private.food_catalog_ingestion_finish_operation_v2(p_command, 'food_catalog_ingestion_complete_run_v2', v_run.id, v_result);
end
$function$;

alter table public.food_ingestion_control_operations enable row level security;
alter table public.food_ingestion_manifest_records enable row level security;
alter table public.food_ingestion_materialized_results enable row level security;
alter table public.food_ingestion_quarantines enable row level security;
alter table public.food_ingestion_quarantine_resolutions enable row level security;
alter table public.food_ingestion_reconciliations enable row level security;
alter table public.food_ingestion_release_diffs enable row level security;
alter table public.food_ingestion_release_diff_records enable row level security;
alter table public.food_ingestion_operational_events enable row level security;

revoke all on table public.food_ingestion_control_operations from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_manifest_records from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_materialized_results from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_quarantines from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_quarantine_resolutions from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_reconciliations from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_release_diffs from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_release_diff_records from public, anon, authenticated, service_role;
revoke all on table public.food_ingestion_operational_events from public, anon, authenticated, service_role;

grant select on table public.food_ingestion_control_operations to service_role;
grant select on table public.food_ingestion_manifest_records to service_role;
grant select on table public.food_ingestion_materialized_results to service_role;
grant select on table public.food_ingestion_quarantines to service_role;
grant select on table public.food_ingestion_quarantine_resolutions to service_role;
grant select on table public.food_ingestion_reconciliations to service_role;
grant select on table public.food_ingestion_release_diffs to service_role;
grant select on table public.food_ingestion_release_diff_records to service_role;
grant select on table public.food_ingestion_operational_events to service_role;

revoke all on function public.food_catalog_ingestion_prepare_execution_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_acquire_lease_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_heartbeat_lease_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_persist_candidate_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_record_quarantine_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_resolve_quarantine_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_record_reconciliation_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_record_release_diff_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_append_event_v2(jsonb) from public, anon, authenticated;
revoke all on function public.food_catalog_ingestion_complete_run_v2(jsonb) from public, anon, authenticated;

grant execute on function public.food_catalog_ingestion_prepare_execution_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_acquire_lease_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_heartbeat_lease_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_persist_candidate_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_record_quarantine_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_resolve_quarantine_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_record_reconciliation_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_record_release_diff_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_append_event_v2(jsonb) to service_role;
grant execute on function public.food_catalog_ingestion_complete_run_v2(jsonb) to service_role;

revoke all on function private.food_catalog_ingestion_replay_operation_v2(jsonb, text) from public, anon, authenticated, service_role;
revoke all on function private.food_catalog_ingestion_finish_operation_v2(jsonb, text, uuid, jsonb) from public, anon, authenticated, service_role;
revoke all on function private.food_catalog_ingestion_assert_active_lease_v2(uuid, uuid, bigint) from public, anon, authenticated, service_role;
revoke all on function private.reject_food_catalog_ingestion_authority_mutation_v2() from public, anon, authenticated, service_role;

commit;