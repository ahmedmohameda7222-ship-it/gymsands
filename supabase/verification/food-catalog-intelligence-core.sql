\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.food_catalog_core_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.food_catalog_core_rejected(p_sql text, p_message text)
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

select pg_temp.food_catalog_core_assert(
  to_regclass('public.food_nutrition_revisions') is not null
  and to_regclass('public.food_serving_options') is not null
  and to_regclass('public.food_names') is not null
  and to_regclass('public.food_taxonomy_namespaces') is not null
  and to_regclass('public.food_taxonomy_nodes') is not null
  and to_regclass('public.food_taxonomy_assignments') is not null
  and to_regclass('public.market_scopes') is not null
  and to_regclass('public.market_scope_memberships') is not null
  and to_regclass('public.food_market_assignments') is not null
  and to_regclass('public.food_verification_assertions') is not null
  and to_regclass('public.food_merge_events') is not null,
  'Food Catalog Intelligence core relations are missing.'
);

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  (
    'c1000000-0000-4000-8000-000000000001', 'Core fixture A', '100 g',
    null, 0, null, null, 'admin_created', true, 'active'
  ),
  (
    'c1000000-0000-4000-8000-000000000002', 'Core fixture B', '100 g',
    10, 1, 1, 1, 'admin_created', true, 'active'
  ),
  (
    'c1000000-0000-4000-8000-000000000003', 'Core fixture merged target', '100 g',
    20, 2, 2, 2, 'admin_created', true, 'active'
  );

insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving, review_metadata,
  source_dataset, source_version, source_release_date, source_record_checksum_sha256
) values
  (
    'c1000000-0000-4000-8000-000000000011', 'c1000000-0000-4000-8000-000000000001',
    'core-fixture', 'source-a', 'fixture://source-a', 'Fixture License', 'fixture://license', now(),
    '{"calories":0,"protein_g":null}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
    'core-fixture-dataset', 'v1', '2026-09-01', repeat('1', 64)
  ),
  (
    'c1000000-0000-4000-8000-000000000012', 'c1000000-0000-4000-8000-000000000002',
    'core-fixture', 'source-b', 'fixture://source-b', 'Fixture License', 'fixture://license', now(),
    '{"calories":10,"protein_g":1}'::jsonb, '{"amount":100,"unit":"g"}'::jsonb, '{}'::jsonb,
    'core-fixture-dataset', 'v1', '2026-09-01', repeat('2', 64)
  );

insert into public.food_nutrition_revisions (
  id, food_id, revision_number, calories, protein_g, carbs_g, fat_g,
  saturated_fat_g, fiber_g, sugars_g, sodium_mg, basis_amount, basis_unit,
  source_record_id, nutrient_mapping_version, authority_reference
) values (
  'c1000000-0000-4000-8000-000000000021', 'c1000000-0000-4000-8000-000000000001', 1,
  0, null, null, null, null, null, null, null, 100, 'g',
  'c1000000-0000-4000-8000-000000000011', 'fixture-v1', 'fixture-authority'
);

select pg_temp.food_catalog_core_assert(
  (select calories = 0 and protein_g is null
   from public.food_nutrition_revisions
   where id = 'c1000000-0000-4000-8000-000000000021'),
  'Nutrition must preserve explicit zero separately from unknown NULL.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_nutrition_revisions (
      food_id, revision_number, calories, protein_g, carbs_g, fat_g,
      saturated_fat_g, fiber_g, sugars_g, sodium_mg, basis_amount, basis_unit,
      nutrient_mapping_version
    ) values (
      'c1000000-0000-4000-8000-000000000001', 2, -1, null, null, null,
      null, null, null, null, 100, 'g', 'fixture-v1'
    )$$,
  'Negative nutrition was accepted.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_nutrition_revisions (
      food_id, revision_number, basis_amount, basis_unit, source_record_id, nutrient_mapping_version
    ) values (
      'c1000000-0000-4000-8000-000000000002', 1, 100, 'g',
      'c1000000-0000-4000-8000-000000000011', 'fixture-v1'
    )$$,
  'Nutrition accepted cross-Food source provenance.'
);

