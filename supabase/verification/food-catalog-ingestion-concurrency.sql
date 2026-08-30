\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.food_catalog_concurrency_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.food_catalog_concurrency_rejected(p_sql text, p_message text)
returns void
language plpgsql
as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

create or replace function pg_temp.food_catalog_approve_batch(
  p_id uuid,
  p_suffix text,
  p_manifest_checksum text
)
returns void
language plpgsql
as $function$
begin
  insert into public.food_ingestion_batches (
    id, provider, dataset_name, source_version, source_release_date,
    license_name, license_reference, source_reference,
    source_checksum_sha256, importer_version, config_checksum_sha256,
    manifest_content_checksum_sha256
  ) values (
    p_id,
    'concurrency-fixture-provider',
    'concurrency-' || p_suffix,
    'v1',
    date '2026-08-30',
    'Fixture License',
    'fixture-license-' || p_suffix,
    'fixture-source-' || p_suffix,
    repeat(substr(md5(p_suffix), 1, 1), 64),
    'fixture-importer-v1',
    repeat(substr(md5(p_suffix || '-config'), 1, 1), 64),
    p_manifest_checksum
  );

  update public.food_ingestion_batches
  set review_state = 'reviewed', reviewed_at = clock_timestamp()
  where id = p_id;

  update public.food_ingestion_batches
  set review_state = 'approved',
      approved_at = clock_timestamp(),
      approval_reference = 'fixture-approval-' || p_suffix
  where id = p_id;
end
$function$;

do $locking_contract$
declare
  v_definition text;
begin
  select lower(pg_get_functiondef('public.food_ingestion_run_production_manifest_guard()'::regprocedure))
    into v_definition;
  if position('tg_op = ''insert''' in v_definition) = 0
     or position('old.status = ''prepared'' and new.status = ''running''' in v_definition) = 0
     or position('from public.food_ingestion_batches' in v_definition) = 0
     or position('for update' in v_definition) = 0
     or position('review_state <> ''approved''' in v_definition) = 0
     or position('new.manifest_content_checksum_sha256 is distinct from v_batch.manifest_content_checksum_sha256' in v_definition) = 0
  then
    raise exception 'Production run authority is not serialized on the batch row with exact-manifest gating.';
  end if;

  select lower(pg_get_functiondef('public.food_ingestion_batch_identity_immutable_guard()'::regprocedure))
    into v_definition;
  if position('old.review_state = ''approved'' and new.review_state = ''superseded''' in v_definition) = 0
     or position('execution_mode = ''production''' in v_definition) = 0
     or position('status in (''prepared'', ''running'')' in v_definition) = 0
     or position('from public.food_ingestion_batches' in v_definition) = 0
     or position('for update' in v_definition) = 0
  then
    raise exception 'Batch supersession is not serialized against nonterminal Production runs.';
  end if;

  select lower(pg_get_functiondef('public.food_ingestion_batch_membership_guard()'::regprocedure))
    into v_definition;
  if position('from public.food_ingestion_batches' in v_definition) = 0
     or position('order by id' in v_definition) = 0
     or position('for update' in v_definition) = 0
     or position('from public.food_source_records' in v_definition) = 0
     or position('review_state <> ''prepared''' in v_definition) = 0
  then
    raise exception 'Batch membership is not serialized against review and source-snapshot updates.';
  end if;
end
$locking_contract$;

-- Prepared Production run: supersession must reject; cancellation then permits supersession.
select pg_temp.food_catalog_approve_batch(
  'b0310000-0000-4000-8000-000000000101', 'cancelled', repeat('1', 64)
);

select pg_temp.food_catalog_concurrency_rejected(
  $sql$
    insert into public.food_ingestion_runs (
      id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
    ) values (
      'b0310000-0000-4000-8000-000000000201',
      'b0310000-0000-4000-8000-000000000101',
      'production', 1, 'prepared', repeat('9', 64)
    )
  $sql$,
  'Production run creation accepted a manifest other than the exact approved checksum.'
);

insert into public.food_ingestion_runs (
  id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000201',
  'b0310000-0000-4000-8000-000000000101',
  'production', 1, 'prepared', repeat('1', 64)
);

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_ingestion_batches
      set review_state = 'superseded'
      where id = 'b0310000-0000-4000-8000-000000000101'$$,
  'Approved batch was superseded while a prepared Production run existed.'
);

update public.food_ingestion_runs
set status = 'cancelled', completed_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000201';

update public.food_ingestion_batches
set review_state = 'superseded'
where id = 'b0310000-0000-4000-8000-000000000101';

select pg_temp.food_catalog_concurrency_assert(
  (select review_state = 'superseded'
          and approved_at is not null
          and approval_reference = 'fixture-approval-cancelled'
   from public.food_ingestion_batches
   where id = 'b0310000-0000-4000-8000-000000000101'),
  'Cancelled-run supersession did not preserve historical approval proof.'
);

