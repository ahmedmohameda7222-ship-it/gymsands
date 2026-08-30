do $$
declare
  v_definition text;
begin
  -- Canonical core nutrition must permit unknown values after Batch 0.
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
      and column_default = 'true'
  ) then
    raise exception 'food_items.is_market_global readiness field is missing.';
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
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.food_ingestion_runs'::regclass
      and tgname = 'food_ingestion_run_production_manifest_guard'
      and not tgisinternal
  ) then
    raise exception 'Production ingestion manifest guard trigger is missing.';
  end if;

  if to_regprocedure('public.food_ingestion_batch_identity_immutable_guard()') is null then
    raise exception 'Reviewed batch identity immutability guard function is missing.';
  end if;
  select lower(pg_get_functiondef('public.food_ingestion_batch_identity_immutable_guard()'::regprocedure))
    into v_definition;
  if position('old.review_state <> ''prepared'' and new.review_state = ''prepared''' in v_definition) = 0 then
    raise exception 'Reviewed ingestion batches can return to prepared and repoint semantic identity.';
  end if;
  foreach v_definition in array array[
    'new.provider is distinct from old.provider',
    'new.dataset_name is distinct from old.dataset_name',
    'new.source_version is distinct from old.source_version',
    'new.source_checksum_sha256 is distinct from old.source_checksum_sha256',
    'new.importer_version is distinct from old.importer_version',
    'new.config_checksum_sha256 is distinct from old.config_checksum_sha256',
    'new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256'
  ] loop
    if position(v_definition in lower(pg_get_functiondef('public.food_ingestion_batch_identity_immutable_guard()'::regprocedure))) = 0 then
      raise exception 'Reviewed batch semantic identity immutability is incomplete: %', v_definition;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_ingestion_batches'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%provider%dataset_name%source_version%source_checksum_sha256%importer_version%config_checksum_sha256%'
  ) then
    raise exception 'Semantic ingestion batch uniqueness is missing.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_ingestion_runs'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%batch_id%execution_mode%attempt_number%'
  ) then
    raise exception 'Execution-run retry identity is missing.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_ingestion_batch_records'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ilike '%batch_id%source_record_id%'
  ) then
    raise exception 'Batch/source-record many-to-many participation uniqueness is missing.';
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
      and lower(indexdef) like '%unique index%provider, source_record_id)%where ((source_dataset is null) and (source_version is null))%'
  ) then
    raise exception 'Bounded legacy/manual provenance uniqueness is missing.';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and tablename = 'food_source_records'
      and indexname = 'food_source_records_versioned_identity_uq'
      and lower(indexdef) like '%unique index%provider, source_dataset, source_version, source_record_id)%where ((source_dataset is not null) and (source_version is not null))%'
  ) then
    raise exception 'Version-aware bulk provenance uniqueness is missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.food_barcodes'::regclass
      and conname = 'food_barcodes_gtin_shape_check'
      and pg_get_constraintdef(oid) ilike '%length(gtin)%8%12%13%14%'
  ) then
    raise exception 'GTIN structural constraint is missing.';
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
      and conname = 'food_market_relevance_scope_code_check'
      and pg_get_constraintdef(oid) ilike '%country%[A-Z]{2}%region%[A-Z][A-Z0-9_-]{1,15}%'
  ) then
    raise exception 'Country/region-safe market-scope constraint is missing.';
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
$$;
