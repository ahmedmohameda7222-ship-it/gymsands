\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan3_assert(p_condition boolean, p_message text)
returns void language plpgsql as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.plan3_rejected(p_sql text, p_message text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when others then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

-- A sealed generation is sufficient to exercise the trusted validation-report persistence boundary.
insert into public.food_catalog_generations (
  id,
  base_generation_id,
  generation_ordinal,
  composition_schema_version,
  generation_policy_version,
  activation_policy_version,
  trust_policy_version,
  projection_version,
  change_manifest_checksum_sha256,
  composition_checksum_sha256,
  authority_reference
) values (
  'e6100000-0000-4000-8000-000000000001',
  null,
  1,
  'composition-v1',
  'generation-v1',
  'activation-policy-v1',
  'trust-v1',
  'projection-v1',
  repeat('a', 64),
  repeat('b', 64),
  'validation-report-checksum-verifier'
);

-- GREEN acceptance: the exact canonical zero-finding report checksum is accepted
-- and the trusted persistence boundary stores that recomputed value.
select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
  'operation_id','e6100000-0000-4000-8000-000000000002',
  'command_checksum_sha256',repeat('c',64),
  'report_id','e6100000-0000-4000-8000-000000000003',
  'generation_id','e6100000-0000-4000-8000-000000000001',
  'generation_checksum_sha256',repeat('b',64),
  'validator_set_version','validator-v1',
  'policy_version','generation-v1',
  'report_checksum_sha256','8cbc91de8290056cedbe2d7c136ec4a59a0ebb0d684b7cbbac0bcc1c61d42f92',
  'blocker_count',0,
  'error_count',0,
  'warning_count',0,
  'info_count',0,
  'event_id','e6100000-0000-4000-8000-000000000004',
  'actor',jsonb_build_object(
    'principal_id','planner-fixture',
    'principal_type','human',
    'authority_reference','validation-report-checksum-verifier',
    'reason_code','validate',
    'policy_version','control-v1'
  ),
  'findings','[]'::jsonb
));
select pg_temp.plan3_assert(
  (select report_checksum_sha256 = '8cbc91de8290056cedbe2d7c136ec4a59a0ebb0d684b7cbbac0bcc1c61d42f92'
   from public.food_catalog_generation_validation_reports
   where id = 'e6100000-0000-4000-8000-000000000003'),
  'Trusted validation report checksum was not persisted exactly.'
);

-- Causal integrity check: changing semantic report contents while reusing the
-- prior valid checksum must be rejected before the report becomes promotable.
select pg_temp.plan3_rejected(
  $$select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
    'operation_id','e6100000-0000-4000-8000-000000000005',
    'command_checksum_sha256',repeat('d',64),
    'report_id','e6100000-0000-4000-8000-000000000006',
    'generation_id','e6100000-0000-4000-8000-000000000001',
    'generation_checksum_sha256',repeat('b',64),
    'validator_set_version','validator-v2',
    'policy_version','generation-v1',
    'report_checksum_sha256','8cbc91de8290056cedbe2d7c136ec4a59a0ebb0d684b7cbbac0bcc1c61d42f92',
    'blocker_count',0,
    'error_count',0,
    'warning_count',0,
    'info_count',0,
    'event_id','e6100000-0000-4000-8000-000000000007',
    'actor',jsonb_build_object(
      'principal_id','planner-fixture',
      'principal_type','human',
      'authority_reference','validation-report-checksum-verifier',
      'reason_code','validate-stale-checksum',
      'policy_version','control-v1'
    ),
    'findings','[]'::jsonb
  ))$$,
  'Validation report checksum mismatch was accepted at the trusted persistence boundary.'
);
select pg_temp.plan3_assert(
  not exists (
    select 1
    from public.food_catalog_generation_validation_reports
    where id = 'e6100000-0000-4000-8000-000000000006'
  ),
  'Rejected stale-checksum validation report left durable authority behind.'
);

rollback;