-- Running Production run: supersession must reject; completion then permits supersession.
select pg_temp.food_catalog_approve_batch(
  'b0310000-0000-4000-8000-000000000102', 'completed', repeat('2', 64)
);

insert into public.food_ingestion_runs (
  id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000202',
  'b0310000-0000-4000-8000-000000000102',
  'production', 1, 'prepared', repeat('2', 64)
);

update public.food_ingestion_runs
set status = 'running', started_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000202';

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_ingestion_batches
      set review_state = 'superseded'
      where id = 'b0310000-0000-4000-8000-000000000102'$$,
  'Approved batch was superseded while a running Production run existed.'
);

update public.food_ingestion_runs
set status = 'completed', completed_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000202';

update public.food_ingestion_batches
set review_state = 'superseded'
where id = 'b0310000-0000-4000-8000-000000000102';

select pg_temp.food_catalog_concurrency_assert(
  (select review_state = 'superseded' from public.food_ingestion_batches
   where id = 'b0310000-0000-4000-8000-000000000102'),
  'Completed Production run did not permit later batch supersession.'
);

-- Failed Production run is also terminal and permits supersession.
select pg_temp.food_catalog_approve_batch(
  'b0310000-0000-4000-8000-000000000103', 'failed', repeat('3', 64)
);

insert into public.food_ingestion_runs (
  id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000203',
  'b0310000-0000-4000-8000-000000000103',
  'production', 1, 'prepared', repeat('3', 64)
);

update public.food_ingestion_runs
set status = 'running', started_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000203';

update public.food_ingestion_runs
set status = 'failed', completed_at = clock_timestamp(), error_summary = 'fixture failure'
where id = 'b0310000-0000-4000-8000-000000000203';

update public.food_ingestion_batches
set review_state = 'superseded'
where id = 'b0310000-0000-4000-8000-000000000103';

select pg_temp.food_catalog_concurrency_assert(
  (select review_state = 'superseded' from public.food_ingestion_batches
   where id = 'b0310000-0000-4000-8000-000000000103'),
  'Failed Production run did not permit later batch supersession.'
);

-- Adversarial stale-state fixture: even if an impossible superseded+prepared pair exists,
-- prepared -> running must re-read the locked batch and reject, while cancellation remains possible.
select pg_temp.food_catalog_approve_batch(
  'b0310000-0000-4000-8000-000000000104', 'stale-start', repeat('4', 64)
);

insert into public.food_ingestion_runs (
  id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000204',
  'b0310000-0000-4000-8000-000000000104',
  'production', 1, 'prepared', repeat('4', 64)
);

set local session_replication_role = replica;
update public.food_ingestion_batches
set review_state = 'superseded'
where id = 'b0310000-0000-4000-8000-000000000104';
set local session_replication_role = origin;

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_ingestion_runs
      set status = 'running', started_at = clock_timestamp()
      where id = 'b0310000-0000-4000-8000-000000000204'$$,
  'Production prepared -> running did not reject a no-longer-approved batch.'
);

update public.food_ingestion_runs
set status = 'cancelled', completed_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000204';

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_ingestion_runs
      set error_summary = 'terminal rewrite'
      where id = 'b0310000-0000-4000-8000-000000000204'$$,
  'Terminal Production run audit remained mutable.'
);

-- Membership/source boundary: participation freezes protected source content, and review freezes membership.
insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving, review_metadata,
  source_dataset, source_version, source_release_date, source_record_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000301', null,
  'concurrency-source-provider', 'source-301', 'source-ref-301',
  'Fixture License', 'license-ref-301', '2026-08-30T00:00:00Z',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'concurrency-source', 'v1', date '2026-08-30', repeat('a', 64)
);

insert into public.food_ingestion_batches (
  id, provider, dataset_name, source_version, source_release_date,
  license_name, source_checksum_sha256, importer_version, config_checksum_sha256
) values (
  'b0310000-0000-4000-8000-000000000105',
  'concurrency-fixture-provider', 'membership', 'v1', date '2026-08-30',
  'Fixture License', repeat('b', 64), 'fixture-importer-v1', repeat('c', 64)
);

insert into public.food_ingestion_batch_records (
  id, batch_id, source_record_id, outcome
) values (
  'b0310000-0000-4000-8000-000000000401',
  'b0310000-0000-4000-8000-000000000105',
  'b0310000-0000-4000-8000-000000000301',
  'accepted'
);

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_source_records
      set source_reference = 'mutated-source-reference'
      where id = 'b0310000-0000-4000-8000-000000000301'$$,
  'Participating source snapshot content remained mutable.'
);

update public.food_ingestion_batches
set review_state = 'reviewed', reviewed_at = clock_timestamp()
where id = 'b0310000-0000-4000-8000-000000000105';

select pg_temp.food_catalog_concurrency_rejected(
  $$update public.food_ingestion_batch_records
      set outcome = 'matched'
      where id = 'b0310000-0000-4000-8000-000000000401'$$,
  'Reviewed batch membership remained mutable.'
);

-- This verification is rollback-only; it does not populate canonical Foods or mutate Production.
rollback;