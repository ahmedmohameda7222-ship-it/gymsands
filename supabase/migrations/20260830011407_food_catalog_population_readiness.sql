begin;

-- Food Catalog Batch 0 schema + generic ingestion readiness only.
-- No Food rows are populated or activated by this migration.

alter table public.food_items
  alter column calories drop not null,
  alter column protein_g drop not null,
  alter column carbs_g drop not null,
  alter column fat_g drop not null;

alter table public.food_items
  add column brand_name text,
  add column is_market_global boolean not null default false,
  add constraint food_items_brand_name_nonblank_check
    check (brand_name is null or length(btrim(brand_name)) > 0);

create index food_items_brand_name_trgm_idx
  on public.food_items using gin (lower(brand_name) gin_trgm_ops)
  where brand_name is not null;

create table public.food_ingestion_batches (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (length(btrim(provider)) > 0),
  dataset_name text not null check (length(btrim(dataset_name)) > 0),
  source_version text not null check (length(btrim(source_version)) > 0),
  source_release_date date,
  license_name text not null check (length(btrim(license_name)) > 0),
  license_reference text,
  source_reference text,
  source_checksum_sha256 text not null
    check (source_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  importer_version text not null check (length(btrim(importer_version)) > 0),
  config_checksum_sha256 text not null
    check (config_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  manifest_content_checksum_sha256 text
    check (
      manifest_content_checksum_sha256 is null
      or manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'
    ),
  review_state text not null default 'prepared'
    check (review_state in ('prepared', 'reviewed', 'approved', 'rejected', 'superseded')),
  reviewed_at timestamptz,
  approved_at timestamptz,
  approval_reference text,
  input_count integer not null default 0 check (input_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  matched_count integer not null default 0 check (matched_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  possible_duplicate_count integer not null default 0 check (possible_duplicate_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_ingestion_batches_review_timestamps_check check (
    (review_state = 'prepared' and reviewed_at is null)
    or (review_state in ('reviewed', 'approved', 'rejected', 'superseded') and reviewed_at is not null)
  ),
  constraint food_ingestion_batches_approval_state_check check (
    (review_state in ('approved', 'superseded') and approved_at is not null)
    or (review_state not in ('approved', 'superseded') and approved_at is null)
  ),
  constraint food_ingestion_batches_approval_reference_check check (
    approval_reference is null or approved_at is not null
  ),
  unique (
    provider,
    dataset_name,
    source_version,
    source_checksum_sha256,
    importer_version,
    config_checksum_sha256
  )
);

create table public.food_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  execution_mode text not null check (execution_mode in ('dry_run', 'production')),
  attempt_number integer not null check (attempt_number > 0),
  status text not null check (status in ('prepared', 'running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  manifest_content_checksum_sha256 text not null
    check (manifest_content_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'),
  observed_input_count integer check (observed_input_count is null or observed_input_count >= 0),
  observed_accepted_count integer check (observed_accepted_count is null or observed_accepted_count >= 0),
  observed_rejected_count integer check (observed_rejected_count is null or observed_rejected_count >= 0),
  observed_created_count integer check (observed_created_count is null or observed_created_count >= 0),
  observed_matched_count integer check (observed_matched_count is null or observed_matched_count >= 0),
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_ingestion_runs_completion_state_check check (
    (status in ('completed', 'failed', 'cancelled') and completed_at is not null)
    or (status in ('prepared', 'running') and completed_at is null)
  ),
  unique (batch_id, execution_mode, attempt_number)
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
       or new.input_count is distinct from old.input_count
       or new.accepted_count is distinct from old.accepted_count
       or new.rejected_count is distinct from old.rejected_count
       or new.matched_count is distinct from old.matched_count
       or new.created_count is distinct from old.created_count
       or new.possible_duplicate_count is distinct from old.possible_duplicate_count
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

  if old.approval_reference is not null
     and new.approval_reference is distinct from old.approval_reference
  then
    raise exception 'Established Food ingestion batch approval_reference is immutable.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_ingestion_batch_identity_immutable
before update on public.food_ingestion_batches
for each row execute function public.food_ingestion_batch_identity_immutable_guard();

create or replace function public.food_ingestion_run_audit_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.batch_id is distinct from old.batch_id
     or new.execution_mode is distinct from old.execution_mode
     or new.attempt_number is distinct from old.attempt_number
     or new.manifest_content_checksum_sha256 is distinct from old.manifest_content_checksum_sha256
  then
    raise exception 'Food ingestion run identity is immutable.' using errcode = '23514';
  end if;

  if old.status in ('completed', 'failed', 'cancelled') then
    raise exception 'Terminal Food ingestion run audit history is immutable.' using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'prepared' and new.status in ('running', 'cancelled'))
       or (old.status = 'running' and new.status in ('completed', 'failed', 'cancelled'))
     )
  then
    raise exception 'Invalid Food ingestion run state transition: % -> %.', old.status, new.status
      using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_ingestion_run_audit_immutable
before update on public.food_ingestion_runs
for each row execute function public.food_ingestion_run_audit_immutable_guard();

create or replace function public.food_ingestion_run_production_manifest_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_batch public.food_ingestion_batches%rowtype;
begin
  if new.execution_mode <> 'production' then
    return new;
  end if;

  select * into v_batch
  from public.food_ingestion_batches
  where id = new.batch_id;

  if not found
     or v_batch.review_state <> 'approved'
     or v_batch.approved_at is null
     or v_batch.manifest_content_checksum_sha256 is null
     or new.manifest_content_checksum_sha256 is distinct from v_batch.manifest_content_checksum_sha256
  then
    raise exception 'Production Food ingestion requires the exact approved manifest content checksum.'
      using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_ingestion_run_production_manifest_guard
before insert or update on public.food_ingestion_runs
for each row execute function public.food_ingestion_run_production_manifest_guard();

alter table public.food_source_records
  add column source_dataset text,
  add column source_version text,
  add column source_release_date date,
  add column source_record_checksum_sha256 text,
  add constraint food_source_records_dataset_version_pair_check check (
    (source_dataset is null and source_version is null)
    or (
      source_dataset is not null
      and source_version is not null
      and length(btrim(source_dataset)) > 0
      and length(btrim(source_version)) > 0
    )
  ),
  add constraint food_source_records_record_checksum_check check (
    source_record_checksum_sha256 is null
    or source_record_checksum_sha256 ~ '^[0-9A-Fa-f]{64}$'
  );

do $verify_legacy_source_identity$
declare
  v_columns text[];
begin
  select array_agg(attribute.attname order by key_column.ordinality)
  into v_columns
  from pg_catalog.pg_constraint constraint_row
  cross join lateral unnest(constraint_row.conkey) with ordinality as key_column(attnum, ordinality)
  join pg_catalog.pg_attribute attribute
    on attribute.attrelid = constraint_row.conrelid
   and attribute.attnum = key_column.attnum
  where constraint_row.conrelid = 'public.food_source_records'::regclass
    and constraint_row.conname = 'food_source_records_provider_source_record_id_key'
    and constraint_row.contype = 'u';

  if v_columns is distinct from array['provider', 'source_record_id']::text[] then
    raise exception 'Expected legacy Food provenance uniqueness (provider, source_record_id) was not found.';
  end if;
end
$verify_legacy_source_identity$;

alter table public.food_source_records
  drop constraint food_source_records_provider_source_record_id_key;

create unique index food_source_records_legacy_identity_uq
  on public.food_source_records(provider, source_record_id)
  where source_dataset is null and source_version is null;

create unique index food_source_records_versioned_identity_uq
  on public.food_source_records(provider, source_dataset, source_version, source_record_id)
  where source_dataset is not null and source_version is not null;

create table public.food_ingestion_batch_records (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_ingestion_batches(id) on delete restrict,
  source_record_id uuid not null references public.food_source_records(id) on delete restrict,
  outcome text not null check (outcome in ('accepted', 'rejected', 'matched', 'created', 'possible_duplicate')),
  created_at timestamptz not null default now(),
  unique (batch_id, source_record_id)
);

create or replace function public.food_source_record_snapshot_immutable_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.food_ingestion_batch_records
    where source_record_id = old.id
  ) and (
    new.provider is distinct from old.provider
    or new.source_record_id is distinct from old.source_record_id
    or new.source_dataset is distinct from old.source_dataset
    or new.source_version is distinct from old.source_version
    or new.source_release_date is distinct from old.source_release_date
    or new.source_record_checksum_sha256 is distinct from old.source_record_checksum_sha256
    or new.source_reference is distinct from old.source_reference
    or new.source_nutrition is distinct from old.source_nutrition
    or new.source_serving is distinct from old.source_serving
    or new.license_name is distinct from old.license_name
    or new.license_reference is distinct from old.license_reference
    or new.retrieved_at is distinct from old.retrieved_at
  ) then
    raise exception 'Participating Food source snapshot is immutable.' using errcode = '23514';
  end if;

  return new;
end
$function$;

create trigger food_source_record_snapshot_immutable
before update on public.food_source_records
for each row execute function public.food_source_record_snapshot_immutable_guard();

create or replace function public.food_ingestion_batch_membership_guard()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    if exists (
      select 1 from public.food_ingestion_batches
      where id = new.batch_id and review_state <> 'prepared'
    ) then
      raise exception 'Reviewed Food ingestion batch membership is immutable.' using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if exists (
      select 1 from public.food_ingestion_batches
      where id = old.batch_id and review_state <> 'prepared'
    ) then
      raise exception 'Reviewed Food ingestion batch membership is immutable.' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      select 1 from public.food_ingestion_batches
      where id in (old.batch_id, new.batch_id) and review_state <> 'prepared'
    ) then
      raise exception 'Reviewed Food ingestion batch membership is immutable.' using errcode = '23514';
    end if;
    return new;
  end if;

  raise exception 'Unsupported Food ingestion batch membership operation.' using errcode = '23514';
end
$function$;

create trigger food_ingestion_batch_membership_immutable
before insert or update or delete on public.food_ingestion_batch_records
for each row execute function public.food_ingestion_batch_membership_guard();

create table public.food_barcodes (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  gtin text not null unique,
  source_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_barcodes_gtin_shape_check check (
    gtin ~ '^[0-9]+$' and length(gtin) in (8, 12, 13, 14)
  ),
  constraint food_barcodes_source_same_food_fk
    foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id)
    on delete restrict
);

create table public.food_market_relevance (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.food_items(id) on delete restrict,
  scope_type text not null check (scope_type in ('country', 'region')),
  scope_code text not null,
  relevance_level text not null default 'primary'
    check (relevance_level in ('primary', 'secondary')),
  source_record_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint food_market_relevance_scope_code_check check (
    (scope_type = 'country' and scope_code ~ '^[A-Z]{2}$')
    or (scope_type = 'region' and scope_code ~ '^[A-Z][A-Z0-9_-]{1,15}$')
  ),
  constraint food_market_relevance_source_same_food_fk
    foreign key (source_record_id, food_id)
    references public.food_source_records(id, food_id)
    on delete restrict,
  unique (food_id, scope_type, scope_code)
);

create index food_ingestion_batches_provider_dataset_version_idx
  on public.food_ingestion_batches(provider, dataset_name, source_version, id);

create index food_ingestion_runs_batch_mode_status_idx
  on public.food_ingestion_runs(batch_id, execution_mode, status, attempt_number);

create index food_ingestion_batch_records_source_record_idx
  on public.food_ingestion_batch_records(source_record_id, batch_id);

create index food_barcodes_food_idx
  on public.food_barcodes(food_id, gtin);

create index food_market_relevance_scope_idx
  on public.food_market_relevance(scope_type, scope_code, relevance_level, food_id);

drop trigger if exists food_ingestion_batches_updated_at on public.food_ingestion_batches;
create trigger food_ingestion_batches_updated_at
before update on public.food_ingestion_batches
for each row execute function public.set_updated_at();

drop trigger if exists food_ingestion_runs_updated_at on public.food_ingestion_runs;
create trigger food_ingestion_runs_updated_at
before update on public.food_ingestion_runs
for each row execute function public.set_updated_at();

drop trigger if exists food_barcodes_updated_at on public.food_barcodes;
create trigger food_barcodes_updated_at
before update on public.food_barcodes
for each row execute function public.set_updated_at();

drop trigger if exists food_market_relevance_updated_at on public.food_market_relevance;
create trigger food_market_relevance_updated_at
before update on public.food_market_relevance
for each row execute function public.set_updated_at();

alter table public.food_ingestion_batches enable row level security;
alter table public.food_ingestion_runs enable row level security;
alter table public.food_ingestion_batch_records enable row level security;
alter table public.food_barcodes enable row level security;
alter table public.food_market_relevance enable row level security;

revoke all on table public.food_ingestion_batches from anon, authenticated;
revoke all on table public.food_ingestion_runs from anon, authenticated;
revoke all on table public.food_ingestion_batch_records from anon, authenticated;
revoke all on table public.food_barcodes from anon, authenticated;
revoke all on table public.food_market_relevance from anon, authenticated;

grant all privileges on table public.food_ingestion_batches to service_role;
grant all privileges on table public.food_ingestion_runs to service_role;
grant all privileges on table public.food_ingestion_batch_records to service_role;
grant all privileges on table public.food_barcodes to service_role;
grant all privileges on table public.food_market_relevance to service_role;

revoke all on function public.food_ingestion_batch_identity_immutable_guard() from public, anon, authenticated;
revoke all on function public.food_ingestion_run_audit_immutable_guard() from public, anon, authenticated;
revoke all on function public.food_ingestion_run_production_manifest_guard() from public, anon, authenticated;
revoke all on function public.food_source_record_snapshot_immutable_guard() from public, anon, authenticated;
revoke all on function public.food_ingestion_batch_membership_guard() from public, anon, authenticated;

grant execute on function public.food_ingestion_batch_identity_immutable_guard() to service_role;
grant execute on function public.food_ingestion_run_audit_immutable_guard() to service_role;
grant execute on function public.food_ingestion_run_production_manifest_guard() to service_role;
grant execute on function public.food_source_record_snapshot_immutable_guard() to service_role;
grant execute on function public.food_ingestion_batch_membership_guard() to service_role;

commit;
