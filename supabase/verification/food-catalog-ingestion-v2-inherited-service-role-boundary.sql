begin;

-- Plan 4 rollback-only proof that Batch 0's inherited broad service_role grants
-- cannot mutate Plan 4 semantic authority outside the narrow SECURITY DEFINER commands.

create or replace function pg_temp.plan4_boundary_rejected(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 4 expected rejection did not occur: %', p_message;
  exception when others then
    if sqlerrm like 'Plan 4 expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

select public.food_catalog_ingestion_prepare_execution_v2(jsonb_build_object(
  'operationId','45000000-0000-4000-8000-000000000001',
  'commandChecksumSha256',repeat('1',64),
  'executionMode','dry_run',
  'attemptNumber',1,
  'manifestContentChecksumSha256',repeat('a',64),
  'semanticIdentityChecksumSha256',repeat('b',64),
  'source',jsonb_build_object(
    'provider','synthetic-reference',
    'dataset','service-role-boundary',
    'sourceVersion','2026.09',
    'sourceReleaseDate','2026-09-06',
    'licenseName','Fixture License',
    'licenseReference','fixture-license',
    'sourceReference','fixture://plan4/service-role-boundary',
    'sourceChecksumSha256',repeat('c',64),
    'importerVersion','plan4-boundary-test',
    'configChecksumSha256',repeat('d',64)
  ),
  'expectedMutations',jsonb_build_object(
    'input',0,'accepted',0,'rejected',0,'matched',0,'created',0,
    'possibleDuplicate',0,'quarantined',0
  )
));

create temporary table plan4_boundary_ids as
select batch.id as batch_id, run.id as dry_run_id
from public.food_ingestion_batches batch
join public.food_ingestion_runs run on run.batch_id = batch.id
where batch.semantic_identity_checksum_sha256 = repeat('b',64)
  and run.execution_mode = 'dry_run'
  and run.attempt_number = 1;

grant select on table plan4_boundary_ids to service_role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

select pg_temp.plan4_boundary_rejected(format(
  'update public.food_ingestion_batches set source_reference=%L where id=%L::uuid',
  'fixture://tampered-direct-service-role',
  (select batch_id::text from plan4_boundary_ids)
), 'service_role cannot directly mutate prepared Plan 4 semantic batch authority');

select pg_temp.plan4_boundary_rejected(format(
  'insert into public.food_ingestion_runs (batch_id,execution_mode,attempt_number,status,manifest_content_checksum_sha256,observed_input_count,observed_accepted_count,observed_rejected_count,observed_created_count,observed_matched_count,observed_possible_duplicate_count,observed_quarantine_count) values (%L::uuid,%L,99,%L,%L,0,0,0,0,0,0,0)',
  (select batch_id::text from plan4_boundary_ids),
  'dry_run',
  'prepared',
  repeat('a',64)
), 'service_role cannot directly create a Plan 4 semantic run');

reset role;

rollback;
