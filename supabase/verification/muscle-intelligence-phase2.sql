-- Optional disposable security verification for the scalable curated exercise registry.
-- It checks access control and data integrity without requiring a fixed cohort size.

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
      raise exception 'Missing curated registry table: %', table_name;
    end if;
    if not exists (
      select 1 from pg_class
      where oid = ('public.' || table_name)::regclass and relrowsecurity
    ) then
      raise exception 'RLS is not enabled on curated registry table: %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has curated registry access: %', table_name;
    end if;
  end loop;
end
$schema$;

do $integrity$
begin
  if not exists (select 1 from public.exercises where source = 'plaivra_curated') then
    raise exception 'Curated exercise registry is empty.';
  end if;

  if exists (
    select 1 from public.exercise_aliases
    group by locale, normalized_alias
    having count(*) > 1
  ) then
    raise exception 'Curated registry alias collision exists.';
  end if;

  if exists (
    select 1
    from public.exercise_muscle_mapping_sets mapping_set
    join public.exercises exercise on exercise.id = mapping_set.exercise_id
    where exercise.source = 'plaivra_curated'
      and mapping_set.status in ('published', 'retired')
      and private.exercise_muscle_mapping_checksum(mapping_set.id) is distinct from mapping_set.checksum
  ) then
    raise exception 'Published curated mapping checksum drift exists.';
  end if;

  if exists (
    select provider, provider_activity_id
    from public.exercise_provider_links
    where verification_status = 'verified'
    group by provider, provider_activity_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate verified provider identity exists.';
  end if;

  if exists (
    select 1
    from public.exercise_muscle_mapping_sets mapping_set
    join public.exercises exercise on exercise.id = mapping_set.exercise_id
    where exercise.source = 'plaivra_curated'
      and mapping_set.status = 'published'
      and not exists (
        select 1 from public.exercise_muscle_mapping_entries entry
        where entry.mapping_set_id = mapping_set.id and entry.role = 'primary'
      )
  ) then
    raise exception 'Published curated mapping lacks a primary muscle.';
  end if;
end
$integrity$;

create or replace function pg_temp.assert_member_write_denied(p_exercise_id uuid)
returns void language plpgsql security invoker set search_path = pg_catalog, public, pg_temp as $assert$
begin
  begin
    insert into public.exercise_aliases(exercise_id, locale, alias, normalized_alias, alias_type)
    values (p_exercise_id, 'en', 'Forbidden Member Alias', 'forbidden member alias', 'common_name');
    raise exception 'Member curated registry write unexpectedly succeeded.';
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
    raise exception 'Published curated mapping unexpectedly mutable.';
  exception when check_violation then null;
  end;
end
$assert$;
grant execute on function pg_temp.assert_published_mapping_immutable(uuid) to authenticated;

insert into auth.users(
  id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'member_id'::uuid, 'authenticated', 'authenticated', 'registry-member@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_id'::uuid, 'authenticated', 'authenticated', 'registry-admin@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
update public.profiles set role = 'admin' where id = :'admin_id'::uuid;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $member_reads$
begin
  if not exists (select 1 from public.exercise_localizations)
     or not exists (select 1 from public.exercise_aliases)
     or not exists (select 1 from public.exercise_relationships) then
    raise exception 'Member-readable curated content is unavailable.';
  end if;
  if exists (select 1 from public.exercise_research_sources)
     or exists (select 1 from public.exercise_mapping_evidence)
     or exists (select 1 from public.exercise_mapping_reviews) then
    raise exception 'Internal curated research or review data leaked to a member.';
  end if;
end
$member_reads$;
select pg_temp.assert_member_write_denied((select id from public.exercises where source = 'plaivra_curated' order by id limit 1));
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
do $admin_access$
declare
  affected integer;
begin
  if not exists (select 1 from public.exercise_research_sources)
     or not exists (select 1 from public.exercise_mapping_reviews) then
    raise exception 'Administrator curated research access failed.';
  end if;

  update public.exercise_localizations set name = name
  where exercise_id = (select id from public.exercises where source = 'plaivra_curated' order by id limit 1)
    and locale = 'en';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'Administrator curated write boundary failed.'; end if;
end
$admin_access$;
select pg_temp.assert_published_mapping_immutable((
  select mapping_set.id
  from public.exercise_muscle_mapping_sets mapping_set
  join public.exercises exercise on exercise.id = mapping_set.exercise_id
  where exercise.source = 'plaivra_curated' and mapping_set.status = 'published'
  order by mapping_set.id limit 1
));
reset role;

rollback;
