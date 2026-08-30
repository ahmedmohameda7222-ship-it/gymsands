\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.food_catalog_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.food_catalog_rejected(p_sql text, p_message text)
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

do $schema_contract$
declare
  v_definition text;
  v_fragment text;
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'food_items'
      and column_name in ('calories', 'protein_g', 'carbs_g', 'fat_g')
      and is_nullable <> 'YES'
  ) or (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'food_items'
      and column_name in ('calories', 'protein_g', 'carbs_g', 'fat_g')
      and is_nullable = 'YES'
  ) <> 4 then
    raise exception 'Food Catalog core nutrition nullability is not ready.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'food_items'
      and column_name = 'brand_name' and data_type = 'text' and is_nullable = 'YES'
  ) then
    raise exception 'food_items.brand_name readiness field is missing.';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'food_items'
      and column_name = 'is_market_global' and data_type = 'boolean' and is_nullable = 'NO'
      and column_default = 'false'
  ) then
    raise exception 'food_items.is_market_global must default false.';
  end if;

  if exists (
    select required.table_name
    from (
      values
        ('food_ingestion_batches'),
        ('food_ingestion_runs'),
        ('food_ingestion_batch_records'),
        ('food_barcodes'),
        ('food_market_relevance')
    ) as required(table_name)
    left join information_schema.tables t
      on t.table_schema = 'public' and t.table_name = required.table_name
    where t.table_name is null
  ) then
    raise exception 'Required Food Catalog Batch 0 tables are missing.';
  end if;

  if to_regprocedure('public.food_ingestion_run_production_manifest_guard()') is null then
    raise exception 'Production ingestion manifest guard function is missing.';
  end if;
  select lower(pg_get_functiondef('public.food_ingestion_run_production_manifest_guard()'::regprocedure))
    into v_definition;
  if position('review_state <> ''approved''' in v_definition) = 0
     or position('approved_at is null' in v_definition) = 0
     or position('manifest_content_checksum_sha256 is null' in v_definition) = 0
     or position('new.manifest_content_checksum_sha256 is distinct from v_batch.manifest_content_checksum_sha256' in v_definition) = 0 then
    raise exception 'Production ingestion is not DB-gated to the exact approved manifest checksum.';
  end if;

  if to_regprocedure('public.food_ingestion_batch_identity_immutable_guard()') is null then
    raise exception 'Reviewed batch immutability guard function is missing.';
  end if;
  select lower(pg_get_functiondef('public.food_ingestion_batch_identity_immutable_guard()'::regprocedure))
    into v_definition;
  foreach v_fragment in array array[
    'new.provider is distinct from old.provider',
    'new.dataset_name is distinct from old.dataset_name',
    'new.source_version is distinct from old.source_version',
    'new.source_release_date is distinct from old.source_release_date',
    'new.license_name is distinct from old.license_name',
    'new.license_reference is distinct from old.license_reference',
    'new.source_reference is distinct from old.source_reference',
    'new.source_checksum_sha256 is distinct from old.source_checksum_sha256',
    'new.importer_version is distinct from old.importer_version',
    'new.config_checksum_sha256 is distinct from old.config_checksum_sha256',
    'new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256',
    'new.input_count is distinct from old.input_count',
    'new.accepted_count is distinct from old.accepted_count',
    'new.rejected_count is distinct from old.rejected_count',
    'new.matched_count is distinct from old.matched_count',
    'new.created_count is distinct from old.created_count',
    'new.possible_duplicate_count is distinct from old.possible_duplicate_count',
    'new.reviewed_at is distinct from old.reviewed_at',
    'new.approved_at is distinct from old.approved_at',
    'new.approval_reference is distinct from old.approval_reference'
  ] loop
    if position(v_fragment in v_definition) = 0 then
      raise exception 'Reviewed batch audit immutability is incomplete: %', v_fragment;
    end if;
  end loop;

  if to_regprocedure('public.food_source_record_snapshot_immutable_guard()') is null then
    raise exception 'Participating source snapshot immutability guard is missing.';
  end if;
  if to_regprocedure('public.food_ingestion_batch_membership_guard()') is null then
    raise exception 'Reviewed batch membership guard is missing.';
  end if;
  if to_regprocedure('public.food_ingestion_run_audit_immutable_guard()') is null then
    raise exception 'Ingestion run audit immutability guard is missing.';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.food_source_records'::regclass
      and tgname = 'food_source_record_snapshot_immutable'
      and not tgisinternal
  ) then
    raise exception 'Source snapshot immutability trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.food_ingestion_batch_records'::regclass
      and tgname = 'food_ingestion_batch_membership_immutable'
      and not tgisinternal
  ) then
    raise exception 'Batch membership immutability trigger is missing.';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.food_ingestion_runs'::regclass
      and tgname = 'food_ingestion_run_audit_immutable'
      and not tgisinternal
  ) then
    raise exception 'Run audit immutability trigger is missing.';
  end if;

  if exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_source_records'::regclass
      and conname = 'food_source_records_provider_source_record_id_key'
  ) then
    raise exception 'Legacy global Food provenance uniqueness still exists.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'food_source_records'
      and indexname = 'food_source_records_legacy_identity_uq'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'food_source_records'
      and indexname = 'food_source_records_versioned_identity_uq'
  ) then
    raise exception 'Version-aware Food provenance uniqueness is missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_barcodes'::regclass
      and conname = 'food_barcodes_source_same_food_fk'
      and contype = 'f'
  ) then
    raise exception 'GTIN same-Food provenance FK is missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_market_relevance'::regclass
      and conname = 'food_market_relevance_source_same_food_fk'
      and contype = 'f'
  ) then
    raise exception 'Market relevance same-Food provenance FK is missing.';
  end if;

  if exists (
    select required.table_name
    from (
      values
        ('food_ingestion_batches'),
        ('food_ingestion_runs'),
        ('food_ingestion_batch_records'),
        ('food_barcodes'),
        ('food_market_relevance')
    ) as required(table_name)
    join pg_class c on c.oid = to_regclass('public.' || required.table_name)
    where not c.relrowsecurity
       or has_table_privilege('anon', 'public.' || required.table_name, 'SELECT,INSERT,UPDATE,DELETE')
       or has_table_privilege('authenticated', 'public.' || required.table_name, 'SELECT,INSERT,UPDATE,DELETE')
       or not has_table_privilege('service_role', 'public.' || required.table_name, 'SELECT,INSERT,UPDATE,DELETE')
  ) then
    raise exception 'Food Catalog ingestion/GTIN/market RLS or privileges are too broad.';
  end if;
