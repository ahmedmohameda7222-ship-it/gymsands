-- Disposable verification for the trusted Phase 2 curated registry.
-- Run only after a clean local/development migration reset. All fixtures roll back.

\set ON_ERROR_STOP on
\set member_id '45000000-0000-4000-8000-000000000005'
\set admin_id  '46000000-0000-4000-8000-000000000006'

begin;

do $schema$
declare
  table_name text;
begin
  foreach table_name in array array[
    'exercise_localizations', 'exercise_aliases', 'exercise_relationships',
    'exercise_research_sources', 'exercise_mapping_evidence', 'exercise_mapping_reviews'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing Phase 2 table: %', table_name;
    end if;
    if not exists (select 1 from pg_class where oid = ('public.' || table_name)::regclass and relrowsecurity) then
      raise exception 'RLS is not enabled on Phase 2 table: %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has Phase 2 table access: %', table_name;
    end if;
  end loop;
end
$schema$;

do $registry$
begin
  if (select count(*) from public.exercises where source = 'plaivra_curated') <> 60
     or (select count(*) from public.exercise_localizations localization join public.exercises exercise on exercise.id = localization.exercise_id where exercise.source = 'plaivra_curated') <> 180
     or (select count(*) from public.exercise_aliases alias join public.exercises exercise on exercise.id = alias.exercise_id where exercise.source = 'plaivra_curated') <> 180
     or (select count(*) from public.exercise_relationships relationship join public.exercises exercise on exercise.id = relationship.source_exercise_id where exercise.source = 'plaivra_curated') <> 32
     or (select count(*) from public.exercise_provider_links link join public.exercises exercise on exercise.id = link.exercise_id where exercise.source = 'plaivra_curated') <> 9
     or (select count(*) from public.exercise_muscle_mapping_sets mapping_set join public.exercises exercise on exercise.id = mapping_set.exercise_id where exercise.source = 'plaivra_curated' and mapping_set.status = 'published') <> 60
     or (select count(*) from public.exercise_muscle_mapping_entries entry join public.exercise_muscle_mapping_sets mapping_set on mapping_set.id = entry.mapping_set_id join public.exercises exercise on exercise.id = mapping_set.exercise_id where exercise.source = 'plaivra_curated') <> 180 then
    raise exception 'Phase 2 registry count verification failed.';
  end if;
  if exists (
    select 1 from public.exercise_aliases
    group by locale, normalized_alias having count(*) > 1
  ) then raise exception 'Phase 2 alias collision exists.'; end if;
  if exists (
    select 1 from public.exercise_muscle_mapping_sets mapping_set
    join public.exercises exercise on exercise.id = mapping_set.exercise_id
    where exercise.source = 'plaivra_curated'
      and private.exercise_muscle_mapping_checksum(mapping_set.id) is distinct from mapping_set.checksum
  ) then raise exception 'Phase 2 published checksum drift exists.'; end if;
  if exists (
    select 1
    from (
      select exercise.slug, link.provider_activity_id, link.provider_slug, link.provider_version
      from public.exercise_provider_links link
      join public.exercises exercise on exercise.id = link.exercise_id
      where exercise.source = 'plaivra_curated'
    ) actual
    full join (values
      ('barbell-bench-press', 'cc1f1371-7d26-4bc8-b7df-7d2a6d1830bb', 'barbell_bench_press', '1'),
      ('standing-barbell-overhead-press', '6a37a573-0b3e-4ec7-8917-94da410eab4f', 'standing_barbell_overhead_press', '1'),
      ('dumbbell-lateral-raise', '3fa578c9-d2ad-4c48-8f96-2967c490881e', 'dumbbell_lateral_raise', '1'),
      ('lat-pulldown', '0ee93d25-ad3a-46a1-b3d8-d94a7d04ecb2', 'lat_pulldown', '1'),
      ('seated-cable-row', 'de77ae88-55a4-4d7d-bcb7-379024da97f5', 'seated_cable_row', '1'),
      ('cable-triceps-pushdown', '3f310a14-8b2f-4614-8b78-d4ed33181c12', 'cable_triceps_pushdown', '1'),
      ('barbell-back-squat', 'f2fe7153-b6f7-415b-b15c-a23a43a5c7d2', 'barbell_back_squat', '1'),
      ('barbell-romanian-deadlift', '54ab0a17-eca8-4129-80ef-37fca5e5b618', 'barbell_romanian_deadlift', '1'),
      ('front-plank', 'dfe154d4-a3bb-40fb-a80c-41a4a484ca75', 'front_plank', '1')
    ) expected(slug, provider_activity_id, provider_slug, provider_version)
      using (slug, provider_activity_id, provider_slug, provider_version)
    where actual.slug is null or expected.slug is null
  ) then raise exception 'Phase 2 provider allowlist differs from the approved nine exact identities.'; end if;
  if exists (
    select 1 from public.exercise_muscle_mapping_sets mapping_set
    join public.exercises exercise on exercise.id = mapping_set.exercise_id
    where exercise.source = 'plaivra_curated' and mapping_set.status = 'draft'
  ) then raise exception 'Phase 2 retained an unintended draft mapping.'; end if;
  if exists (select 1 from public.exercises where source = 'plaivra_legacy_workouts')
     or exists (select 1 from public.workouts where notes ilike 'Real FitLife exercise library seed%')
     or exists (select 1 from public.exercise_library where notes ilike 'Real FitLife exercise library seed%') then
    raise exception 'Retired legacy catalog is not empty.';
  end if;
end
$registry$;

create or replace function pg_temp.assert_member_write_denied(p_exercise_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $assert$
begin
  begin
    insert into public.exercise_aliases(exercise_id, locale, alias, normalized_alias, alias_type)
    values (p_exercise_id, 'en', 'Forbidden Member Alias', 'forbidden member alias', 'common_name');
    raise exception 'Member Phase 2 write unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end
$assert$;
grant execute on function pg_temp.assert_member_write_denied(uuid) to authenticated;

create or replace function pg_temp.assert_published_mapping_immutable(p_mapping_set_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $assert$
begin
  begin
    update public.exercise_muscle_mapping_sets set checksum = checksum where id = p_mapping_set_id;
    raise exception 'Published Phase 2 mapping unexpectedly mutable.';
  exception when check_violation then null;
  end;
end
$assert$;
grant execute on function pg_temp.assert_published_mapping_immutable(uuid) to authenticated;

insert into auth.users(
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'member_id'::uuid, 'authenticated', 'authenticated', 'phase2-member@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_id'::uuid, 'authenticated', 'authenticated', 'phase2-admin@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
update public.profiles set role = 'admin' where id = :'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $member_reads$
begin
  if (select count(*) from public.exercise_localizations) <> 180
     or (select count(*) from public.exercise_aliases) <> 180
     or (select count(*) from public.exercise_relationships) <> 32 then
    raise exception 'Member-readable Phase 2 curation rows are incomplete.';
  end if;
  if exists (select 1 from public.exercise_research_sources)
     or exists (select 1 from public.exercise_mapping_evidence)
     or exists (select 1 from public.exercise_mapping_reviews) then
    raise exception 'Internal Phase 2 research or review data leaked to a member.';
  end if;
end
$member_reads$;
select pg_temp.assert_member_write_denied((select id from public.exercises where source = 'plaivra_curated' order by id limit 1));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $admin_reads$
begin
  if (select count(*) from public.exercise_research_sources) <> 21
     or (select count(*) from public.exercise_mapping_reviews) <> 60 then
    raise exception 'Administrator Phase 2 research/review access failed.';
  end if;
end
$admin_reads$;
do $admin_write$
declare
  affected integer;
begin
  update public.exercise_localizations set name = name
  where exercise_id = (select id from public.exercises where source = 'plaivra_curated' order by id limit 1) and locale = 'en';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Administrator Phase 2 write boundary failed.'; end if;
end
$admin_write$;
select pg_temp.assert_published_mapping_immutable((select mapping_set.id from public.exercise_muscle_mapping_sets mapping_set join public.exercises exercise on exercise.id = mapping_set.exercise_id where exercise.source = 'plaivra_curated' order by mapping_set.id limit 1));
reset role;

rollback;
