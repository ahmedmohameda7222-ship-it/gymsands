\set ON_ERROR_STOP on
\set user_a '69000000-0000-4000-8000-000000000001'
\set user_b '69000000-0000-4000-8000-000000000002'
\set principal_a '69000000-0000-4000-8000-000000000101'
\set food_override '69000000-0000-4000-8000-000000000201'
\set merge_a '69000000-0000-4000-8000-000000000211'
\set merge_b '69000000-0000-4000-8000-000000000212'
\set merge_c '69000000-0000-4000-8000-000000000213'
\set merge_bad '69000000-0000-4000-8000-000000000214'
\set merge_extra '69000000-0000-4000-8000-000000000215'

begin;

create or replace function pg_temp.plan6_p1_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then raise exception 'Plan 6 five-P1 assertion failed: %',p_message; end if;
end
$$;

create or replace function pg_temp.plan6_p1_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 five-P1 expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 6 five-P1 expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

-- P1-1: private Personal Override helpers are defense-in-depth caller-bound and not directly executable.
select pg_temp.plan6_p1_assert(to_regprocedure('private.food_catalog_personal_override_begin_operation(uuid,uuid,uuid,text,jsonb)') is not null,'personal override begin helper exists');
select pg_temp.plan6_p1_assert(to_regprocedure('private.food_catalog_personal_override_finish_operation(uuid,uuid,jsonb)') is not null,'personal override finish helper exists');

do $acl$
declare v_oid oid; v_role text;
begin
  foreach v_oid in array array[
    to_regprocedure('private.food_catalog_personal_override_begin_operation(uuid,uuid,uuid,text,jsonb)')::oid,
    to_regprocedure('private.food_catalog_personal_override_finish_operation(uuid,uuid,jsonb)')::oid,
    to_regprocedure('private.food_catalog_personal_override_require_writable_account(uuid)')::oid
  ] loop
    if v_oid is null then raise exception 'Plan 6 five-P1 private Personal Override helper is missing.'; end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,v_oid,'EXECUTE') then
        raise exception 'Plan 6 five-P1 private helper is executable by %: %',v_role,v_oid::regprocedure;
      end if;
    end loop;
    if exists(
      select 1 from pg_proc p
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
      where p.oid=v_oid and acl.grantee=0 and acl.privilege_type='EXECUTE'
    ) then
      raise exception 'Plan 6 five-P1 private helper retains PUBLIC EXECUTE: %',v_oid::regprocedure;
    end if;
  end loop;
end
$acl$;

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  (:'user_a','authenticated','authenticated','plan6-five-p1-a@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  (:'user_b','authenticated','authenticated','plan6-five-p1-b@example.invalid','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
  (:'food_override','Plan 6 override fixture',true,'active'),
  (:'merge_a','Plan 6 merge A',true,'active'),
  (:'merge_b','Plan 6 merge B',true,'active'),
  (:'merge_c','Plan 6 merge C',true,'active'),
  (:'merge_bad','Plan 6 merge bad',true,'withdrawn'),
  (:'merge_extra','Plan 6 merge extra',true,'active');

-- Active account: public user-owned set/delete path remains functional.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select (public.food_catalog_set_personal_override(
  '69000000-0000-4000-8000-000000000301',:'food_override',null,0,
  '{"calories":123,"protein_g":null}'::jsonb,'1 serving','five-P1 active account'
))->>'revisionId' as override_revision \gset
select (public.food_catalog_set_personal_override(
  '69000000-0000-4000-8000-000000000302',:'food_override',:'override_revision',1,
  '{"calories":124}'::jsonb,'1 serving','five-P1 second revision'
))->>'revisionId' as override_revision_2 \gset
select public.food_catalog_delete_personal_override(
  '69000000-0000-4000-8000-000000000303',:'food_override',:'override_revision_2',2
);

-- Direct application-role execution cannot act for another user.
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_begin_operation(%L,%L,%L,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000304',:'food_override','set','{}'
),'authenticated caller cannot directly begin another user operation');
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_finish_operation(%L,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000304','{}'
),'authenticated caller cannot directly finish another user operation');
reset role;

-- Even a function owner/superuser-style direct invocation is fail-closed on auth.uid mismatch.
select set_config('request.jwt.claim.sub',:'user_a',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_begin_operation(%L,%L,%L,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000305',:'food_override','set','{}'
),'private begin helper rejects supplied user mismatch internally');
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_finish_operation(%L,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000305','{}'
),'private finish helper rejects supplied user mismatch internally');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_begin_operation(%L,%L,%L,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000306',:'food_override','set','{}'
),'generic service_role cannot forge Personal Override operation');
reset role;