end
$schema_contract$;

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values (
  'b0300000-0000-4000-8000-000000000001',
  'Batch 0 market default fixture', '100 g', 100, 10, 12, 2,
  'admin_created', true, 'active'
);

select pg_temp.food_catalog_assert(
  (select is_market_global is false
   from public.food_items where id = 'b0300000-0000-4000-8000-000000000001'),
  'New Food without explicit market classification must default is_market_global=false.'
);

insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving, review_metadata,
  source_dataset, source_version, source_release_date, source_record_checksum_sha256
) values
  (
    'b0300000-0000-4000-8000-000000000010', null,
    'fixture-provider', 'source-10', 'source-ref-10',
    'Fixture License', 'license-ref-10', '2026-08-30T00:00:00Z',
    '{"calories":100,"protein_g":10}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
    'fixture-dataset', 'v1', '2026-08-01', repeat('1', 64)
  ),
  (
    'b0300000-0000-4000-8000-000000000011', null,
    'fixture-provider', 'source-11', 'source-ref-11',
    'Fixture License', 'license-ref-11', '2026-08-30T00:00:00Z',
    '{"calories":101}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
    'fixture-dataset', 'v1', '2026-08-01', repeat('2', 64)
  );

insert into public.food_ingestion_batches (
  id, provider, dataset_name, source_version, source_release_date,
  license_name, license_reference, source_reference,
  source_checksum_sha256, importer_version, config_checksum_sha256,
  manifest_content_checksum_sha256, input_count, accepted_count, rejected_count,
  matched_count, created_count, possible_duplicate_count
) values (
  'b0300000-0000-4000-8000-000000000020',
  'fixture-provider', 'fixture-dataset', 'v1', '2026-08-01',
  'Fixture License', 'license-ref', 'source-release-ref',
  repeat('a', 64), 'importer-v1', repeat('b', 64), repeat('c', 64),
  1, 1, 0, 0, 1, 0
);

