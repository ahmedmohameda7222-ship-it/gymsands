\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.food_catalog_semantic_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.food_catalog_semantic_rejected(p_sql text, p_message text)
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

insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  (
    'c2000000-0000-4000-8000-000000000001', 'Semantic fixture A', '100 g',
    null, 0, null, null, 'admin_created', true, 'active'
  ),
  (
    'c2000000-0000-4000-8000-000000000002', 'Semantic fixture B', '100 g',
    10, 1, 1, 1, 'admin_created', true, 'active'
  );

insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving, review_metadata,
  source_dataset, source_version, source_release_date, source_record_checksum_sha256
) values
  (
    'c2000000-0000-4000-8000-000000000011', 'c2000000-0000-4000-8000-000000000001',
    'semantic-fixture', 'source-a', 'fixture://semantic-source-a', 'Fixture License', 'fixture://license', now(),
    '{"calories":0}'::jsonb, '{"amount":1,"unit":"cup","gram_weight":240}'::jsonb, '{}'::jsonb,
    'semantic-fixture-dataset', 'v1', '2026-09-01', repeat('3', 64)
  ),
  (
    'c2000000-0000-4000-8000-000000000012', 'c2000000-0000-4000-8000-000000000002',
    'semantic-fixture', 'source-b', 'fixture://semantic-source-b', 'Fixture License', 'fixture://license', now(),
    '{"calories":10}'::jsonb, '{"amount":1,"unit":"cup","gram_weight":200}'::jsonb, '{}'::jsonb,
    'semantic-fixture-dataset', 'v1', '2026-09-01', repeat('4', 64)
  );

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1
    from pg_constraint
    where conname = 'food_serving_options_source_backed_weight_check'
      and conrelid = 'public.food_serving_options'::regclass
  ),
  'Serving source-backed weight constraint is missing.'
);

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1
    from pg_constraint
    where conname = 'food_names_source_provenance_check'
      and conrelid = 'public.food_names'::regclass
  ),
  'Food name source provenance constraint is missing.'
);

insert into public.food_serving_options (
  id, food_id, label, amount, unit_code, gram_weight, source_record_id,
  source_portion_code, evidence_class, source_primary, authority_reference
) values (
  'c2000000-0000-4000-8000-000000000021', 'c2000000-0000-4000-8000-000000000001',
  '50 g', 50, 'g', null, null, null, 'exact_source', false, null
);

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1 from public.food_serving_options
    where id = 'c2000000-0000-4000-8000-000000000021'
      and unit_code = 'g'
      and gram_weight is null
      and source_record_id is null
  ),
  'Direct gram serving behavior was narrowed unexpectedly.'
);

select pg_temp.food_catalog_semantic_rejected(
  $$insert into public.food_serving_options (
      food_id, label, amount, unit_code, gram_weight, source_record_id,
      source_portion_code, evidence_class, source_primary, authority_reference
    ) values (
      'c2000000-0000-4000-8000-000000000001', '1 cup without provenance',
      1, 'cup', 240, null, null, 'exact_source', false, null
    )$$,
  'Household serving with positive gram weight but no source-backed provenance was accepted.'
);

insert into public.food_serving_options (
  id, food_id, label, amount, unit_code, gram_weight, source_record_id,
  source_portion_code, evidence_class, source_primary, authority_reference
) values (
  'c2000000-0000-4000-8000-000000000022', 'c2000000-0000-4000-8000-000000000001',
  '1 cup source-backed', 1, 'cup', 240, 'c2000000-0000-4000-8000-000000000011',
  'cup', 'exact_source', true, 'fixture://semantic-source-a#cup'
);

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1 from public.food_serving_options
    where id = 'c2000000-0000-4000-8000-000000000022'
      and gram_weight = 240
      and source_record_id = 'c2000000-0000-4000-8000-000000000011'
  ),
  'Valid source-backed household serving was rejected.'
);

select pg_temp.food_catalog_semantic_rejected(
  $$insert into public.food_serving_options (
      food_id, label, amount, unit_code, gram_weight, source_record_id,
      source_portion_code, evidence_class, source_primary
    ) values (
      'c2000000-0000-4000-8000-000000000001', '1 cup wrong Food source',
      1, 'cup', 200, 'c2000000-0000-4000-8000-000000000012',
      'cup', 'exact_source', false
    )$$,
  'Household serving accepted cross-Food source provenance.'
);

select pg_temp.food_catalog_semantic_rejected(
  $$insert into public.food_names (
      food_id, language_tag, name_role, name_text, normalized_text,
      script_code, origin, source_record_id, policy_version
    ) values (
      'c2000000-0000-4000-8000-000000000001', 'en', 'synonym',
      'Source-origin missing provenance', 'source-origin missing provenance',
      'Latn', 'source', null, 'fixture-v1'
    )$$,
  'Source-origin Food name without source_record_id was accepted.'
);

select pg_temp.food_catalog_semantic_rejected(
  $$insert into public.food_names (
      food_id, language_tag, name_role, name_text, normalized_text,
      script_code, origin, source_record_id, policy_version
    ) values (
      'c2000000-0000-4000-8000-000000000001', 'en', 'source_name',
      'Source-name missing provenance', 'source-name missing provenance',
      'Latn', 'curated', null, 'fixture-v1'
    )$$,
  'source_name Food fact without source_record_id was accepted.'
);

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text,
  script_code, origin, source_record_id, policy_version
) values (
  'c2000000-0000-4000-8000-000000000031', 'c2000000-0000-4000-8000-000000000001',
  'en', 'source_name', 'Source-backed name', 'source-backed name',
  'Latn', 'source', 'c2000000-0000-4000-8000-000000000011', 'fixture-v1'
);

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1 from public.food_names
    where id = 'c2000000-0000-4000-8000-000000000031'
      and source_record_id = 'c2000000-0000-4000-8000-000000000011'
  ),
  'Valid source-backed Food name was rejected.'
);

insert into public.food_names (
  id, food_id, language_tag, name_role, name_text, normalized_text,
  script_code, origin, source_record_id, policy_version
) values (
  'c2000000-0000-4000-8000-000000000032', 'c2000000-0000-4000-8000-000000000001',
  'ar', 'transliteration', 'foul medames', 'foul medames',
  'Latn', 'curated', null, 'fixture-v1'
);

select pg_temp.food_catalog_semantic_assert(
  exists (
    select 1 from public.food_names
    where id = 'c2000000-0000-4000-8000-000000000032'
      and name_role = 'transliteration'
      and origin = 'curated'
      and source_record_id is null
  ),
  'Curated transliteration without source provenance was rejected.'
);

select pg_temp.food_catalog_semantic_rejected(
  $$insert into public.food_names (
      food_id, language_tag, name_role, name_text, normalized_text,
      script_code, origin, source_record_id, policy_version
    ) values (
      'c2000000-0000-4000-8000-000000000001', 'en', 'source_name',
      'Wrong Food source', 'wrong food source', 'Latn', 'source',
      'c2000000-0000-4000-8000-000000000012', 'fixture-v1'
    )$$,
  'Food name accepted cross-Food source provenance.'
);

rollback;
