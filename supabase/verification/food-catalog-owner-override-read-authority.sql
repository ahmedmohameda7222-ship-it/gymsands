\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.owner_override_read_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 7 owner override read authority assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.owner_override_read_expect_sqlstate(
  p_sql text,p_expected_sqlstate text,p_message text
)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 7 owner override read authority expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 7 owner override read authority expected rejection did not occur:%' then raise; end if;
    if sqlstate is distinct from p_expected_sqlstate then
      raise exception 'Plan 7 owner override read authority rejection had SQLSTATE %, expected %: %',
        sqlstate,p_expected_sqlstate,p_message;
    end if;
  end;
end
$$;

grant execute on function pg_temp.owner_override_read_assert(boolean,text) to public;
grant execute on function pg_temp.owner_override_read_expect_sqlstate(text,text,text) to public;

select pg_temp.owner_override_read_assert(
  to_regprocedure('public.food_catalog_get_current_personal_override_v1(uuid)') is not null,
  'runtime RPC is missing'
);
select pg_temp.owner_override_read_assert(
  (
    select count(*)=1
      and bool_and(p.pronargs=1)
      and bool_and(pg_get_function_identity_arguments(p.oid)='p_food_id uuid')
      and bool_and(pg_get_function_result(p.oid)='jsonb')
      and bool_and(p.prosecdef)
      and bool_and(p.proconfig is not distinct from array['search_path=""']::text[])
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='food_catalog_get_current_personal_override_v1'
  ),
  'RPC signature/security/search_path contract drifted'
);
select pg_temp.owner_override_read_assert(
  has_function_privilege('authenticated','public.food_catalog_get_current_personal_override_v1(uuid)','EXECUTE'),
  'authenticated must have RPC EXECUTE'
);
select pg_temp.owner_override_read_assert(
  not has_function_privilege('anon','public.food_catalog_get_current_personal_override_v1(uuid)','EXECUTE'),
  'anon unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_override_read_assert(
  not has_function_privilege('service_role','public.food_catalog_get_current_personal_override_v1(uuid)','EXECUTE'),
  'service_role unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_override_read_assert(
  not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where n.nspname='public'
      and p.proname='food_catalog_get_current_personal_override_v1'
      and p.pronargs=1
      and acl.grantee=0
      and acl.privilege_type='EXECUTE'
  ),
  'PUBLIC unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_override_read_assert(
  not has_table_privilege('authenticated','public.food_personal_override_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.food_personal_override_revisions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated','public.food_personal_overrides','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.food_personal_overrides','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('authenticated','public.food_personal_override_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  and not has_table_privilege('service_role','public.food_personal_override_operations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),
  'authenticated/service_role direct Personal Override table authority widened'
);
select pg_temp.owner_override_read_assert(
  (
    select position('auth.uid()' in pg_get_functiondef(p.oid))>0
      and position('private.food_catalog_get_current_personal_override_for_owner_v1' in pg_get_functiondef(p.oid))>0
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='food_catalog_get_current_personal_override_v1'
      and p.pronargs=1
  )
  and (
    select position('public.food_personal_overrides pointer' in pg_get_functiondef(p.oid))>0
      and position('public.food_personal_override_revisions revision' in pg_get_functiondef(p.oid))>0
      and position('revision.id = pointer.current_revision_id' in pg_get_functiondef(p.oid))>0
      and position('pointer.user_id = p_user_id' in pg_get_functiondef(p.oid))>0
      and position('pointer.food_id = p_food_id' in pg_get_functiondef(p.oid))>0
      and position('food_catalog_export_owner_personal_overrides_v1' in pg_get_functiondef(p.oid))=0
      and position('ORDER BY' in upper(pg_get_functiondef(p.oid)))=0
      and position('MAX(' in upper(pg_get_functiondef(p.oid)))=0
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and p.proname='food_catalog_get_current_personal_override_for_owner_v1'
      and p.pronargs=2
  ),
  'RPC/shared owner core escaped exact pointer/current-owner read contract'
);

\set owner_a '72000000-0000-4000-8000-000000000001'
\set owner_b '72000000-0000-4000-8000-000000000002'
\set owner_inactive '72000000-0000-4000-8000-000000000003'
\set food_a '72000000-0000-4000-8000-000000000101'
\set food_b '72000000-0000-4000-8000-000000000102'
\set food_none '72000000-0000-4000-8000-000000000103'
\set a_food_a_rev1 '72000000-0000-4000-8000-000000000201'
\set a_food_a_rev2 '72000000-0000-4000-8000-000000000202'
\set b_food_a_rev1 '72000000-0000-4000-8000-000000000203'
\set a_food_b_rev1 '72000000-0000-4000-8000-000000000204'
\set a_food_b_tombstone '72000000-0000-4000-8000-000000000205'
\set missing_revision '72000000-0000-4000-8000-000000000299'

insert into auth.users(
  id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
(:'owner_a','authenticated','authenticated','plan7-owner-read-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_b','authenticated','authenticated','plan7-owner-read-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_inactive','authenticated','authenticated','plan7-owner-read-inactive@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.account_access_states(user_id,state,reason_code,disabled_at) values
(:'owner_a','active','plan7-owner-read-fixture',null),
(:'owner_b','active','plan7-owner-read-fixture',null),
(:'owner_inactive','disabled','plan7-owner-read-fixture',clock_timestamp())
on conflict(user_id) do update
set state=excluded.state,reason_code=excluded.reason_code,disabled_at=excluded.disabled_at,updated_at=clock_timestamp();

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
(:'food_a','Plan 7 owner read fixture A',true,'active'),
(:'food_b','Plan 7 owner read fixture B',true,'active'),
(:'food_none','Plan 7 owner read fixture none',true,'active');

insert into public.food_personal_override_revisions(
  id,user_id,food_id,revision_number,supersedes_revision_id,nutrition_override,serving_label,note,is_deleted,created_at
) values
(:'a_food_a_rev1',:'owner_a',:'food_a',1,null,'{"calories":0,"protein_g":null}'::jsonb,'Older exact serving','Older exact note',false,'2026-09-19 03:40:00+00'),
(:'a_food_a_rev2',:'owner_a',:'food_a',2,:'a_food_a_rev1','{"calories":999}'::jsonb,'Newer unpointed serving','Newer unpointed note',false,'2026-09-19 03:41:00+00'),
(:'b_food_a_rev1',:'owner_b',:'food_a',1,null,'{"calories":222}'::jsonb,'Owner B serving','Owner B note',false,'2026-09-19 03:42:00+00'),
(:'a_food_b_rev1',:'owner_a',:'food_b',1,null,'{"protein_g":5}'::jsonb,'Food B serving','Food B note',false,'2026-09-19 03:43:00+00'),
(:'a_food_b_tombstone',:'owner_a',:'food_b',2,:'a_food_b_rev1',null,null,null,true,'2026-09-19 03:44:00+00');

insert into public.food_personal_overrides(
  user_id,food_id,current_revision_id,pointer_revision,updated_at
) values
(:'owner_a',:'food_a',:'a_food_a_rev1',1,'2026-09-19 03:44:10+00'),
(:'owner_b',:'food_a',:'b_food_a_rev1',1,'2026-09-19 03:44:20+00'),
(:'owner_a',:'food_b',:'a_food_b_tombstone',2,'2026-09-19 03:44:30+00');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '42501','authenticated caller without auth.uid()'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_inactive',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '42501','inactive owner account'
);
reset role;

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '42501','anon RPC execution'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '42501','service_role RPC execution'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);

select public.food_catalog_get_current_personal_override_v1(:'food_none') as no_override \gset
select pg_temp.owner_override_read_assert(
  (:'no_override'::jsonb->>'foodId')::uuid=:'food_none'::uuid
  and (:'no_override'::jsonb->>'hasOverride')::boolean=false
  and :'no_override'::jsonb->'revisionId'='null'::jsonb
  and (:'no_override'::jsonb->>'pointerRevision')::bigint=0
  and (:'no_override'::jsonb->>'isDeleted')::boolean=false
  and :'no_override'::jsonb->'nutritionOverride'='null'::jsonb
  and :'no_override'::jsonb->'servingLabel'='null'::jsonb
  and :'no_override'::jsonb->'note'='null'::jsonb,
  'no-pointer result contract drifted'
);

select public.food_catalog_get_current_personal_override_v1(:'food_a') as owner_a_food_a \gset
select pg_temp.owner_override_read_assert(
  (:'owner_a_food_a'::jsonb->>'revisionId')::uuid=:'a_food_a_rev1'::uuid
  and (:'owner_a_food_a'::jsonb->>'revisionId')::uuid<>:'a_food_a_rev2'::uuid
  and (:'owner_a_food_a'::jsonb->>'revisionId')::uuid<>:'b_food_a_rev1'::uuid
  and (:'owner_a_food_a'::jsonb->>'pointerRevision')::bigint=1
  and (:'owner_a_food_a'::jsonb->>'hasOverride')::boolean=true
  and (:'owner_a_food_a'::jsonb->>'isDeleted')::boolean=false
  and :'owner_a_food_a'::jsonb->'nutritionOverride'->'calories'='0'::jsonb
  and :'owner_a_food_a'::jsonb->'nutritionOverride'->'protein_g'='null'::jsonb
  and :'owner_a_food_a'::jsonb->>'servingLabel'='Older exact serving'
  and :'owner_a_food_a'::jsonb->>'note'='Older exact note',
  'exact pointed older revision/NULL-versus-zero contract drifted'
);

select public.food_catalog_get_current_personal_override_v1(:'food_b') as owner_a_food_b \gset
select pg_temp.owner_override_read_assert(
  (:'owner_a_food_b'::jsonb->>'revisionId')::uuid=:'a_food_b_tombstone'::uuid
  and (:'owner_a_food_b'::jsonb->>'pointerRevision')::bigint=2
  and (:'owner_a_food_b'::jsonb->>'hasOverride')::boolean=true
  and (:'owner_a_food_b'::jsonb->>'isDeleted')::boolean=true,
  'tombstone identity was not preserved'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_b',true);
select public.food_catalog_get_current_personal_override_v1(:'food_a') as owner_b_food_a \gset
select pg_temp.owner_override_read_assert(
  (:'owner_b_food_a'::jsonb->>'revisionId')::uuid=:'b_food_a_rev1'::uuid
  and (:'owner_b_food_a'::jsonb->>'revisionId')::uuid<>:'a_food_a_rev1'::uuid,
  'cross-owner Personal Override state leaked'
);
select public.food_catalog_get_current_personal_override_v1(:'food_b') as owner_b_food_b \gset
select pg_temp.owner_override_read_assert(
  (:'owner_b_food_b'::jsonb->>'hasOverride')::boolean=false,
  'different-Food/owner pointer leaked'
);
reset role;

update public.food_personal_overrides
set current_revision_id=:'b_food_a_rev1',pointer_revision=1
where user_id=:'owner_a' and food_id=:'food_a';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '23514','cross-owner current revision pointer'
);
reset role;

update public.food_personal_overrides
set current_revision_id=:'a_food_b_rev1',pointer_revision=1
where user_id=:'owner_a' and food_id=:'food_a';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '23514','cross-Food current revision pointer'
);
reset role;

update public.food_personal_overrides
set current_revision_id=:'a_food_a_rev1',pointer_revision=2
where user_id=:'owner_a' and food_id=:'food_a';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '23514','pointer revision / revision number disagreement'
);
reset role;

alter table public.food_personal_overrides
  drop constraint food_personal_overrides_current_revision_id_fkey;
update public.food_personal_overrides
set current_revision_id=:'missing_revision',pointer_revision=1
where user_id=:'owner_a' and food_id=:'food_a';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_override_read_expect_sqlstate(
  format('select public.food_catalog_get_current_personal_override_v1(%L::uuid)',:'food_a'),
  '23514','missing referenced revision'
);
reset role;

rollback;
