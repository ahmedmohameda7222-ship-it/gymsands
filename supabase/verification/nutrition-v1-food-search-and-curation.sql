-- Disposable verification for Nutrition V1 Food search, provenance, personalization, and curation.
-- Fixtures and helper functions are rolled back.

\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.nv1_food_assert(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception '%', p_message;
  end if;
end
$function$;

create or replace function pg_temp.nv1_food_rejected(p_sql text, p_message text)
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

grant execute on function pg_temp.nv1_food_assert(boolean, text) to public;
grant execute on function pg_temp.nv1_food_rejected(text, text) to public;

do $catalog$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_aliases'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%en%'
      and pg_get_constraintdef(oid) like '%de%'
      and pg_get_constraintdef(oid) like '%ar%'
  ) then
    raise exception 'Nutrition V1 food alias locale contract missing.';
  end if;

  if exists (
    select 1
    from information_schema.columns required
    right join (values
      ('provider'), ('source_record_id'), ('license_name'), ('retrieved_at'),
      ('source_nutrition'), ('source_serving'), ('review_metadata')
    ) names(column_name) on required.table_schema = 'public'
      and required.table_name = 'food_source_records'
      and required.column_name = names.column_name
    where required.column_name is null
  ) or not has_table_privilege('service_role', 'public.food_source_records', 'INSERT')
     or has_table_privilege('authenticated', 'public.food_source_records', 'INSERT')
  then
    raise exception 'Nutrition V1 food provenance contract missing.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_favorites'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) ~* 'user_id, food_id'
  ) then
    raise exception 'Nutrition V1 food favorite uniqueness missing.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_items'::regclass
      and conname = 'food_items_verified_source_record_fk'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'food_items'
      and column_name = 'is_verified'
  ) then
    raise exception 'Nutrition V1 food verification boundary invalid.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'food_items_name_trgm_idx'
      and indexdef like '%gin_trgm_ops%'
  ) or not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'food_aliases_normalized_trgm_idx'
      and indexdef like '%gin_trgm_ops%'
  ) then
    raise exception 'Nutrition V1 food search index missing.';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_items'::regclass
      and conname = 'food_items_merged_into_fk'
  ) or not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.food_items'::regclass
      and conname = 'food_items_no_self_merge'
  ) then
    raise exception 'Nutrition V1 food duplicate redirect invalid.';
  end if;

  if exists (
    select 1
    from (values ('food_personal_corrections'), ('food_favorites')) required(table_name)
    join pg_class relation
      on relation.relname = required.table_name
     and relation.relnamespace = 'public'::regnamespace
    where relation.relrowsecurity is not true
  ) then
    raise exception 'Nutrition V1 food personal correction owner isolation leaked.';
  end if;
end
$catalog$;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    'a2130000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
    'nutrition-food-owner@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    'a2130000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
    'nutrition-food-intruder@example.invalid', '',
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
  );

-- Legacy canonical Food mutation is deliberately hardened. Disposable fixtures use
-- the local database owner rather than broadening service_role privileges on food_items.
insert into public.food_items (
  id, food_name, serving_size, calories, protein_g, carbs_g, fat_g,
  source_type, is_global, lifecycle_status
) values
  (
    'a2130000-0000-4000-8000-000000000010', 'Chicken Breast', '100 g',
    165, 31, 0, 3.6, 'admin_created', true, 'active'
  ),
  (
    'a2130000-0000-4000-8000-000000000011', 'Chicken Breast Duplicate', '100 g',
    165, 31, 0, 3.6, 'admin_created', true, 'active'
  ),
  (
    'a2130000-0000-4000-8000-000000000012', 'Other Food', '100 g',
    100, 10, 10, 2, 'admin_created', true, 'active'
  );

