\set ON_ERROR_STOP on
\set owner_id '66000000-0000-4000-8000-000000000001'
\set curator_id '66000000-0000-4000-8000-000000000002'
\set member_id '66000000-0000-4000-8000-000000000003'
\set other_id '66000000-0000-4000-8000-000000000004'
\set food_a '66000000-0000-4000-8000-000000000101'
\set food_b '66000000-0000-4000-8000-000000000102'
\set lifecycle_food '66000000-0000-4000-8000-000000000103'
\set owner_principal '66000000-0000-4000-8000-000000000301'
\set curator_principal '66000000-0000-4000-8000-000000000302'
\set service_principal '66000000-0000-4000-8000-000000000303'
\set foreign_source '66000000-0000-4000-8000-000000000201'

begin;

-- P1-F2 live-identity compatibility fixtures for legacy governance actors.
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
  (:'owner_id'::uuid,'authenticated','authenticated','plan6-owner@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  (:'curator_id'::uuid,'authenticated','authenticated','plan6-curator@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('66000000-0000-4000-8000-000000000099'::uuid,'authenticated','authenticated','plan6-provisioned-curator@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now());

-- Food Catalog Plan 6 disposable rollback-only verification. No fixture survives.
create or replace function pg_temp.plan6_assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 6 assertion failed: %', p_message;
  end if;
end
$$;
create or replace function pg_temp.plan6_rejected(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 expected rejection did not occur: %', p_message;
  exception when others then
    if sqlerrm like 'Plan 6 expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

-- Structural authority / ACL exit gate.
select pg_temp.plan6_assert(
  to_regclass('public.food_catalog_governance_principals') is not null
  and to_regclass('public.food_catalog_governance_capability_assignments') is not null
  and to_regclass('public.food_catalog_correction_cases') is not null
  and to_regclass('public.food_catalog_correction_evidence') is not null
  and to_regclass('public.food_catalog_service_proposals') is not null
  and to_regclass('public.food_catalog_governance_operations') is not null
  and to_regclass('public.food_catalog_governance_audit_events') is not null
  and to_regclass('public.food_catalog_governance_outbox') is not null
  and to_regclass('public.food_catalog_governance_lifecycle_events') is not null
  and to_regclass('public.food_personal_override_revisions') is not null
  and to_regclass('public.food_personal_overrides') is not null,
  'required governance relations exist'
);
select pg_temp.plan6_assert(not exists(
  select 1 from pg_policies where schemaname='public' and tablename='food_items' and policyname='food_items_admin_all'
),'legacy food_items_admin_all policy retired');
with guarded(table_name) as (values
  ('food_items'),('food_nutrition_revisions'),('food_serving_options'),('food_names'),('food_barcodes'),
  ('food_taxonomy_assignments'),('food_market_assignments'),('food_merge_events')
)
select pg_temp.plan6_assert(bool_and(
  not has_table_privilege('anon','public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('authenticated','public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('service_role','public.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE')
),'canonical direct DML/TRUNCATE denied to anon/authenticated/service_role') from guarded;
select pg_temp.plan6_assert(
  has_function_privilege('service_role','public.food_catalog_ingestion_prepare_execution_v2(jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.food_catalog_promote_generation_v1(jsonb)','EXECUTE'),
  'existing Plan 3 and Plan 4 privileged RPCs preserved'
);
select pg_temp.plan6_assert(
  not has_table_privilege('service_role','public.food_catalog_current_generation','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('service_role','public.food_catalog_generations','INSERT,UPDATE,DELETE,TRUNCATE')
  and not has_table_privilege('service_role','public.food_catalog_search_documents','INSERT,UPDATE,DELETE,TRUNCATE'),
  'Plan 3 current/generation and Plan 5 derived-search authority remain locked'
);

do $private_acl$
declare r record;
begin
  for r in
    select p.oid as function_oid, p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private'
      and (
        p.proname like 'food_catalog_governance_%'
        or p.proname in ('food_catalog_change_lifecycle','reject_food_catalog_governance_immutable_mutation')
      )
  loop
    perform pg_temp.plan6_assert(
      not has_function_privilege('anon',r.function_oid,'EXECUTE')
      and not has_function_privilege('authenticated',r.function_oid,'EXECUTE')
      and not has_function_privilege('service_role',r.function_oid,'EXECUTE'),
      'Plan 6 private helper executable by application role: '||r.signature::text
    );
  end loop;
end
$private_acl$;

-- Database-owner fixtures. Runtime application roles cannot perform these direct inserts.
-- The ordinary member is also a real Auth user because Personal Override writes are gated by canonical account lifecycle state.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  :'member_id'::uuid, 'authenticated', 'authenticated', 'plan6-member@example.test', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
select pg_temp.plan6_assert(
  exists(select 1 from public.profiles where id=:'member_id'::uuid)
  and exists(select 1 from public.account_access_states where user_id=:'member_id'::uuid and state='active' and disabled_at is null),
  'Plan 6 member Auth fixture did not create canonical profile/access state'
);

-- The disposable purge owner is a real Auth user so the canonical privacy lifecycle can be exercised without bypasses.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  :'other_id'::uuid, 'authenticated', 'authenticated', 'plan6-purge-owner@example.test', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
select pg_temp.plan6_assert(
  exists(select 1 from public.profiles where id=:'other_id'::uuid)
  and exists(select 1 from public.account_access_states where user_id=:'other_id'::uuid and state='active'),
  'Plan 6 purge owner Auth fixture did not create canonical profile/access state'
);

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
  (:'food_a','Plan 6 Fixture A',true,'active'),
  (:'food_b','Plan 6 Fixture B',true,'active'),
  (:'lifecycle_food','Plan 6 Lifecycle Fixture',true,'active');
insert into public.food_source_records(id,food_id,provider,source_record_id,license_name,source_reference)
values(:'foreign_source',:'food_b','plan6-verifier','foreign-source','Verifier License','fixture://foreign');
insert into public.food_catalog_governance_principals(id,principal_type,subject_id,service_identity_sha256,role_class) values
  (:'owner_principal','human',:'owner_id',null,'owner'),
  (:'curator_principal','human',:'curator_id',null,'curator'),
  (:'service_principal','service','plan6-verifier-service',encode(extensions.digest(convert_to('plan6-verifier-service-identity','UTF8'),'sha256'),'hex'),'service');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
select :'owner_principal',capability,'plan6-verifier-owner' from unnest(array[
 'food.governance.manage_principals','food.correction.report','food.correction.review','food.correction.approve','food.correction.apply',
 'food.evidence.attach','food.nutrition.correct','food.serving.correct','food.name.correct','food.barcode.correct',
 'food.taxonomy.correct','food.market.correct','food.identity.merge','food.lifecycle.withdraw','food.lifecycle.restore','food.break_glass',
 'food.personal_override.write','food.observability.read'
]) capability;
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
select :'curator_principal',capability,'plan6-verifier-curator' from unnest(array['food.correction.report','food.correction.review','food.evidence.attach']) capability;
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
select :'service_principal',capability,'plan6-verifier-service' from unnest(array['food.correction.report','food.evidence.attach','food.ingestion.propose','food.outbox.deliver']) capability;

-- Member can report but cannot mutate global authority directly.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.plan6_rejected(format('update public.food_items set food_name=%L where id=%L','hijack',:'food_a'),'authenticated member direct Food update denied');
select pg_temp.plan6_rejected('truncate table public.food_items','authenticated member TRUNCATE denied');
select (public.food_catalog_report_correction(:'food_a','other','member-observation','Member report only',jsonb_build_object('note','bounded'),'plan6-v1'))->>'caseId' as member_case \gset
reset role;
select pg_temp.plan6_assert((select count(*)=1 from public.food_catalog_correction_reports where case_id=:'member_case'),'member report persisted as report/case evidence');
select pg_temp.plan6_assert((select food_name='Plan 6 Fixture A' from public.food_items where id=:'food_a'),'member report changed zero canonical Food facts');

-- Service-role bypass/escalation is denied while Plan 4 service RPC remains executable.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','plan6-verifier-service-identity')::text,true);
-- Service principal proposal: constrained adapter evidence, never approval/application authority.
select (public.food_catalog_service_propose_correction(
 '66000000-0000-4000-8000-000000000408',:'service_principal',:'food_a','other','adapter:proposal','Provider adapter proposal',
 jsonb_build_object('sourceClass','fixture'),'plan6-v1','adapter proposal'
))->>'proposalId' as service_proposal \gset
select public.food_catalog_service_propose_correction(
 '66000000-0000-4000-8000-000000000408',:'service_principal',:'food_a','other','adapter:proposal','Provider adapter proposal',
 jsonb_build_object('sourceClass','fixture'),'plan6-v1','adapter proposal'
);
select pg_temp.plan6_rejected(format('insert into public.food_catalog_service_proposals(operation_id,principal_id,food_id,category,claim_key,description,policy_version) values(%L,%L,%L,%L,%L,%L,%L)',
 '66000000-0000-4000-8000-000000000409',:'service_principal',:'food_a','other','direct','direct bypass','plan6-v1'),'service_role cannot directly insert Service proposal rows');
select pg_temp.plan6_rejected(format('update public.food_items set food_name=%L where id=%L','service-hijack',:'food_a'),'service_role direct Food update denied');
select pg_temp.plan6_rejected(format('insert into public.food_nutrition_revisions(food_id,revision_number,basis_amount,basis_unit,nutrient_mapping_version) values(%L,1,100,%L,%L)',:'food_a','g','bad'),'service_role direct canonical fact insert denied');
select pg_temp.plan6_rejected(format('select public.food_catalog_manage_governance_principal(%L,%L,%L,%L,array[%L]::text[],%L)',
 '66000000-0000-4000-8000-000000000401','service','evil-service','service','food.correction.approve','escalate'),'service-role human governance RPC denied');
reset role;
select pg_temp.plan6_assert((select count(*)=1 from public.food_catalog_service_proposals where id=:'service_proposal' and principal_id=:'service_principal' and food_id=:'food_a'),'Service principal proposal persisted exactly once');
select pg_temp.plan6_assert((select replay_count=1 from public.food_catalog_governance_operations where operation_id='66000000-0000-4000-8000-000000000408'),'Service principal proposal exact replay is idempotent');
select pg_temp.plan6_assert(exists(select 1 from public.food_catalog_governance_audit_events where operation_id='66000000-0000-4000-8000-000000000408' and capability='food.ingestion.propose'),'Service principal proposal emitted immutable audit evidence');
select pg_temp.plan6_assert(exists(select 1 from public.food_catalog_governance_outbox where operation_id='66000000-0000-4000-8000-000000000408'),'Service principal proposal emitted transactional outbox evidence');
select pg_temp.plan6_assert((select food_name='Plan 6 Fixture A' and lifecycle_status='active' from public.food_items where id=:'food_a'),'Service principal proposal changed zero canonical Food truth');
select pg_temp.plan6_assert(
  exists(select 1 from public.food_catalog_governance_capability_assignments where principal_id=:'service_principal' and capability='food.ingestion.propose' and revoked_at is null)
  and not exists(select 1 from public.food_catalog_governance_capability_assignments where principal_id=:'service_principal' and capability in ('food.correction.approve','food.correction.apply','food.nutrition.correct','food.identity.merge') and revoked_at is null),
  'Service principal cannot approve or apply canonical governance work'
);
select pg_temp.plan6_assert(not has_function_privilege('service_role','public.food_catalog_transition_correction_case(uuid,uuid,text,bigint,text,text,text,text,bigint,uuid)','EXECUTE'),'Service principal cannot approve through human transition RPC');

-- Owner-only provisioning proves future human capability assignments require no code/schema change.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_manage_governance_principal(
 '66000000-0000-4000-8000-000000000402','human','66000000-0000-4000-8000-000000000099','curator',array['food.correction.review'],'provision curator'
))->>'principalId' as provisioned_principal \gset
select pg_temp.plan6_rejected($$select public.food_catalog_manage_governance_principal('66000000-0000-4000-8000-000000000403','service','bad-service','service',array['food.correction.approve'],'bad')$$,'Owner cannot grant Service escalation capability');
reset role;
select pg_temp.plan6_assert(exists(select 1 from public.food_catalog_governance_capability_assignments where principal_id=:'provisioned_principal' and capability='food.correction.review' and revoked_at is null),'future Curator provisioned with exact capability');

-- Required evidence: wrong nutrition cannot approve without evidence; foreign source evidence fails closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_report_correction(:'food_a','wrong_nutrition','nutrition:label','Wrong label','{}'::jsonb,'plan6-v1'))->>'caseId' as required_case \gset
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000410',:'required_case','reported',0,'under_review','review required evidence');
select pg_temp.plan6_rejected(format(
 'select public.food_catalog_transition_correction_case(%L,%L,%L,1,%L,%L,%L,%L,0,null)',
 '66000000-0000-4000-8000-000000000411',:'required_case','under_review','approved','missing evidence','nutrition_revision',''
),'required evidence missing at approval');
select pg_temp.plan6_rejected(format(
 'select public.food_catalog_attach_correction_evidence(%L,%L,%L,%L,null,%L)',
 '66000000-0000-4000-8000-000000000412',:'required_case','source_record',:'foreign_source','foreign evidence'
),'foreign source evidence denied');
-- Add allowed same-case inspectable evidence, proving category-specific policy can proceed.
select public.food_catalog_attach_correction_evidence('66000000-0000-4000-8000-000000000414',:'required_case','product_label',null,'label-photo:fixture','label evidence');
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000415',:'required_case','under_review',1,'approved','approve with evidence','nutrition_revision','',0,null);
reset role;
select pg_temp.plan6_assert((select policy_version='plan6-v1' from public.food_catalog_correction_cases where id=:'required_case'),'historical correction policy version frozen');

-- Invalid transition shortcut rejected.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_report_correction(:'food_a','other','invalid-transition','Invalid transition','{}'::jsonb,'plan6-v1'))->>'caseId' as invalid_case \gset
select pg_temp.plan6_rejected(format(
 'select public.food_catalog_transition_correction_case(%L,%L,%L,0,%L,%L)',
 '66000000-0000-4000-8000-000000000413',:'invalid_case','reported','applied','skip states'
),'reported cannot skip directly to applied');

-- Missing nutrition needs no evidence; apply is append-only, nullable, CAS-bound and does not fabricate serving.
select (public.food_catalog_report_correction(:'food_a','missing_nutrition','nutrition:missing','Nutrition missing','{}'::jsonb,'plan6-v1'))->>'caseId' as missing_case \gset
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000420',:'missing_case','reported',0,'under_review','review missing nutrition');
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000421',:'missing_case','under_review',1,'approved','approve missing nutrition','nutrition_revision','',0,null);
select (public.food_catalog_apply_nutrition_correction(
 '66000000-0000-4000-8000-000000000422',:'missing_case',:'food_a',2,0,null,
 null,12,null,3,null,null,null,null,100,'g',null,'plan6-verifier-v1','apply missing nutrition',null
))->>'nutritionRevisionId' as nutrition_fact \gset
-- exact replay on an already-applied case returns prior result, without duplication.
select public.food_catalog_apply_nutrition_correction(
 '66000000-0000-4000-8000-000000000422',:'missing_case',:'food_a',2,0,null,
 null,12,null,3,null,null,null,null,100,'g',null,'plan6-verifier-v1','apply missing nutrition',null
);
select pg_temp.plan6_rejected(format(
 $$select public.food_catalog_apply_nutrition_correction(%L,%L,%L,2,0,null,null,13,null,3,null,null,null,null,100,'g',null,'plan6-verifier-v1','apply missing nutrition',null)$$,
 '66000000-0000-4000-8000-000000000422',:'missing_case',:'food_a'
),'operation ID changed semantics denied');
reset role;
select pg_temp.plan6_assert((select calories is null and protein_g=12 and carbs_g is null and fat_g=3 and basis_amount=100 and basis_unit='g' from public.food_nutrition_revisions where id=:'nutrition_fact'),'nutrition correction preserves unknown nutrients as NULL');
select pg_temp.plan6_assert((select count(*)=1 from public.food_nutrition_revisions where food_id=:'food_a'),'exact operation replay did not duplicate nutrition revision');
select pg_temp.plan6_assert(not exists(select 1 from public.food_serving_options where food_id=:'food_a'),'nutrition basis did not fabricate serving authority');
select pg_temp.plan6_assert((select state='applied' and state_revision=3 from public.food_catalog_correction_cases where id=:'missing_case'),'approved correction became applied only inside canonical apply');
select pg_temp.plan6_assert((select replay_count=1 from public.food_catalog_governance_operations where operation_id='66000000-0000-4000-8000-000000000422'),'idempotent replay recorded once');

-- A second approved correction using stale authority revision zero fails closed.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_report_correction(:'food_a','missing_nutrition','nutrition:stale','Stale CAS','{}'::jsonb,'plan6-v1'))->>'caseId' as stale_case \gset
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000430',:'stale_case','reported',0,'under_review','review stale');
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000431',:'stale_case','under_review',1,'approved','approve stale','nutrition_revision','',0,null);
select pg_temp.plan6_rejected(format(
 $$select public.food_catalog_apply_nutrition_correction(%L,%L,%L,2,0,null,null,20,null,2,null,null,null,null,100,'g',null,'plan6-verifier-v1','stale apply',null)$$,
 '66000000-0000-4000-8000-000000000432',:'stale_case',:'food_a'
),'stale canonical authority CAS denied');
reset role;
select pg_temp.plan6_assert(not exists(select 1 from public.food_catalog_governance_operations where operation_id='66000000-0000-4000-8000-000000000432'),'failed stale CAS left no false success operation/audit');

-- Curator can review but exact missing approve capability is denied.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'curator_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_report_correction(:'food_b','other','curator-case','Curator case','{}'::jsonb,'plan6-v1'))->>'caseId' as curator_case \gset
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000440',:'curator_case','reported',0,'under_review','curator review');
select pg_temp.plan6_rejected(format(
 'select public.food_catalog_transition_correction_case(%L,%L,%L,1,%L,%L)',
 '66000000-0000-4000-8000-000000000441',:'curator_case','under_review','approved','curator approve denied'
),'Curator without approve capability denied');
reset role;

-- Capability revocation is immediately authoritative.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.food_catalog_revoke_governance_capability('66000000-0000-4000-8000-000000000442',:'curator_principal','food.correction.review','revoke curator review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'curator_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.plan6_rejected(format(
 'select public.food_catalog_transition_correction_case(%L,%L,%L,1,%L,%L)',
 '66000000-0000-4000-8000-000000000443',:'curator_case','under_review','rejected','revoked review denied'
),'revoked capability is respected');
reset role;

-- Personal overrides are isolated per member and never contaminate global Food.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_set_personal_override('66000000-0000-4000-8000-000000000450',:'food_a',null,0,jsonb_build_object('calories',null,'protein_g',99),'my serving','mine'))->>'revisionId' as override_a \gset
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'other_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_set_personal_override('66000000-0000-4000-8000-000000000451',:'food_a',null,0,jsonb_build_object('calories',5),null,'other'))->>'revisionId' as override_b \gset
reset role;
select pg_temp.plan6_assert((select count(*)=2 from public.food_personal_overrides where food_id=:'food_a'),'personal overrides are owner-isolated');
select pg_temp.plan6_assert((select calories is null and protein_g is null from public.food_items where id=:'food_a'),'personal override did not alter global/compatibility Food nutrition');

-- Revision history is UPDATE-immutable and application DELETE remains denied; only the canonical privacy purge may physically remove owner history.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'member_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.plan6_rejected(format('delete from public.food_personal_override_revisions where id=%L',:'override_a'),'authenticated owner cannot directly delete personal override revision history');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.plan6_rejected(format('delete from public.food_personal_override_revisions where id=%L',:'override_b'),'service_role cannot directly delete personal override revision history');
reset role;

-- Plan 6 personal override purge follows the existing account-deletion lifecycle.
update public.account_access_states
set state='deletion_processing',
    reason_code='plan6_verifier_account_deletion',
    disabled_at=clock_timestamp()
where user_id=:'other_id'::uuid;
select pg_temp.plan6_assert(
  exists(select 1 from public.account_access_states where user_id=:'other_id'::uuid and state='deletion_processing' and disabled_at is not null),
  'Plan 6 purge owner access was not disabled before canonical purge'
);
insert into public.account_deletion_jobs(
  user_id, subject_hash, idempotency_key_hash, state, stage, attempt_count, locked_at
) values (
  :'other_id'::uuid,
  'plan6-verifier-subject-'||:'other_id',
  'plan6-verifier-idempotency-'||:'other_id',
  'processing','deleting_database',1,clock_timestamp()
) returning id as plan6_account_deletion_job_id \gset

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.purge_account_application_data_atomic(:'other_id') as plan6_personal_override_purge \gset
reset role;
select pg_temp.plan6_assert(not exists(select 1 from public.food_personal_overrides where user_id=:'other_id'),'Plan 6 personal override purge removed current pointer');
select pg_temp.plan6_assert(not exists(select 1 from public.food_personal_override_revisions where user_id=:'other_id'),'Plan 6 personal override purge removed revision history');
select pg_temp.plan6_assert(exists(select 1 from public.food_personal_overrides where user_id=:'member_id' and food_id=:'food_a'),'Plan 6 personal override purge preserved another member owner scope');
select pg_temp.plan6_assert(
  (:'plan6_personal_override_purge'::jsonb->>'food_personal_overrides_deleted')::integer=1
  and (:'plan6_personal_override_purge'::jsonb->>'food_personal_override_revisions_deleted')::integer=1
  and (:'plan6_personal_override_purge'::jsonb->>'deletion_job_id')::uuid=:'plan6_account_deletion_job_id'::uuid,
  'Plan 6 personal override purge reports owner rows and canonical deletion job authority'
);
select pg_temp.plan6_assert((select calories is null and protein_g is null from public.food_items where id=:'food_a'),'Plan 6 personal override purge did not mutate canonical Food');

-- Duplicate resolution requires approved evidence and preserves the source Food/history.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_report_correction(:'food_b','duplicate_food','duplicate:food-a','Duplicate Food','{}'::jsonb,'plan6-v1'))->>'caseId' as duplicate_case \gset
select public.food_catalog_attach_correction_evidence('66000000-0000-4000-8000-000000000460',:'duplicate_case','canonical',null,'canonical-food-a','duplicate evidence');
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000461',:'duplicate_case','reported',0,'under_review','review duplicate');
select public.food_catalog_transition_correction_case('66000000-0000-4000-8000-000000000462',:'duplicate_case','under_review',1,'approved','approve duplicate','identity_merge','',0,null);
select public.food_catalog_resolve_duplicate('66000000-0000-4000-8000-000000000463',:'duplicate_case',:'food_b',:'food_a',2,0,null,'resolve duplicate');
reset role;
select pg_temp.plan6_assert(exists(select 1 from public.food_items where id=:'food_b' and lifecycle_status='merged' and merged_into_food_id=:'food_a'),'duplicate source stable Food ID preserved as redirect');
select pg_temp.plan6_assert((select count(*)=1 from public.food_merge_events where source_food_id=:'food_b' and target_food_id=:'food_a'),'Plan 1 merge history emitted exactly once');