-- P1-5: deletion lifecycle blocks set/delete before any operation-ledger creation.
update public.account_access_states set state='deletion_processing',reason_code='five-p1-verifier',disabled_at=clock_timestamp(),updated_at=clock_timestamp() where user_id=:'user_a';
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_set_personal_override(%L,%L,null,0,%L::jsonb,null,null)',
  '69000000-0000-4000-8000-000000000307',:'food_override','{"calories":1}'
),'deletion_processing blocks Personal Override set');
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_delete_personal_override(%L,%L,%L,3)',
  '69000000-0000-4000-8000-000000000308',:'food_override',:'override_revision_2'
),'deletion_processing blocks Personal Override delete');
reset role;
select pg_temp.plan6_p1_assert(not exists(select 1 from public.food_personal_override_operations where user_id=:'user_a' and operation_id in ('69000000-0000-4000-8000-000000000307','69000000-0000-4000-8000-000000000308')),'blocked privacy writes create no operation-ledger rows');
update public.account_access_states set state='active',reason_code=null,disabled_at=null,updated_at=clock_timestamp() where user_id=:'user_a';

-- Governance actor for duplicate/lifecycle hardening.
insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
  (:'principal_a','human',:'user_a','owner');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
  (:'principal_a','food.correction.apply','five-p1-verifier'),
  (:'principal_a','food.identity.merge','five-p1-verifier'),
  (:'principal_a','food.lifecycle.withdraw','five-p1-verifier'),
  (:'principal_a','food.lifecycle.restore','five-p1-verifier');

insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version) values
 ('69000000-0000-4000-8000-000000000401',:'merge_extra','duplicate_food','bad-target','five-p1|merge|bad-target','approved',2,'plan6-v1'),
 ('69000000-0000-4000-8000-000000000402',:'merge_a','duplicate_food','valid-target','five-p1|merge|valid-target','approved',2,'plan6-v1'),
 ('69000000-0000-4000-8000-000000000403',:'merge_b','duplicate_food','chain-target','five-p1|merge|chain-target','approved',2,'plan6-v1');

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);

-- P1-4A: target must be active and unredirected.
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_resolve_duplicate(%L,%L,%L,%L,2,0,null,%L)',
  '69000000-0000-4000-8000-000000000411','69000000-0000-4000-8000-000000000401',:'merge_extra',:'merge_bad','reject non-active target'
),'merge to withdrawn target rejected');

-- P1-4E: a valid direct merge remains accepted.
select public.food_catalog_resolve_duplicate(
  '69000000-0000-4000-8000-000000000412','69000000-0000-4000-8000-000000000402',
  :'merge_a',:'merge_b',2,0,null,'valid direct merge'
);

-- P1-4C: a current survivor with inbound redirects cannot become a merge source.
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_resolve_duplicate(%L,%L,%L,%L,2,0,null,%L)',
  '69000000-0000-4000-8000-000000000413','69000000-0000-4000-8000-000000000403',:'merge_b',:'merge_c','reject redirect chain'
),'survivor with inbound redirect cannot become merge source');

-- P1-4D: current survivor cannot be withdrawn while inbound redirects point to it.
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_withdraw_food(%L,%L,%L,0,null,null,%L,null)',
  '69000000-0000-4000-8000-000000000414',:'merge_b','active','reject survivor withdrawal'
),'survivor with inbound redirects cannot be withdrawn');

-- Replacement authority is an active, unredirected canonical root.
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_withdraw_food(%L,%L,%L,0,null,%L,%L,null)',
  '69000000-0000-4000-8000-000000000415',:'merge_extra','active',:'merge_bad','reject invalid replacement'
),'withdraw replacement must be active unredirected root');
reset role;

select pg_temp.plan6_p1_assert((select lifecycle_status='merged' and merged_into_food_id=:'merge_b'::uuid from public.food_items where id=:'merge_a'),'valid merge points directly to active survivor');
select pg_temp.plan6_p1_assert((select lifecycle_status='active' and merged_into_food_id is null from public.food_items where id=:'merge_b'),'survivor stays active and unredirected');
select pg_temp.plan6_p1_assert(not exists(
  select 1 from public.food_items source
  join public.food_items target on target.id=source.merged_into_food_id
  where source.merged_into_food_id is not null and (target.lifecycle_status<>'active' or target.merged_into_food_id is not null)
),'resulting identity topology remains Plan-3-flat compatible');

rollback;