insert into public.food_source_records (
  id, food_id, provider, source_record_id, source_reference,
  license_name, license_reference, retrieved_at, source_nutrition, source_serving, review_metadata
) values
  (
    'a2130000-0000-4000-8000-000000000020',
    'a2130000-0000-4000-8000-000000000010',
    'fixture-provider', 'food-10', 'fixture-v1',
    'Fixture License', 'fixture-license-ref', clock_timestamp(),
    '{"calories":165,"protein_g":31}'::jsonb,
    '{"amount":100,"unit":"g"}'::jsonb,
    '{"reviewed":true}'::jsonb
  ),
  (
    'a2130000-0000-4000-8000-000000000021',
    'a2130000-0000-4000-8000-000000000012',
    'fixture-provider', 'food-12', 'fixture-v1',
    'Fixture License', 'fixture-license-ref', clock_timestamp(),
    '{"calories":100}'::jsonb,
    '{"amount":100,"unit":"g"}'::jsonb,
    '{}'::jsonb
  );

insert into public.food_aliases (food_id, locale, alias, normalized_alias, alias_type) values
  ('a2130000-0000-4000-8000-000000000010', 'en', 'Chicken breast', 'chicken breast', 'localized_name'),
  ('a2130000-0000-4000-8000-000000000010', 'de', 'Hähnchenbrust', 'hähnchenbrust', 'localized_name'),
  ('a2130000-0000-4000-8000-000000000010', 'ar', 'صدر دجاج', 'صدر دجاج', 'localized_name');

select pg_temp.nv1_food_assert(
  (select is_verified is false and verified_source_record_id is null
   from public.food_items where id = 'a2130000-0000-4000-8000-000000000010'),
  'Nutrition V1 food verification boundary invalid.'
);

update public.food_items
set is_verified = true,
    verified_at = clock_timestamp(),
    verified_source_record_id = 'a2130000-0000-4000-8000-000000000020'
where id = 'a2130000-0000-4000-8000-000000000010';

select pg_temp.nv1_food_rejected(
  $$update public.food_items
    set verified_source_record_id = 'a2130000-0000-4000-8000-000000000021'
    where id = 'a2130000-0000-4000-8000-000000000010'$$,
  'Nutrition V1 food verification boundary invalid.'
);

update public.food_items
set lifecycle_status = 'merged',
    merged_into_food_id = 'a2130000-0000-4000-8000-000000000010'
where id = 'a2130000-0000-4000-8000-000000000011';

select pg_temp.nv1_food_assert(
  (select merged_into_food_id = 'a2130000-0000-4000-8000-000000000010'
   from public.food_items where id = 'a2130000-0000-4000-8000-000000000011'),
  'Nutrition V1 food duplicate redirect invalid.'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2130000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.food_personal_corrections (
  user_id, food_id, calories, protein_g, is_active
) values (
  'a2130000-0000-4000-8000-000000000001',
  'a2130000-0000-4000-8000-000000000010',
  150, 30, true
);

insert into public.food_favorites (user_id, food_id) values (
  'a2130000-0000-4000-8000-000000000001',
  'a2130000-0000-4000-8000-000000000010'
);

select pg_temp.nv1_food_rejected(
  $$insert into public.food_favorites (user_id, food_id) values (
    'a2130000-0000-4000-8000-000000000001',
    'a2130000-0000-4000-8000-000000000010'
  )$$,
  'Nutrition V1 food favorite uniqueness missing.'
);

select set_config('request.jwt.claim.sub', 'a2130000-0000-4000-8000-000000000002', true);

select pg_temp.nv1_food_assert(
  not exists (
    select 1 from public.food_personal_corrections
    where user_id = 'a2130000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1 from public.food_favorites
    where user_id = 'a2130000-0000-4000-8000-000000000001'
  ),
  'Nutrition V1 food personal correction owner isolation leaked.'
);

select pg_temp.nv1_food_rejected(
  $$insert into public.food_personal_corrections (
      user_id, food_id, calories
    ) values (
      'a2130000-0000-4000-8000-000000000001',
      'a2130000-0000-4000-8000-000000000012',
      90
    )$$,
  'Nutrition V1 food personal correction owner isolation leaked.'
);

rollback;