-- Withdrawal is non-destructive; bounded break-glass is audited; restore is explicit.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select (public.food_catalog_withdraw_food('66000000-0000-4000-8000-000000000470',:'lifecycle_food','active',0,null,null,'emergency withdraw','emergency evidence review'))->>'lifecycleEventId' as withdraw_event \gset
select public.food_catalog_restore_food('66000000-0000-4000-8000-000000000471',:'lifecycle_food','withdrawn',1,:'withdraw_event','restore after review',null);
reset role;
select pg_temp.plan6_assert(exists(select 1 from public.food_items where id=:'lifecycle_food' and lifecycle_status='active'),'withdraw/restore preserve the same independent Food row');
select pg_temp.plan6_assert(exists(select 1 from public.food_catalog_governance_audit_events where operation_id='66000000-0000-4000-8000-000000000470' and break_glass and break_glass_reason='emergency evidence review'),'break-glass immutable audit marker present');

-- Immutable audit and atomic audit/outbox evidence.
select pg_temp.plan6_rejected($$update public.food_catalog_governance_audit_events set reason='tamper' where operation_id='66000000-0000-4000-8000-000000000422'$$,'audit update immutable');
select pg_temp.plan6_rejected($$delete from public.food_catalog_governance_audit_events where operation_id='66000000-0000-4000-8000-000000000422'$$,'audit delete immutable');
select pg_temp.plan6_assert((select count(*)=1 from public.food_catalog_governance_audit_events where operation_id='66000000-0000-4000-8000-000000000422'),'successful canonical mutation has exactly one immutable audit event');
select pg_temp.plan6_assert((select count(*)=1 from public.food_catalog_governance_outbox where operation_id='66000000-0000-4000-8000-000000000422'),'successful canonical mutation has exactly one transactional outbox event');