insert into public.food_ingestion_batch_records (
  batch_id, source_record_id, outcome
) values (
  'b0300000-0000-4000-8000-000000000020',
  'b0300000-0000-4000-8000-000000000010',
  'created'
);

update public.food_source_records
set food_id = 'b0300000-0000-4000-8000-000000000001'
where id = 'b0300000-0000-4000-8000-000000000010';

select pg_temp.food_catalog_assert(
  (select food_id = 'b0300000-0000-4000-8000-000000000001'
   from public.food_source_records where id = 'b0300000-0000-4000-8000-000000000010'),
  'Batch participation must not freeze later canonical food association.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_source_records
    set source_reference = 'rewritten-source-ref'
    where id = 'b0300000-0000-4000-8000-000000000010'$$,
  'Participating source snapshot identity/content can be rewritten.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_source_records
    set source_nutrition = '{"calories":999}'::jsonb
    where id = 'b0300000-0000-4000-8000-000000000010'$$,
  'Participating source nutrition can be rewritten.'
);

update public.food_ingestion_batches
set review_state = 'reviewed', reviewed_at = '2026-08-30T01:00:00Z'
where id = 'b0300000-0000-4000-8000-000000000020';

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set source_release_date = '2026-08-02'
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Reviewed batch source release date can be rewritten.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set input_count = 99
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Reviewed batch expected counts can be rewritten.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set reviewed_at = '2026-08-30T01:30:00Z'
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Established reviewed_at can be rewritten.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set review_state = 'prepared'
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Reviewed batch can return to prepared.'
);

select pg_temp.food_catalog_rejected(
  $$insert into public.food_ingestion_batch_records (batch_id, source_record_id, outcome)
    values ('b0300000-0000-4000-8000-000000000020', 'b0300000-0000-4000-8000-000000000011', 'accepted')$$,
  'Reviewed batch membership still accepts inserts.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batch_records
    set outcome = 'accepted'
    where batch_id = 'b0300000-0000-4000-8000-000000000020'
      and source_record_id = 'b0300000-0000-4000-8000-000000000010'$$,
  'Reviewed batch membership still accepts updates.'
);

select pg_temp.food_catalog_rejected(
  $$delete from public.food_ingestion_batch_records
    where batch_id = 'b0300000-0000-4000-8000-000000000020'
      and source_record_id = 'b0300000-0000-4000-8000-000000000010'$$,
  'Reviewed batch membership still accepts deletes.'
);

update public.food_ingestion_batches
set review_state = 'approved',
    approved_at = '2026-08-30T02:00:00Z',
    approval_reference = 'planner-approval-1'
where id = 'b0300000-0000-4000-8000-000000000020';

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set approved_at = '2026-08-30T02:30:00Z'
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Established approved_at can be rewritten.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set approval_reference = null
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Established approval_reference can be erased.'
);

update public.food_ingestion_batches
set review_state = 'superseded'
where id = 'b0300000-0000-4000-8000-000000000020';

