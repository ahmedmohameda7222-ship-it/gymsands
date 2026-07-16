-- Disposable verification for Plaivra Muscle Intelligence Phase 1.
-- Run only after a clean local/development migration reset. All fixtures roll back.

\set ON_ERROR_STOP on
\set user_a_id '41000000-0000-4000-8000-000000000001'
\set user_b_id '42000000-0000-4000-8000-000000000002'
\set admin_id  '43000000-0000-4000-8000-000000000003'
\set delete_id '44000000-0000-4000-8000-000000000004'

begin;

do $catalog$
declare
  table_name text;
  required_column record;
  routine_oid oid;
  routine_settings text[];
begin
  foreach table_name in array array[
    'exercise_provider_links',
    'exercise_muscle_mapping_sets',
    'exercise_muscle_mapping_entries',
    'user_custom_exercise_mapping_sets',
    'user_custom_exercise_mapping_entries'
  ] loop
    if to_regclass('public.' || table_name) is null then
      raise exception 'Missing Muscle Intelligence table: %', table_name;
    end if;
    if not exists (
      select 1 from pg_class relation
      where relation.oid = ('public.' || table_name)::regclass and relation.relrowsecurity
    ) then
      raise exception 'RLS is not enabled on Muscle Intelligence table: %', table_name;
    end if;
    if has_table_privilege('anon', 'public.' || table_name, 'SELECT')
       or has_table_privilege('anon', 'public.' || table_name, 'INSERT')
       or has_table_privilege('anon', 'public.' || table_name, 'UPDATE')
       or has_table_privilege('anon', 'public.' || table_name, 'DELETE') then
      raise exception 'Anonymous role has access to Muscle Intelligence table: %', table_name;
    end if;
  end loop;

  for required_column in
    select * from (values
      ('exercise_provider_links', 'id'),
      ('exercise_provider_links', 'exercise_id'),
      ('exercise_provider_links', 'provider'),
      ('exercise_provider_links', 'provider_activity_id'),
      ('exercise_provider_links', 'provider_slug'),
      ('exercise_provider_links', 'provider_version'),
      ('exercise_provider_links', 'verification_status'),
      ('exercise_provider_links', 'verified_at'),
      ('exercise_provider_links', 'created_at'),
      ('exercise_provider_links', 'updated_at'),
      ('exercise_muscle_mapping_sets', 'id'),
      ('exercise_muscle_mapping_sets', 'exercise_id'),
      ('exercise_muscle_mapping_sets', 'mapping_version'),
      ('exercise_muscle_mapping_sets', 'status'),
      ('exercise_muscle_mapping_sets', 'source'),
      ('exercise_muscle_mapping_sets', 'schema_version'),
      ('exercise_muscle_mapping_sets', 'checksum'),
      ('exercise_muscle_mapping_sets', 'published_at'),
      ('exercise_muscle_mapping_sets', 'retired_at'),
      ('exercise_muscle_mapping_sets', 'created_at'),
      ('exercise_muscle_mapping_sets', 'updated_at'),
      ('exercise_muscle_mapping_entries', 'id'),
      ('exercise_muscle_mapping_entries', 'mapping_set_id'),
      ('exercise_muscle_mapping_entries', 'muscle_id'),
      ('exercise_muscle_mapping_entries', 'role'),
      ('exercise_muscle_mapping_entries', 'contribution'),
      ('exercise_muscle_mapping_entries', 'side_scope'),
      ('exercise_muscle_mapping_entries', 'sort_order'),
      ('exercise_muscle_mapping_entries', 'created_at'),
      ('user_custom_exercise_mapping_sets', 'id'),
      ('user_custom_exercise_mapping_sets', 'user_id'),
      ('user_custom_exercise_mapping_sets', 'custom_exercise_id'),
      ('user_custom_exercise_mapping_sets', 'mapping_version'),
      ('user_custom_exercise_mapping_sets', 'status'),
      ('user_custom_exercise_mapping_sets', 'schema_version'),
      ('user_custom_exercise_mapping_sets', 'checksum'),
      ('user_custom_exercise_mapping_sets', 'published_at'),
      ('user_custom_exercise_mapping_sets', 'retired_at'),
      ('user_custom_exercise_mapping_sets', 'created_at'),
      ('user_custom_exercise_mapping_sets', 'updated_at'),
      ('user_custom_exercise_mapping_entries', 'id'),
      ('user_custom_exercise_mapping_entries', 'mapping_set_id'),
      ('user_custom_exercise_mapping_entries', 'muscle_id'),
      ('user_custom_exercise_mapping_entries', 'role'),
      ('user_custom_exercise_mapping_entries', 'contribution'),
      ('user_custom_exercise_mapping_entries', 'side_scope'),
      ('user_custom_exercise_mapping_entries', 'sort_order'),
      ('user_custom_exercise_mapping_entries', 'created_at')
    ) columns(table_name, column_name)
  loop
    if not exists (
      select 1 from information_schema.columns column_definition
      where column_definition.table_schema = 'public'
        and column_definition.table_name = required_column.table_name
        and column_definition.column_name = required_column.column_name
    ) then
      raise exception 'Missing Muscle Intelligence column: %.%', required_column.table_name, required_column.column_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conname = 'user_custom_exercise_mapping_sets_owner_fk'
      and conrelid = 'public.user_custom_exercise_mapping_sets'::regclass
      and confrelid = 'public.user_custom_exercises'::regclass
      and pg_get_constraintdef(oid) like '%FOREIGN KEY (custom_exercise_id, user_id)%'
  ) then
    raise exception 'Composite custom-exercise ownership FK is missing.';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'exercise_muscle_mapping_entries_muscle_check'
      and pg_get_constraintdef(oid) like '%tibialis_anterior%'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'user_custom_exercise_mapping_entries_role_contribution_check'
      and pg_get_constraintdef(oid) like '%stabilizer%'
  ) then
    raise exception 'Canonical muscle or role/contribution checks are missing.';
  end if;

  if to_regclass('public.exercise_muscle_mapping_sets_current_uidx') is null
     or to_regclass('public.user_custom_exercise_mapping_sets_current_uidx') is null
     or to_regclass('public.exercise_provider_links_provider_identity_key') is null then
    raise exception 'Required unique or partial indexes are missing.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'exercise_muscle_mapping_sets'
      and policyname = 'exercise_muscle_mapping_sets_member_read_published'
  ) or not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_custom_exercise_mapping_entries'
      and policyname = 'user_custom_exercise_mapping_entries_owner_all'
  ) then
    raise exception 'Required Muscle Intelligence policies are missing.';
  end if;

  foreach routine_oid in array array[
    to_regprocedure('public.publish_exercise_muscle_mapping_set(uuid)'),
    to_regprocedure('public.publish_user_custom_exercise_mapping_set(uuid)')
  ] loop
    if routine_oid is null then raise exception 'Required publication function is missing.'; end if;
    if not (select prosecdef from pg_proc where oid = routine_oid) then
      raise exception 'Publication function must be SECURITY DEFINER.';
    end if;
    if (select pg_get_userbyid(proowner) from pg_proc where oid = routine_oid) <> 'postgres' then
      raise exception 'Publication function owner is not postgres.';
    end if;
    select proconfig into routine_settings from pg_proc where oid = routine_oid;
    if coalesce(array_to_string(routine_settings, ','), '') not like '%search_path=%' then
      raise exception 'Publication function search_path is not hardened.';
    end if;
    if not has_function_privilege('authenticated', routine_oid, 'EXECUTE')
       or not has_function_privilege('service_role', routine_oid, 'EXECUTE')
       or has_function_privilege('anon', routine_oid, 'EXECUTE') then
      raise exception 'Publication function grants are incorrect.';
    end if;
    if exists (
      select 1
      from pg_proc routine
      cross join lateral aclexplode(coalesce(routine.proacl, acldefault('f', routine.proowner))) grant_acl
      where routine.oid = routine_oid and grant_acl.grantee = 0 and grant_acl.privilege_type = 'EXECUTE'
    ) then
      raise exception 'PUBLIC can execute a publication function.';
    end if;
  end loop;