-- Outbox failure/retry/delivery is idempotent and terminal once delivered.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','plan6-verifier-service-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422',300))->>'leaseToken' as primary_retry_lease_a \gset
select public.food_catalog_finish_governance_outbox('66000000-0000-4000-8000-000000000422',:'primary_retry_lease_a',false,'fixture failure',0);
select (public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422',300))->>'leaseToken' as primary_retry_lease_b \gset
select public.food_catalog_finish_governance_outbox('66000000-0000-4000-8000-000000000422',:'primary_retry_lease_b',true,null,0);
select pg_temp.plan6_rejected($$select public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422')$$,'delivered outbox event terminal');
reset role;
select pg_temp.plan6_assert((select status='delivered' and attempt_count=2 from public.food_catalog_governance_outbox where event_id='66000000-0000-4000-8000-000000000422'),'outbox retry/delivery state visible');

-- Durable metrics expose cases, replays, duplicate/lifecycle actions, break-glass and outbox state.
set local role authenticated;
select set_config('request.jwt.claim.sub', :'owner_id', true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.food_catalog_governance_metrics() as metrics \gset
reset role;
select pg_temp.plan6_assert(
  (:'metrics'::jsonb->>'idempotentReplays')::bigint>=1
  and (:'metrics'::jsonb->>'duplicateResolutions')::bigint>=1
  and (:'metrics'::jsonb->>'withdrawals')::bigint>=1
  and (:'metrics'::jsonb->>'restores')::bigint>=1
  and (:'metrics'::jsonb->>'breakGlassExecutions')::bigint>=1,
  'governance metrics expose durable operational counters'
);

-- Plan 3 / Plan 5 authority remains untouched by Plan 6 operations.
select pg_temp.plan6_assert((select current_generation_id is null and pointer_revision=0 from public.food_catalog_current_generation where singleton_key=true),'Plan 3 current pointer remained NULL/0');
select pg_temp.plan6_assert((select count(*)=0 from public.food_catalog_generations),'Plan 6 verifier created no Catalog Generation');
select pg_temp.plan6_assert((select count(*)=0 from public.food_catalog_search_documents),'Plan 6 verifier wrote no derived SearchDocuments');

rollback;