select pg_temp.food_catalog_assert(
  (select review_state = 'superseded'
      and approved_at = '2026-08-30T02:00:00Z'
      and approval_reference = 'planner-approval-1'
   from public.food_ingestion_batches where id = 'b0300000-0000-4000-8000-000000000020'),
  'Superseding an approved batch destroyed approval history.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set review_state = 'approved'
    where id = 'b0300000-0000-4000-8000-000000000020'$$,
  'Superseded batch can return to approved.'
);

insert into public.food_ingestion_batches (
  id, provider, dataset_name, source_version, license_name,
  source_checksum_sha256, importer_version, config_checksum_sha256,
  manifest_content_checksum_sha256
) values (
  'b0300000-0000-4000-8000-000000000021',
  'fixture-provider', 'fixture-dataset-rejected', 'v1', 'Fixture License',
  repeat('d', 64), 'importer-v1', repeat('e', 64), repeat('f', 64)
);
update public.food_ingestion_batches
set review_state = 'reviewed', reviewed_at = '2026-08-30T01:00:00Z'
where id = 'b0300000-0000-4000-8000-000000000021';
update public.food_ingestion_batches
set review_state = 'rejected'
where id = 'b0300000-0000-4000-8000-000000000021';
select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_batches
    set review_state = 'reviewed'
    where id = 'b0300000-0000-4000-8000-000000000021'$$,
  'Rejected batch can return to reviewed.'
);

insert into public.food_ingestion_batches (
  id, provider, dataset_name, source_version, license_name,
  source_checksum_sha256, importer_version, config_checksum_sha256,
  manifest_content_checksum_sha256
) values (
  'b0300000-0000-4000-8000-000000000022',
  'fixture-provider', 'fixture-dataset-production', 'v1', 'Fixture License',
  repeat('0', 64), 'importer-v1', repeat('3', 64), repeat('4', 64)
);
update public.food_ingestion_batches
set review_state = 'reviewed', reviewed_at = '2026-08-30T01:00:00Z'
where id = 'b0300000-0000-4000-8000-000000000022';
update public.food_ingestion_batches
set review_state = 'approved', approved_at = '2026-08-30T02:00:00Z', approval_reference = 'planner-approval-prod'
where id = 'b0300000-0000-4000-8000-000000000022';

select pg_temp.food_catalog_rejected(
  $$insert into public.food_ingestion_runs (
      id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
    ) values (
      'b0300000-0000-4000-8000-000000000040',
      'b0300000-0000-4000-8000-000000000022', 'production', 1, 'prepared', repeat('5', 64)
    )$$,
  'Production run accepted a checksum different from the approved manifest.'
);

insert into public.food_ingestion_runs (
  id, batch_id, execution_mode, attempt_number, status, manifest_content_checksum_sha256
) values (
  'b0300000-0000-4000-8000-000000000040',
  'b0300000-0000-4000-8000-000000000022', 'production', 1, 'prepared', repeat('4', 64)
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_runs
    set attempt_number = 2
    where id = 'b0300000-0000-4000-8000-000000000040'$$,
  'Ingestion run identity can be repointed.'
);

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_runs
    set status = 'completed', completed_at = clock_timestamp()
    where id = 'b0300000-0000-4000-8000-000000000040'$$,
  'Prepared ingestion run can skip directly to completed.'
);

update public.food_ingestion_runs
set status = 'running', started_at = '2026-08-30T03:00:00Z', observed_input_count = 1
where id = 'b0300000-0000-4000-8000-000000000040';

update public.food_ingestion_runs
set status = 'completed', completed_at = '2026-08-30T03:05:00Z', observed_accepted_count = 1
where id = 'b0300000-0000-4000-8000-000000000040';

select pg_temp.food_catalog_rejected(
  $$update public.food_ingestion_runs
    set observed_accepted_count = 2
    where id = 'b0300000-0000-4000-8000-000000000040'$$,
  'Terminal ingestion run audit fields can be rewritten.'
);

rollback;