insert into public.food_serving_options (
  id, food_id, label, amount, unit_code, gram_weight, source_record_id,
  source_portion_code, evidence_class, source_primary, authority_reference
) values (
  'c1000000-0000-4000-8000-000000000031', 'c1000000-0000-4000-8000-000000000001',
  '100 g', 100, 'g', null, 'c1000000-0000-4000-8000-000000000011',
  '100g', 'exact_source', true, 'fixture-authority'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_serving_options (
      food_id, label, amount, unit_code, gram_weight, evidence_class
    ) values (
      'c1000000-0000-4000-8000-000000000001', '1 cup', 1, 'cup', null, 'exact_source'
    )$$,
  'Household serving without gram weight was accepted.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_serving_options (
      food_id, label, amount, unit_code, gram_weight, source_record_id, evidence_class
    ) values (
      'c1000000-0000-4000-8000-000000000002', '100 g', 100, 'g', null,
      'c1000000-0000-4000-8000-000000000011', 'exact_source'
    )$$,
  'Serving accepted cross-Food source provenance.'
);

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text,
  script_code, origin, source_record_id, policy_version
) values (
  'c1000000-0000-4000-8000-000000000041', 'c1000000-0000-4000-8000-000000000001',
  'fr-CA', 'source_name', 'Aliment test', 'aliment test', 'Latn', 'source',
  'c1000000-0000-4000-8000-000000000011', 'fixture-v1'
);

select pg_temp.food_catalog_core_assert(
  exists (
    select 1 from public.food_names
    where id = 'c1000000-0000-4000-8000-000000000041' and language_tag = 'fr-CA'
  ),
  'Open language-tag representation rejected fr-CA.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_names (
      food_id, language_tag, name_role, name_text, normalized_text, origin,
      source_record_id, policy_version
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'en', 'source_name', 'Wrong source',
      'wrong source', 'source', 'c1000000-0000-4000-8000-000000000011', 'fixture-v1'
    )$$,
  'Name accepted cross-Food source provenance.'
);

insert into public.food_taxonomy_nodes (node_code, namespace_code)
values
  ('core_fixture_parent_a', 'ingredient_family'),
  ('core_fixture_parent_b', 'ingredient_family'),
  ('core_fixture_replacement_a', 'ingredient_family'),
  ('core_fixture_replacement_b', 'ingredient_family');

update public.food_taxonomy_nodes
set parent_node_code = 'core_fixture_parent_a'
where node_code = 'core_fixture_parent_b';

select pg_temp.food_catalog_core_rejected(
  $$update public.food_taxonomy_nodes
    set parent_node_code = 'core_fixture_parent_b'
    where node_code = 'core_fixture_parent_a'$$,
  'Taxonomy parent cycle was accepted.'
);

update public.food_taxonomy_nodes
set replacement_node_code = 'core_fixture_replacement_a'
where node_code = 'core_fixture_replacement_b';

select pg_temp.food_catalog_core_rejected(
  $$update public.food_taxonomy_nodes
    set replacement_node_code = 'core_fixture_replacement_b'
    where node_code = 'core_fixture_replacement_a'$$,
  'Taxonomy replacement cycle was accepted.'
);

insert into public.food_taxonomy_assignments (
  id, food_id, node_code, source_record_id, assignment_action, policy_version
) values (
  'c1000000-0000-4000-8000-000000000051', 'c1000000-0000-4000-8000-000000000001',
  'protein_foods', 'c1000000-0000-4000-8000-000000000011', 'assign', 'fixture-v1'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_taxonomy_assignments (
      food_id, node_code, source_record_id, assignment_action, policy_version
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'protein_foods',
      'c1000000-0000-4000-8000-000000000011', 'assign', 'fixture-v1'
    )$$,
  'Taxonomy assignment accepted cross-Food source provenance.'
);

select pg_temp.food_catalog_core_assert(
  exists (select 1 from public.market_scopes where scope_code = 'GLOBAL' and scope_kind = 'global')
  and exists (select 1 from public.market_scopes where scope_code = 'EU' and scope_kind = 'region')
  and exists (select 1 from public.market_scopes where scope_code = 'GCC' and scope_kind = 'region')
  and exists (select 1 from public.market_scope_memberships where child_scope_code = 'DE' and parent_scope_code = 'EU')
  and exists (select 1 from public.market_scope_memberships where child_scope_code = 'SA' and parent_scope_code = 'GCC')
  and exists (select 1 from public.market_scope_memberships where child_scope_code = 'AE' and parent_scope_code = 'GCC'),
  'Approved market scopes or memberships are missing.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.market_scope_memberships (child_scope_code, parent_scope_code)
    values ('EU', 'DE')$$,
  'Market membership cycle was accepted.'
);