end
$catalog$;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void language plpgsql as $assert$
begin
  if not coalesce(p_condition, false) then raise exception '%', p_message; end if;
end
$assert$;
grant execute on function pg_temp.assert_true(boolean, text) to authenticated;

create function pg_temp.assert_invalid_muscle_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'not_a_muscle', 'primary', 1.00, 90);
  exception when check_violation then return;
  end;
  raise exception 'Invalid canonical muscle unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_invalid_role_contribution_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'quadriceps', 'stabilizer', 0.25, 91);
  exception when check_violation then return;
  end;
  raise exception 'Invalid role contribution unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_duplicate_muscle_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'pectoralis_major', 'primary', 1.00, 92);
  exception when unique_violation then return;
  end;
  raise exception 'Duplicate muscle unexpectedly succeeded.';
end
$assert$;

create function pg_temp.assert_provider_duplicate_denied(p_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_provider_links(exercise_id, provider, provider_activity_id)
    values (p_exercise_id, 'manual_admin_link', 'verification-identity');
  exception when unique_violation then return;
  end;
  raise exception 'Provider identity pointed to two canonical exercises.';
end
$assert$;

create function pg_temp.assert_primary_required(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    perform public.publish_exercise_muscle_mapping_set(p_mapping_set_id);
  exception when check_violation then return;
  end;
  raise exception 'Publication without primary unexpectedly succeeded.';
end
$assert$;
grant execute on function pg_temp.assert_primary_required(uuid) to authenticated;

create function pg_temp.assert_member_global_write_denied(p_exercise_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.exercise_muscle_mapping_sets(exercise_id, mapping_version, source, schema_version, checksum)
    values (p_exercise_id, 99, 'member_attempt', 'exercise_muscle_mapping_v1', repeat('0', 64));
  exception when insufficient_privilege then return;
  end;
  raise exception 'Member global write unexpectedly succeeded.';
end
$assert$;
grant execute on function pg_temp.assert_member_global_write_denied(uuid) to authenticated;

create function pg_temp.assert_published_entry_immutable(p_entry_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    update public.exercise_muscle_mapping_entries set contribution = 0.75 where id = p_entry_id;
  exception when check_violation then return;
  end;
  raise exception 'Published global mapping entry mutation unexpectedly succeeded.';
end
$assert$;
grant execute on function pg_temp.assert_published_entry_immutable(uuid) to authenticated;

create function pg_temp.assert_cross_owner_fk(p_custom_exercise_id uuid, p_wrong_user_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.user_custom_exercise_mapping_sets(
      user_id, custom_exercise_id, mapping_version, schema_version, checksum
    ) values (p_wrong_user_id, p_custom_exercise_id, 88, 'exercise_muscle_mapping_v1', repeat('0', 64));
    set constraints user_custom_exercise_mapping_sets_owner_fk immediate;
  exception when foreign_key_violation then return;
  end;
  raise exception 'Composite custom ownership FK accepted a cross-owner target.';
end
$assert$;

create function pg_temp.assert_intruder_custom_insert_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
    values (p_mapping_set_id, 'quadriceps', 'primary', 1.00, 9);
  exception when insufficient_privilege then return;
  end;
  raise exception 'User A mutated User B custom mapping.';
end
$assert$;
grant execute on function pg_temp.assert_intruder_custom_insert_denied(uuid) to authenticated;

create function pg_temp.assert_intruder_custom_publish_denied(p_mapping_set_id uuid)
returns void language plpgsql as $assert$
begin
  begin
    perform public.publish_user_custom_exercise_mapping_set(p_mapping_set_id);
  exception when insufficient_privilege then return;
  end;
  raise exception 'User A published User B custom mapping.';
end
$assert$;
grant execute on function pg_temp.assert_intruder_custom_publish_denied(uuid) to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (:'user_a_id'::uuid, 'authenticated', 'authenticated', 'muscle-a@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'user_b_id'::uuid, 'authenticated', 'authenticated', 'muscle-b@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'admin_id'::uuid, 'authenticated', 'authenticated', 'muscle-admin@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
  (:'delete_id'::uuid, 'authenticated', 'authenticated', 'muscle-delete@example.invalid', '', '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
update public.profiles set role = 'admin' where id = :'admin_id'::uuid;

insert into public.exercises(source, source_id, name, slug, is_approved, is_global)
values ('manual', 'muscle-verification-approved', 'Verification Bench Press', 'verification-bench-press', true, true)
returning id as approved_exercise_id \gset
insert into public.exercises(source, source_id, name, slug, is_approved, is_global)
values ('manual', 'muscle-verification-unapproved', 'Verification Draft Exercise', 'verification-draft-exercise', false, true)
returning id as unapproved_exercise_id \gset

insert into public.exercise_provider_links(exercise_id, provider, provider_activity_id, verification_status)
values (:'approved_exercise_id'::uuid, 'manual_admin_link', 'verification-identity', 'uncertain');
select pg_temp.assert_provider_duplicate_denied(:'unapproved_exercise_id'::uuid);

insert into public.exercise_muscle_mapping_sets(
  exercise_id, mapping_version, source, schema_version, checksum
) values (
  :'approved_exercise_id'::uuid, 1, 'manual_review', 'exercise_muscle_mapping_v1', repeat('0', 64)
) returning id as global_v1_id \gset
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values
  (:'global_v1_id'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  (:'global_v1_id'::uuid, 'triceps_brachii', 'secondary', 0.50, 'bilateral', 2),
  (:'global_v1_id'::uuid, 'anterior_deltoid', 'secondary', 0.50, 'bilateral', 3);
select id as global_v1_entry_id
from public.exercise_muscle_mapping_entries
where mapping_set_id = :'global_v1_id'::uuid and muscle_id = 'pectoralis_major'
\gset
select pg_temp.assert_invalid_muscle_denied(:'global_v1_id'::uuid);
select pg_temp.assert_invalid_role_contribution_denied(:'global_v1_id'::uuid);
select pg_temp.assert_duplicate_muscle_denied(:'global_v1_id'::uuid);
update public.exercise_muscle_mapping_sets
set checksum = private.exercise_muscle_mapping_checksum(id)
where id = :'global_v1_id'::uuid;
select pg_temp.assert_true(
  private.exercise_muscle_mapping_checksum(:'global_v1_id'::uuid) = '225785506614451450a2969098d91173122f6c8cf82c80bc5c8377d1f5fabee2',
  'Database checksum does not match the TypeScript canonical checksum fixture.'
);

insert into public.exercise_muscle_mapping_sets(
  exercise_id, mapping_version, source, schema_version, checksum
) values (
  :'approved_exercise_id'::uuid, 2, 'manual_review', 'exercise_muscle_mapping_v1', repeat('0', 64)
) returning id as global_v2_id \gset
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values
  (:'global_v2_id'::uuid, 'pectoralis_major', 'primary', 1.00, 'bilateral', 1),
  (:'global_v2_id'::uuid, 'anterior_deltoid', 'secondary', 0.25, 'bilateral', 2),
  (:'global_v2_id'::uuid, 'triceps_brachii', 'stabilizer', 0.00, 'bilateral', 3);
update public.exercise_muscle_mapping_sets
set checksum = private.exercise_muscle_mapping_checksum(id)
where id = :'global_v2_id'::uuid;

insert into public.exercise_muscle_mapping_sets(
  exercise_id, mapping_version, source, schema_version, checksum
) values (
  :'unapproved_exercise_id'::uuid, 1, 'manual_review', 'exercise_muscle_mapping_v1', repeat('0', 64)
) returning id as no_primary_id \gset
insert into public.exercise_muscle_mapping_entries(mapping_set_id, muscle_id, role, contribution, side_scope, sort_order)
values (:'no_primary_id'::uuid, 'triceps_brachii', 'secondary', 0.50, 'bilateral', 1);
update public.exercise_muscle_mapping_sets
set checksum = private.exercise_muscle_mapping_checksum(id)
where id = :'no_primary_id'::uuid;

insert into public.user_custom_exercises(user_id, name)
values (:'user_a_id'::uuid, 'User A Custom') returning id as custom_a_id \gset
insert into public.user_custom_exercises(user_id, name)
values (:'user_b_id'::uuid, 'User B Custom') returning id as custom_b_id \gset
insert into public.user_custom_exercises(user_id, name)
values (:'delete_id'::uuid, 'Deletion Custom') returning id as custom_delete_id \gset

insert into public.user_custom_exercise_mapping_sets(user_id, custom_exercise_id, mapping_version, schema_version, checksum)
values (:'user_a_id'::uuid, :'custom_a_id'::uuid, 1, 'exercise_muscle_mapping_v1', repeat('0', 64))
returning id as custom_a_set_id \gset
insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
values (:'custom_a_set_id'::uuid, 'quadriceps', 'primary', 1.00, 1);
update public.user_custom_exercise_mapping_sets set checksum = private.user_custom_exercise_mapping_checksum(id)
where id = :'custom_a_set_id'::uuid;

insert into public.user_custom_exercise_mapping_sets(user_id, custom_exercise_id, mapping_version, schema_version, checksum)
values (:'user_b_id'::uuid, :'custom_b_id'::uuid, 1, 'exercise_muscle_mapping_v1', repeat('0', 64))
returning id as custom_b_set_id \gset
insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
values (:'custom_b_set_id'::uuid, 'hamstrings', 'primary', 1.00, 1);
update public.user_custom_exercise_mapping_sets set checksum = private.user_custom_exercise_mapping_checksum(id)
where id = :'custom_b_set_id'::uuid;

insert into public.user_custom_exercise_mapping_sets(user_id, custom_exercise_id, mapping_version, schema_version, checksum)
values (:'delete_id'::uuid, :'custom_delete_id'::uuid, 1, 'exercise_muscle_mapping_v1', repeat('0', 64))
returning id as custom_delete_set_id \gset
insert into public.user_custom_exercise_mapping_entries(mapping_set_id, muscle_id, role, contribution, sort_order)
values (:'custom_delete_set_id'::uuid, 'gluteus_maximus', 'primary', 1.00, 1);
update public.user_custom_exercise_mapping_sets set checksum = private.user_custom_exercise_mapping_checksum(id)
where id = :'custom_delete_set_id'::uuid;

select pg_temp.assert_cross_owner_fk(:'custom_b_id'::uuid, :'user_a_id'::uuid);

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_primary_required(:'no_primary_id'::uuid);
select public.publish_exercise_muscle_mapping_set(:'global_v1_id'::uuid);
select pg_temp.assert_published_entry_immutable(:'global_v1_entry_id'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_true(
  (select count(*) = 1 from public.exercise_muscle_mapping_sets where exercise_id = :'approved_exercise_id'::uuid),
  'Member global read boundary hid the approved published mapping.'
);
select pg_temp.assert_true(
  (select count(*) = 0 from public.exercise_provider_links),
  'Member read exposed provider-review aliases.'
);
select pg_temp.assert_member_global_write_denied(:'approved_exercise_id'::uuid);
select public.publish_user_custom_exercise_mapping_set(:'custom_a_set_id'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'delete_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.publish_user_custom_exercise_mapping_set(:'custom_delete_set_id'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_a_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select pg_temp.assert_true(
  (select count(*) = 0 from public.user_custom_exercise_mapping_sets where id = :'custom_b_set_id'::uuid),
  'User A read User B custom mapping.'
);
select pg_temp.assert_intruder_custom_insert_denied(:'custom_b_set_id'::uuid);
select pg_temp.assert_intruder_custom_publish_denied(:'custom_b_set_id'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'user_b_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.publish_user_custom_exercise_mapping_set(:'custom_b_set_id'::uuid);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', :'admin_id', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.publish_exercise_muscle_mapping_set(:'global_v2_id'::uuid);
select public.publish_exercise_muscle_mapping_set(:'global_v2_id'::uuid);
reset role;

select pg_temp.assert_true(
  (select count(*) = 1 from public.exercise_muscle_mapping_sets where exercise_id = :'approved_exercise_id'::uuid and status = 'published')
  and (select status = 'retired' from public.exercise_muscle_mapping_sets where id = :'global_v1_id'::uuid),
  'Atomic publication did not preserve exactly one current global mapping.'
);

delete from auth.users where id = :'delete_id'::uuid;
select pg_temp.assert_true(
  not exists (select 1 from public.user_custom_exercise_mapping_sets where id = :'custom_delete_set_id'::uuid)
  and not exists (select 1 from public.user_custom_exercise_mapping_entries where mapping_set_id = :'custom_delete_set_id'::uuid),
  'Account deletion did not remove user-owned custom mappings.'
);

rollback;
