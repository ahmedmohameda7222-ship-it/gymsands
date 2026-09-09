\set ON_ERROR_STOP on

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
grant execute on function pg_temp.plan6_p1_assert(boolean,text) to public;
grant execute on function pg_temp.plan6_p1_rejected(text,text) to public;

\set user_a '69000000-0000-4000-8000-000000000001'
\set user_b '69000000-0000-4000-8000-000000000002'
\set owner_principal '69000000-0000-4000-8000-000000000101'
\set personal_food '69000000-0000-4000-8000-000000000201'
\set merge_a '69000000-0000-4000-8000-000000000211'
\set merge_b '69000000-0000-4000-8000-000000000212'
\set merge_c '69000000-0000-4000-8000-000000000213'
\set source_withdrawn_target '69000000-0000-4000-8000-000000000214'
\set withdrawn_target '69000000-0000-4000-8000-000000000215'
\set source_deprecated_target '69000000-0000-4000-8000-000000000216'
\set deprecated_target '69000000-0000-4000-8000-000000000217'
\set replacement_source '69000000-0000-4000-8000-000000000218'
\set bad_replacement '69000000-0000-4000-8000-000000000219'

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
(:'user_a','authenticated','authenticated','plan6-p1-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'user_b','authenticated','authenticated','plan6-p1-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
(:'personal_food','Plan6 P1 personal',true,'active'),
(:'merge_a','Plan6 merge A',true,'active'),(:'merge_b','Plan6 merge B',true,'active'),(:'merge_c','Plan6 merge C',true,'active'),
(:'source_withdrawn_target','Plan6 merge withdrawn source',true,'active'),(:'withdrawn_target','Plan6 withdrawn target',true,'withdrawn'),
(:'source_deprecated_target','Plan6 merge deprecated source',true,'active'),(:'deprecated_target','Plan6 deprecated target',true,'deprecated'),
(:'replacement_source','Plan6 replacement source',true,'active'),(:'bad_replacement','Plan6 bad replacement',true,'withdrawn');

insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values
(:'owner_principal','human',:'user_a','owner');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
(:'owner_principal','food.correction.apply','five-p1'),
(:'owner_principal','food.identity.merge','five-p1'),
(:'owner_principal','food.lifecycle.withdraw','five-p1'),
(:'owner_principal','food.lifecycle.restore','five-p1');

-- P1-1: private Personal Override helpers are never an application-role mutation surface.
select pg_temp.plan6_p1_assert(
  not has_function_privilege('authenticated','private.food_catalog_personal_override_begin_operation(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','private.food_catalog_personal_override_finish_operation(uuid,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','private.food_catalog_personal_override_begin_operation(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','private.food_catalog_personal_override_finish_operation(uuid,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('public','private.food_catalog_personal_override_begin_operation(uuid,uuid,uuid,text,jsonb)','EXECUTE')
  and not has_function_privilege('public','private.food_catalog_personal_override_finish_operation(uuid,uuid,jsonb)','EXECUTE'),
  'private Personal Override helper EXECUTE is revoked from PUBLIC/application roles'
);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_begin_operation(%L::uuid,%L::uuid,%L::uuid,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000301',:'personal_food','set','{}'
),'User A cannot pre-seed User B Personal Override operation');
reset role;
select pg_temp.plan6_p1_assert(not exists(
  select 1 from public.food_personal_override_operations where user_id=:'user_b'::uuid and operation_id='69000000-0000-4000-8000-000000000301'
),'denied cross-user begin leaves no poisoned operation row');

insert into public.food_personal_override_operations(user_id,operation_id,food_id,command_name,semantic_checksum_sha256)
values(:'user_b','69000000-0000-4000-8000-000000000302',:'personal_food','set',repeat('a',64));
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_finish_operation(%L::uuid,%L::uuid,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000302','{"forged":true}'
),'User A cannot finish User B Personal Override operation');
reset role;
select pg_temp.plan6_p1_assert((select completed_at is null and result_json is null from public.food_personal_override_operations where user_id=:'user_b'::uuid and operation_id='69000000-0000-4000-8000-000000000302'),'denied cross-user finish cannot poison result');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_p1_rejected(format(
  'select private.food_catalog_personal_override_begin_operation(%L::uuid,%L::uuid,%L::uuid,%L,%L::jsonb)',
  :'user_b','69000000-0000-4000-8000-000000000303',:'personal_food','set','{}'
),'generic service_role cannot forge Personal Override operation');
reset role;

