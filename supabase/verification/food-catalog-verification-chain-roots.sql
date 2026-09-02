\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.plan3_root_rejected(p_sql text, p_message text)
returns void language plpgsql as $function$
begin
  begin
    execute p_sql;
  exception when unique_violation then
    return;
  end;
  raise exception '%', p_message;
end
$function$;

-- Isolated fixtures for the Plan 3 verification-chain root invariant.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  ('d3900000-0000-4000-8000-000000000001', 'Plan3 verification root A', '100 g', null, null, null, null, 'admin_created', true, 'draft'),
  ('d3900000-0000-4000-8000-000000000002', 'Plan3 verification root B', '100 g', null, null, null, null, 'admin_created', true, 'draft');

-- First root for Food A / identity: PASS.
insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version,
  supersedes_assertion_id, reason_code, authority_reference
) values (
  'd3900000-0000-4000-8000-000000000011',
  'd3900000-0000-4000-8000-000000000001',
  'identity', 'verified', 'root-v1', null, 'ROOT_IDENTITY_A', 'plan3-root-verifier'
);

-- Independent root for Food A / nutrition: PASS.
insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version,
  supersedes_assertion_id, reason_code, authority_reference
) values (
  'd3900000-0000-4000-8000-000000000012',
  'd3900000-0000-4000-8000-000000000001',
  'nutrition', 'verified', 'root-v1', null, 'ROOT_NUTRITION_A', 'plan3-root-verifier'
);

-- Independent root for Food B / identity: PASS.
insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version,
  supersedes_assertion_id, reason_code, authority_reference
) values (
  'd3900000-0000-4000-8000-000000000013',
  'd3900000-0000-4000-8000-000000000002',
  'identity', 'verified', 'root-v1', null, 'ROOT_IDENTITY_B', 'plan3-root-verifier'
);

-- A valid successor of the first Food A / identity root: PASS.
insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version,
  supersedes_assertion_id, reason_code, authority_reference
) values (
  'd3900000-0000-4000-8000-000000000014',
  'd3900000-0000-4000-8000-000000000001',
  'identity', 'revoked', 'root-v2',
  'd3900000-0000-4000-8000-000000000011',
  'SUPERSEDE_IDENTITY_A', 'plan3-root-verifier'
);

-- Existing predecessor uniqueness must still reject a second successor of the same predecessor.
select pg_temp.plan3_root_rejected(
  $$insert into public.food_verification_assertions (
      id, food_id, assertion_scope, assertion_state, policy_version,
      supersedes_assertion_id, reason_code, authority_reference
    ) values (
      'd3900000-0000-4000-8000-000000000015',
      'd3900000-0000-4000-8000-000000000001',
      'identity', 'verified', 'root-v2',
      'd3900000-0000-4000-8000-000000000011',
      'SECOND_SUCCESSOR_IDENTITY_A', 'plan3-root-verifier'
    )$$,
  'Second verification successor for the same predecessor was accepted.'
);

-- RED until Plan 3 enforces one chain root per (food_id, assertion_scope).
select pg_temp.plan3_root_rejected(
  $$insert into public.food_verification_assertions (
      id, food_id, assertion_scope, assertion_state, policy_version,
      supersedes_assertion_id, reason_code, authority_reference
    ) values (
      'd3900000-0000-4000-8000-000000000016',
      'd3900000-0000-4000-8000-000000000001',
      'identity', 'verified', 'root-v1', null,
      'SECOND_ROOT_IDENTITY_A', 'plan3-root-verifier'
    )$$,
  'Second verification root for the same Food/scope was accepted.'
);

rollback;