insert into public.food_market_assignments (
  id, food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
) values (
  'c1000000-0000-4000-8000-000000000061', 'c1000000-0000-4000-8000-000000000001',
  'GLOBAL', 'primary', 'c1000000-0000-4000-8000-000000000011', 'assign', 'fixture-v1'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_market_assignments (
      food_id, scope_code, relevance_level, source_record_id, assignment_action, policy_version
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'US', 'primary',
      'c1000000-0000-4000-8000-000000000011', 'assign', 'fixture-v1'
    )$$,
  'Market assignment accepted cross-Food source provenance.'
);

insert into public.food_verification_assertions (
  id, food_id, assertion_scope, assertion_state, policy_version, source_record_id,
  reason_code, authority_reference
) values (
  'c1000000-0000-4000-8000-000000000071', 'c1000000-0000-4000-8000-000000000001',
  'identity', 'verified', 'fixture-v1', 'c1000000-0000-4000-8000-000000000011',
  'fixture_verified', 'fixture-authority'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_verification_assertions (
      food_id, assertion_scope, assertion_state, policy_version, supersedes_assertion_id,
      reason_code, authority_reference
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'identity', 'revoked', 'fixture-v1',
      'c1000000-0000-4000-8000-000000000071', 'fixture_revoke', 'fixture-authority'
    )$$,
  'Verification supersession across Foods was accepted.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_verification_assertions (
      food_id, assertion_scope, assertion_state, policy_version, supersedes_assertion_id,
      reason_code, authority_reference
    ) values (
      'c1000000-0000-4000-8000-000000000001', 'nutrition', 'revoked', 'fixture-v1',
      'c1000000-0000-4000-8000-000000000071', 'fixture_revoke', 'fixture-authority'
    )$$,
  'Verification supersession across scopes was accepted.'
);

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_merge_events (
      source_food_id, target_food_id, policy_version, reason_code, authority_reference
    ) values (
      'c1000000-0000-4000-8000-000000000001', 'c1000000-0000-4000-8000-000000000001',
      'fixture-v1', 'duplicate', 'fixture-authority'
    )$$,
  'Self merge was accepted.'
);

update public.food_items
set lifecycle_status = 'merged',
    merged_into_food_id = 'c1000000-0000-4000-8000-000000000001'
where id = 'c1000000-0000-4000-8000-000000000003';

select pg_temp.food_catalog_core_rejected(
  $$insert into public.food_merge_events (
      source_food_id, target_food_id, policy_version, reason_code, authority_reference
    ) values (
      'c1000000-0000-4000-8000-000000000002', 'c1000000-0000-4000-8000-000000000003',
      'fixture-v1', 'duplicate', 'fixture-authority'
    )$$,
  'Merge event targeting an already-merged compatibility target was accepted.'
);

select pg_temp.food_catalog_core_rejected(
  $$update public.food_nutrition_revisions
    set calories = 1
    where id = 'c1000000-0000-4000-8000-000000000021'$$,
  'Immutable nutrition revision accepted update.'
);
select pg_temp.food_catalog_core_rejected(
  $$delete from public.food_serving_options
    where id = 'c1000000-0000-4000-8000-000000000031'$$,
  'Immutable serving fact accepted delete.'
);
select pg_temp.food_catalog_core_rejected(
  $$update public.food_names
    set name_text = 'rewritten'
    where id = 'c1000000-0000-4000-8000-000000000041'$$,
  'Immutable name fact accepted update.'
);
select pg_temp.food_catalog_core_rejected(
  $$delete from public.food_taxonomy_assignments
    where id = 'c1000000-0000-4000-8000-000000000051'$$,
  'Immutable taxonomy assignment accepted delete.'
);
select pg_temp.food_catalog_core_rejected(
  $$update public.food_market_assignments
    set relevance_level = 'secondary'
    where id = 'c1000000-0000-4000-8000-000000000061'$$,
  'Immutable market assignment accepted update.'
);
select pg_temp.food_catalog_core_rejected(
  $$delete from public.food_verification_assertions
    where id = 'c1000000-0000-4000-8000-000000000071'$$,
  'Immutable verification assertion accepted delete.'
);

insert into public.food_merge_events (
  id, source_food_id, target_food_id, policy_version, reason_code, authority_reference
) values (
  'c1000000-0000-4000-8000-000000000081',
  'c1000000-0000-4000-8000-000000000002',
  'c1000000-0000-4000-8000-000000000001',
  'fixture-v1', 'duplicate', 'fixture-authority'
);

select pg_temp.food_catalog_core_rejected(
  $$update public.food_merge_events
    set reason_code = 'rewritten'
    where id = 'c1000000-0000-4000-8000-000000000081'$$,
  'Immutable merge evidence accepted update.'
);

rollback;
