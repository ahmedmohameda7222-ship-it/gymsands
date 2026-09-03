\set ON_ERROR_STOP on

begin;

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

-- Causal RED: a caller-provided checksum that was not derived from the submitted
-- semantic report must never be persisted as promotable validation authority.
select pg_temp.plan3_rejected(
  $$select public.food_catalog_record_generation_validation_v1(jsonb_build_object(
    'operation_id','e6100000-0000-4000-8000-000000000002',
    'command_checksum_sha256',repeat('c',64),
    'report_id','e6100000-0000-4000-8000-000000000003',
    'generation_id','e6100000-0000-4000-8000-000000000001',
    'generation_checksum_sha256',repeat('b',64),
    'validator_set_version','validator-v1',
    'policy_version','generation-v1',
    'report_checksum_sha256',repeat('d',64),
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
  ))$$,
  'Validation report checksum mismatch was accepted at the trusted persistence boundary.'
);

rollback;