-- Active user public set/delete remains the only authenticated Personal Override mutation surface.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select (public.food_catalog_set_personal_override(
  '69000000-0000-4000-8000-000000000311',:'personal_food',null,0,
  '{"protein_g":42}'::jsonb,'1 bowl','own override'
))->>'revisionId' as own_revision \gset
select (public.food_catalog_delete_personal_override(
  '69000000-0000-4000-8000-000000000312',:'personal_food',:'own_revision'::uuid,1
))->>'revisionId' as own_tombstone \gset
reset role;
select pg_temp.plan6_p1_assert((select current_revision_id=:'own_tombstone'::uuid and pointer_revision=2 from public.food_personal_overrides where user_id=:'user_a'::uuid and food_id=:'personal_food'::uuid),'own public set/delete preserves user-scoped CAS');

-- P1-5: disabled/deletion-processing account fails before creating any operation-ledger row.
update public.account_access_states set state='deletion_processing',disabled_at=clock_timestamp() where user_id=:'user_b'::uuid;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_b',true);
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_set_personal_override(%L::uuid,%L::uuid,null,0,%L::jsonb,null,null)',
  '69000000-0000-4000-8000-000000000313',:'personal_food','{"protein_g":10}'
),'deletion_processing account cannot set Personal Override');
reset role;
select pg_temp.plan6_p1_assert(not exists(select 1 from public.food_personal_override_operations where user_id=:'user_b'::uuid and operation_id='69000000-0000-4000-8000-000000000313'),'disabled stale request cannot recreate only the operation ledger');

-- P1-4: duplicate topology rejects any non-active target.
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version) values
('69000000-0000-4000-8000-000000000401',:'source_withdrawn_target','duplicate_food','withdrawn target','p1|merge|withdrawn','approved',2,'plan6-v1'),
('69000000-0000-4000-8000-000000000402',:'source_deprecated_target','duplicate_food','deprecated target','p1|merge|deprecated','approved',2,'plan6-v1'),
('69000000-0000-4000-8000-000000000403',:'merge_a','duplicate_food','valid merge','p1|merge|valid','approved',2,'plan6-v1'),
('69000000-0000-4000-8000-000000000404',:'merge_b','duplicate_food','chain merge','p1|merge|chain','approved',2,'plan6-v1');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'user_a',true);
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_resolve_duplicate(%L::uuid,%L::uuid,%L::uuid,%L::uuid,2,0,null,%L)',
  '69000000-0000-4000-8000-000000000411','69000000-0000-4000-8000-000000000401',:'source_withdrawn_target',:'withdrawn_target','reject withdrawn survivor'
),'withdrawn duplicate target is not a canonical survivor');
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_resolve_duplicate(%L::uuid,%L::uuid,%L::uuid,%L::uuid,2,0,null,%L)',
  '69000000-0000-4000-8000-000000000412','69000000-0000-4000-8000-000000000402',:'source_deprecated_target',:'deprecated_target','reject deprecated survivor'
),'deprecated duplicate target is not a canonical survivor');
select public.food_catalog_resolve_duplicate(
  '69000000-0000-4000-8000-000000000413','69000000-0000-4000-8000-000000000403',:'merge_a',:'merge_b',2,0,null,'valid A to B'
);
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_resolve_duplicate(%L::uuid,%L::uuid,%L::uuid,%L::uuid,2,0,null,%L)',
  '69000000-0000-4000-8000-000000000414','69000000-0000-4000-8000-000000000404',:'merge_b',:'merge_c','reject redirect chain'
),'survivor with inbound redirect cannot later become merge source');
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_withdraw_food(%L::uuid,%L::uuid,%L,0,null,null,%L)',
  '69000000-0000-4000-8000-000000000415',:'merge_b','active','reject survivor withdrawal'
),'survivor with inbound redirect cannot be withdrawn');
select pg_temp.plan6_p1_rejected(format(
  'select public.food_catalog_withdraw_food(%L::uuid,%L::uuid,%L,0,null,%L::uuid,%L)',
  '69000000-0000-4000-8000-000000000416',:'replacement_source','active',:'bad_replacement','reject bad replacement'
),'withdraw replacement must be active unredirected canonical root');
reset role;
select pg_temp.plan6_p1_assert((select lifecycle_status='merged' and merged_into_food_id=:'merge_b'::uuid from public.food_items where id=:'merge_a'::uuid),'valid A to B merge remains accepted');
select pg_temp.plan6_p1_assert((select lifecycle_status='active' and merged_into_food_id is null from public.food_items where id=:'merge_b'::uuid),'valid survivor remains active unredirected canonical root');
select pg_temp.plan6_p1_assert(not exists(select 1 from public.food_items x join public.food_items y on y.id=x.merged_into_food_id where y.merged_into_food_id is not null),'fixture topology contains no redirect chain');

rollback;
