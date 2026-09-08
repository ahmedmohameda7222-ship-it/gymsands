\set ON_ERROR_STOP on
\set food_a '67000000-0000-4000-8000-000000000101'
\set food_b '67000000-0000-4000-8000-000000000102'
\set source_a '67000000-0000-4000-8000-000000000201'
\set owner_uid '67000000-0000-4000-8000-000000000001'
\set owner_principal '67000000-0000-4000-8000-000000000301'
\set service_a '67000000-0000-4000-8000-000000000302'
\set service_b '67000000-0000-4000-8000-000000000303'
\set domain_uid '67000000-0000-4000-8000-000000000011'
\set apply_uid '67000000-0000-4000-8000-000000000012'
\set both_uid '67000000-0000-4000-8000-000000000013'
\set domain_principal '67000000-0000-4000-8000-000000000311'
\set apply_principal '67000000-0000-4000-8000-000000000312'
\set both_principal '67000000-0000-4000-8000-000000000313'
\set override_uid '67000000-0000-4000-8000-000000000021'
\set serving_a '67000000-0000-4000-8000-000000000401'
\set serving_b '67000000-0000-4000-8000-000000000402'
\set lineage_a '67000000-0000-4000-8000-000000000411'
\set lineage_b '67000000-0000-4000-8000-000000000412'
\set gtin '4006381333931'

begin;

create or replace function pg_temp.plan6_rereview_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then raise exception 'Plan 6 re-review assertion failed: %',p_message; end if;
end
$$;
create or replace function pg_temp.plan6_rereview_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
declare rejected boolean:=false;
begin
  begin execute p_sql; exception when others then rejected:=true; end;
  if not rejected then raise exception 'Plan 6 re-review expected rejection did not occur: %',p_message; end if;
end
$$;

-- Shared disposable fixtures.
insert into public.food_items(id,food_name,is_global,lifecycle_status) values
  (:'food_a','Plan 6 Re-review Food A',true,'active'),
  (:'food_b','Plan 6 Re-review Food B',true,'active');
insert into public.food_source_records(id,food_id,provider,source_record_id,license_name,source_reference)
values(:'source_a',:'food_a','plan6-rereview','source-a','Verifier License','fixture://plan6-rereview/source-a');

insert into public.food_catalog_governance_principals(id,principal_type,subject_id,service_identity_sha256,role_class) values
  (:'owner_principal','human',:'owner_uid',null,'owner'),
  (:'service_a','service','service-a',encode(extensions.digest(convert_to('service-a-identity','UTF8'),'sha256'),'hex'),'service'),
  (:'service_b','service','service-b',encode(extensions.digest(convert_to('service-b-identity','UTF8'),'sha256'),'hex'),'service'),
  (:'domain_principal','human',:'domain_uid',null,'curator'),
  (:'apply_principal','human',:'apply_uid',null,'curator'),
  (:'both_principal','human',:'both_uid',null,'curator');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason)
select :'owner_principal',capability,'rereview-owner' from unnest(array[
 'food.governance.manage_principals','food.correction.report','food.correction.review','food.correction.approve','food.correction.apply','food.evidence.attach',
 'food.nutrition.correct','food.serving.correct','food.name.correct','food.barcode.correct','food.taxonomy.correct','food.market.correct','food.identity.merge',
 'food.lifecycle.withdraw','food.lifecycle.restore','food.break_glass','food.personal_override.write','food.observability.read'
]) capability;
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
  (:'service_a','food.ingestion.propose','service-a-propose'),
  (:'service_a','food.outbox.deliver','service-a-outbox'),
  (:'service_b','food.evidence.attach','service-b-evidence'),
  (:'domain_principal','food.nutrition.correct','domain-only'),
  (:'apply_principal','food.correction.apply','apply-only'),
  (:'both_principal','food.correction.apply','both-apply'),
  (:'both_principal','food.nutrition.correct','both-domain');

-- P1-1: signed execution claim binds service A/B and audit identity cannot be caller-forged.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);
select (public.food_catalog_service_propose_correction(
  '67000000-0000-4000-8000-000000000501',:'service_a',:'food_a','other','svc-a','Service A proposal','{}'::jsonb,null,'service A proposal'
))->>'proposalId' as service_a_proposal \gset
select pg_temp.plan6_rereview_rejected(format(
  'select public.food_catalog_service_propose_correction(%L,%L,%L,%L,%L,%L,%L::jsonb,null,%L)',
  '67000000-0000-4000-8000-000000000502',:'service_b',:'food_a','other','impersonate','impersonation','{}','cross-service impersonation'
),'Service A cannot execute as Service B');
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-b-identity')::text,true);
select pg_temp.plan6_rereview_rejected(format(
  'select public.food_catalog_service_propose_correction(%L,%L,%L,%L,%L,%L,%L::jsonb,null,%L)',
  '67000000-0000-4000-8000-000000000503',:'service_b',:'food_a','other','svc-b','Service B proposal','{}','service B lacks proposal authority'
),'Service B remains least-privileged');
reset role;
select pg_temp.plan6_rereview_assert(exists(
  select 1 from public.food_catalog_governance_audit_events where operation_id='67000000-0000-4000-8000-000000000501' and principal_id=:'service_a'
),'service audit principal is the trusted resolved identity');

-- P1-2: canonical apply requires BOTH generic apply and domain authority.
insert into public.food_catalog_correction_cases(
 id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id
) values(
 '67000000-0000-4000-8000-000000000520',:'food_a','wrong_nutrition','dual-cap','rereview|dual-cap','approved',2,'plan6-v1','nutrition_revision','',0,null
);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'domain_uid',true);
select pg_temp.plan6_rereview_rejected(format(
 'select public.food_catalog_apply_nutrition_correction(%L,%L,%L,2,0,null,null,null,null,null,null,null,null,null,100,%L,null,%L,%L)',
 '67000000-0000-4000-8000-000000000521','67000000-0000-4000-8000-000000000520',:'food_a','g','rereview-v1','domain only'
),'domain capability without food.correction.apply cannot apply');
select set_config('request.jwt.claim.sub',:'apply_uid',true);
select pg_temp.plan6_rereview_rejected(format(
 'select public.food_catalog_apply_nutrition_correction(%L,%L,%L,2,0,null,null,null,null,null,null,null,null,null,100,%L,null,%L,%L)',
 '67000000-0000-4000-8000-000000000522','67000000-0000-4000-8000-000000000520',:'food_a','g','rereview-v1','apply only'
),'food.correction.apply without domain capability cannot apply');
select set_config('request.jwt.claim.sub',:'both_uid',true);
select public.food_catalog_apply_nutrition_correction(
 '67000000-0000-4000-8000-000000000523','67000000-0000-4000-8000-000000000520',:'food_a',2,0,null,
 null,null,null,null,null,null,null,null,100,'g',null,'rereview-v1','both capabilities');
reset role;
select pg_temp.plan6_rereview_assert((select state='applied' from public.food_catalog_correction_cases where id='67000000-0000-4000-8000-000000000520'),'principal with both capabilities applied correction');

-- P1-3: persistence matrix exactly mirrors lib/food-catalog/governance/evidence.ts, exhaustively.
create temp table plan6_expected_evidence(category text,evidence_type text,allowed boolean) on commit drop;
insert into plan6_expected_evidence
select p.category,t.evidence_type,t.evidence_type=any(p.allowed)
from (values
 ('wrong_nutrition',array['source_record','product_label','manufacturer']::text[]),
 ('missing_nutrition',array['source_record','product_label','manufacturer','curator_reason']::text[]),
 ('wrong_serving',array['source_record','product_label','manufacturer']::text[]),
 ('missing_serving',array['source_record','product_label','manufacturer','curator_reason']::text[]),
 ('wrong_name',array['source_record','product_label','manufacturer','canonical']::text[]),
 ('wrong_translation',array['source_record','product_label','manufacturer','canonical']::text[]),
 ('wrong_barcode',array['source_record','product_label','manufacturer','barcode']::text[]),
 ('wrong_taxonomy',array['source_record','canonical','curator_reason']::text[]),
 ('wrong_market_relevance',array['source_record','manufacturer','canonical','curator_reason']::text[]),
 ('duplicate_food',array['source_record','product_label','manufacturer','barcode','canonical']::text[]),
 ('wrong_variant',array['source_record','product_label','manufacturer','barcode']::text[]),
 ('outdated_product',array['source_record','manufacturer','canonical']::text[]),
 ('source_conflict',array['source_record','product_label','manufacturer','canonical']::text[]),
 ('other',array['source_record','product_label','manufacturer','barcode','canonical','curator_reason']::text[])
) p(category,allowed)
cross join unnest(array['source_record','product_label','manufacturer','barcode','canonical','curator_reason']::text[]) t(evidence_type);
select pg_temp.plan6_rereview_assert(bool_and(private.food_catalog_governance_evidence_type_allowed('plan6-v1',category,evidence_type)=allowed),'DB evidence policy helper matches every domain matrix cell') from plan6_expected_evidence;

create temp table plan6_matrix_cases(category text primary key,case_id uuid not null) on commit drop;
insert into plan6_matrix_cases
select category,gen_random_uuid() from (select distinct category from plan6_expected_evidence) q;
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version)
select case_id,:'food_a',category,'matrix-'||category,'rereview|matrix|'||category,'reported',0,'plan6-v1' from plan6_matrix_cases;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
do $matrix$
declare r record; v_rejected boolean;
begin
  for r in select e.*,c.case_id from plan6_expected_evidence e join plan6_matrix_cases c using(category) order by category,evidence_type loop
    v_rejected:=false;
    begin
      perform public.food_catalog_attach_correction_evidence(gen_random_uuid(),r.case_id,r.evidence_type,null,'fixture://evidence/'||r.category||'/'||r.evidence_type,'matrix verification');
    exception when others then v_rejected:=true; end;
    if r.allowed and v_rejected then raise exception 'Allowed evidence rejected: %/%',r.category,r.evidence_type; end if;
    if not r.allowed and not v_rejected then raise exception 'Disallowed evidence accepted: %/%',r.category,r.evidence_type; end if;
  end loop;
end
$matrix$;

-- P1-4: no evidence can be appended after Approved, Applied, or Rejected.
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version) values
 ('67000000-0000-4000-8000-000000000540',:'food_a','other','freeze-approved','rereview|freeze|approved','approved',2,'plan6-v1'),
 ('67000000-0000-4000-8000-000000000541',:'food_a','other','freeze-applied','rereview|freeze|applied','applied',3,'plan6-v1'),
 ('67000000-0000-4000-8000-000000000542',:'food_a','other','freeze-rejected','rereview|freeze|rejected','rejected',1,'plan6-v1');
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_attach_correction_evidence('67000000-0000-4000-8000-000000000543','67000000-0000-4000-8000-000000000540','product_label',null,'fixture://post-approved','post approved')$$,'post-approved evidence frozen');
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_attach_correction_evidence('67000000-0000-4000-8000-000000000544','67000000-0000-4000-8000-000000000541','product_label',null,'fixture://post-applied','post applied')$$,'post-applied evidence frozen');
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_attach_correction_evidence('67000000-0000-4000-8000-000000000545','67000000-0000-4000-8000-000000000542','product_label',null,'fixture://post-rejected','post rejected')$$,'post-rejected evidence frozen');

-- P1-5: worker death/reclaim/stale finish/delivery terminality and available_at/retry semantics.
insert into public.food_catalog_governance_operations(operation_id,principal_id,principal_type,capability,command_name,target_food_id,policy_version,reason,semantic_checksum_sha256,completed_at,result_json) values
 ('67000000-0000-4000-8000-000000000550',:'owner_principal','human','food.observability.read','food_catalog_outbox_fixture',:'food_a','plan6-v1','outbox fixture',repeat('a',64),now(),'{}'),
 ('67000000-0000-4000-8000-000000000551',:'owner_principal','human','food.observability.read','food_catalog_outbox_future',:'food_a','plan6-v1','outbox future',repeat('b',64),now(),'{}'),
 ('67000000-0000-4000-8000-000000000552',:'owner_principal','human','food.observability.read','food_catalog_outbox_retry',:'food_a','plan6-v1','outbox retry',repeat('c',64),now(),'{}');
insert into public.food_catalog_governance_outbox(event_id,operation_id,event_type,payload,available_at) values
 ('67000000-0000-4000-8000-000000000550','67000000-0000-4000-8000-000000000550','fixture.delivery','{}',now()),
 ('67000000-0000-4000-8000-000000000551','67000000-0000-4000-8000-000000000551','fixture.future','{}',now()+interval '1 hour'),
 ('67000000-0000-4000-8000-000000000552','67000000-0000-4000-8000-000000000552','fixture.retry','{}',now());
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550',300))->>'leaseToken' as lease_a \gset
reset role;
update public.food_catalog_governance_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where event_id='67000000-0000-4000-8000-000000000550';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550',300))->>'leaseToken' as lease_b \gset
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_finish_governance_outbox(%L,%L,true,null,0)','67000000-0000-4000-8000-000000000550',:'lease_a'),'stale worker cannot finish newer claim');
select public.food_catalog_finish_governance_outbox('67000000-0000-4000-8000-000000000550',:'lease_b',true,null,0);
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550',300)$$,'delivered event cannot be redelivered');
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000551',300)$$,'available_at is respected');
select (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000552',300))->>'leaseToken' as retry_lease_a \gset
select public.food_catalog_finish_governance_outbox('67000000-0000-4000-8000-000000000552',:'retry_lease_a',false,'transient',60);
select pg_temp.plan6_rereview_rejected($$select public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000552',300)$$,'failed retry respects available_at');
reset role;
update public.food_catalog_governance_outbox set available_at=clock_timestamp()-interval '1 second' where event_id='67000000-0000-4000-8000-000000000552';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000552',300))->>'leaseToken' as retry_lease_b \gset
select public.food_catalog_finish_governance_outbox('67000000-0000-4000-8000-000000000552',:'retry_lease_b',true,null,0);
reset role;
select pg_temp.plan6_rereview_assert((select status='delivered' and attempt_count=2 from public.food_catalog_governance_outbox where event_id='67000000-0000-4000-8000-000000000552'),'failed outbox work retried and delivered');

-- P1-6: two independent serving lineages keep CAS/history separate.
insert into public.food_serving_options(id,food_id,label,amount,unit_code,gram_weight,source_record_id,evidence_class,source_primary,authority_reference) values
 (:'serving_a',:'food_a','1 cup',1,'cup',240,:'source_a','exact_source',true,'rereview:seed-a'),
 (:'serving_b',:'food_a','1 tbsp',1,'tbsp',15,:'source_a','exact_source',false,'rereview:seed-b');
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
 ('67000000-0000-4000-8000-000000000560',:'food_a','wrong_serving','cup-lineage','rereview|serving|cup','approved',2,'plan6-v1','serving_option',:'lineage_a',0,:'serving_a'),
 ('67000000-0000-4000-8000-000000000561',:'food_a','wrong_serving','tbsp-lineage','rereview|serving|tbsp','approved',2,'plan6-v1','serving_option',:'lineage_b',0,:'serving_b');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
select (public.food_catalog_apply_serving_correction(
 '67000000-0000-4000-8000-000000000562','67000000-0000-4000-8000-000000000560',:'food_a',:'lineage_a',2,0,:'serving_a',
 '1 cup corrected',1,'cup',235,:'source_a','cup','exact_source',true,'correct cup'
))->>'servingOptionId' as serving_a_new \gset
select (public.food_catalog_apply_serving_correction(
 '67000000-0000-4000-8000-000000000563','67000000-0000-4000-8000-000000000561',:'food_a',:'lineage_b',2,0,:'serving_b',
 '1 tbsp corrected',1,'tbsp',14,:'source_a','tbsp','exact_source',false,'correct tbsp'
))->>'servingOptionId' as serving_b_new \gset
reset role;
select pg_temp.plan6_rereview_assert((select count(*)=2 from public.food_catalog_governance_authority_revisions where food_id=:'food_a' and authority_kind='serving_option' and authority_key in (:'lineage_a',:'lineage_b')),'serving lineages have two independent authority heads');
select pg_temp.plan6_rereview_assert((select current_fact_id=:'serving_a_new'::uuid from public.food_catalog_governance_authority_revisions where food_id=:'food_a' and authority_kind='serving_option' and authority_key=:'lineage_a'),'cup lineage points only to corrected cup');
select pg_temp.plan6_rereview_assert((select current_fact_id=:'serving_b_new'::uuid from public.food_catalog_governance_authority_revisions where food_id=:'food_a' and authority_kind='serving_option' and authority_key=:'lineage_b'),'tbsp lineage points only to corrected tbsp');
select pg_temp.plan6_rereview_assert((select count(*)=4 from public.food_serving_options where food_id=:'food_a'),'old immutable serving facts remain historical beside corrected facts');
select pg_temp.plan6_rereview_assert(exists(select 1 from public.food_catalog_serving_fact_revisions where serving_option_id=:'serving_a_new'::uuid and lineage_id=:'lineage_a'::uuid and predecessor_serving_option_id=:'serving_a'::uuid),'cup predecessor remains in cup lineage');
select pg_temp.plan6_rereview_assert(exists(select 1 from public.food_catalog_serving_fact_revisions where serving_option_id=:'serving_b_new'::uuid and lineage_id=:'lineage_b'::uuid and predecessor_serving_option_id=:'serving_b'::uuid),'tbsp predecessor remains in tbsp lineage');

-- P1-9 + P2 GTIN: corrections change effective food_barcodes truth; uniqueness and GS1 Mod-10 are enforced.
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
 ('67000000-0000-4000-8000-000000000570',:'food_a','wrong_barcode','assign-gtin','rereview|barcode|assign','approved',2,'plan6-v1','barcode_correction',:'gtin',0,null),
 ('67000000-0000-4000-8000-000000000571',:'food_b','wrong_barcode','conflict-gtin','rereview|barcode|conflict','approved',2,'plan6-v1','barcode_correction',:'gtin',0,null);
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
select (public.food_catalog_apply_barcode_correction('67000000-0000-4000-8000-000000000572','67000000-0000-4000-8000-000000000570',:'food_a',2,0,null,:'gtin','assign',null,'assign effective GTIN'))->>'barcodeCorrectionId' as barcode_authority \gset
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_apply_barcode_correction(%L,%L,%L,2,0,null,%L,%L,null,%L)','67000000-0000-4000-8000-000000000573','67000000-0000-4000-8000-000000000571',:'food_b',:'gtin','assign','conflicting owner'),'one active GTIN cannot belong to conflicting Foods');
reset role;
select pg_temp.plan6_rereview_assert((select food_id=:'food_a'::uuid from public.food_catalog_lookup_effective_barcode(:'gtin')),'authoritative barcode lookup observes assignment correction');
select pg_temp.plan6_rereview_rejected(format('insert into public.food_barcodes(food_id,gtin) values(%L,%L)',:'food_a','4006381333932'),'food_barcodes rejects invalid GS1 Mod-10');
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id)
values('67000000-0000-4000-8000-000000000574',:'food_a','wrong_barcode','remove-gtin','rereview|barcode|remove','approved',2,'plan6-v1','barcode_correction',:'gtin',1,:'barcode_authority');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
select public.food_catalog_apply_barcode_correction('67000000-0000-4000-8000-000000000575','67000000-0000-4000-8000-000000000574',:'food_a',2,1,:'barcode_authority',:'gtin','remove',null,'remove effective GTIN');
reset role;
select pg_temp.plan6_rereview_assert(not exists(select 1 from public.food_catalog_lookup_effective_barcode(:'gtin')),'authoritative barcode lookup observes removal correction');
select pg_temp.plan6_rereview_assert((select count(*)=2 from public.food_catalog_barcode_corrections where food_id=:'food_a' and gtin=:'gtin'),'immutable barcode correction history preserves assign and remove');

-- Personal Override lifecycle hardening requires the verifier owner to be a real active Auth account.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  :'override_uid'::uuid, 'authenticated', 'authenticated', 'plan6-rereview-override@example.test', '',
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()
);
select pg_temp.plan6_rereview_assert(
  exists(select 1 from public.profiles where id=:'override_uid'::uuid)
  and exists(select 1 from public.account_access_states where user_id=:'override_uid'::uuid and state='active' and disabled_at is null),
  'Plan 6 re-review override Auth fixture did not create canonical profile/access state'
);

-- P2 personal overrides: owner-scoped idempotency, semantic conflict rejection, payload/domain bounds.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'override_uid',true);
select (public.food_catalog_set_personal_override('67000000-0000-4000-8000-000000000580',:'food_a',null,0,jsonb_build_object('calories',null,'protein_g',10),'My serving','bounded note'))->>'revisionId' as override_rev1 \gset
select pg_temp.plan6_rereview_assert((public.food_catalog_set_personal_override('67000000-0000-4000-8000-000000000580',:'food_a',null,0,jsonb_build_object('calories',null,'protein_g',10),'My serving','bounded note'))->>'revisionId'=:'override_rev1','exact override retry returns same revision');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,null,0,%L::jsonb,%L,%L)','67000000-0000-4000-8000-000000000580',:'food_a','{"protein_g":11}','My serving','bounded note'),'same override operation ID with changed semantics rejected');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,%L,1,%L::jsonb,null,null)','67000000-0000-4000-8000-000000000581',:'food_a',:'override_rev1','{"bogus":1}'),'unsupported nutrition override key rejected');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,%L,1,%L::jsonb,null,null)','67000000-0000-4000-8000-000000000582',:'food_a',:'override_rev1','{"protein_g":-1}'),'negative nutrition override rejected');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,%L,1,%L::jsonb,null,null)','67000000-0000-4000-8000-000000000583',:'food_a',:'override_rev1','{"protein_g":"10"}'),'non-numeric nutrition override rejected');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,%L,1,null,%L,null)','67000000-0000-4000-8000-000000000584',:'food_a',:'override_rev1',repeat('x',201)),'serving label bound enforced');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_set_personal_override(%L,%L,%L,1,null,null,%L)','67000000-0000-4000-8000-000000000585',:'food_a',:'override_rev1',repeat('x',1001)),'note bound enforced');
select (public.food_catalog_delete_personal_override('67000000-0000-4000-8000-000000000586',:'food_a',:'override_rev1',1))->>'revisionId' as override_rev2 \gset
select pg_temp.plan6_rereview_assert((public.food_catalog_delete_personal_override('67000000-0000-4000-8000-000000000586',:'food_a',:'override_rev1',1))->>'revisionId'=:'override_rev2','exact delete retry returns same tombstone revision');
reset role;
select pg_temp.plan6_rereview_assert((select count(*)=2 from public.food_personal_override_revisions where user_id=:'override_uid' and food_id=:'food_a'),'exact retries create no duplicate personal override revisions');
select pg_temp.plan6_rereview_assert((select count(*)=2 from public.food_personal_override_operations where user_id=:'override_uid' and food_id=:'food_a'),'owner-scoped override operation ledger records exactly set+delete');

-- P2 recursive sensitive/depth/size validation is enforced at direct member and service RPC boundaries.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'override_uid',true);
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_report_correction(%L,%L,%L,%L,%L::jsonb,null)',:'food_a','other','nested-secret','nested secret','{"meta":{"api_key":"nope"}}'),'nested sensitive evidence rejected for member');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_report_correction(%L,%L,%L,%L,%L::jsonb,null)',:'food_a','other','deep-evidence','deep','{"a":{"b":{"c":{"d":{"e":"too deep"}}}}}'),'evidence depth > 4 rejected');
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_report_correction(%L,%L,%L,%L,%L::jsonb,null)',:'food_a','other','wide-evidence','wide',jsonb_build_object('items',(select jsonb_agg(i) from generate_series(1,25)i))::text),'evidence arrays > 24 rejected');
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_service_propose_correction(%L,%L,%L,%L,%L,%L,%L::jsonb,null,%L)','67000000-0000-4000-8000-000000000590',:'service_a',:'food_a','other','nested-service-secret','nested','{"outer":{"session_token":"nope"}}','nested service evidence'),'nested sensitive evidence rejected for service');
reset role;

-- P1-8: final Owner cannot remove the last recovery path; a second Owner makes revocation safe.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_revoke_governance_capability(%L,%L,%L,%L)','67000000-0000-4000-8000-000000000600',:'owner_principal','food.governance.manage_principals','self lockout'),'final Owner self-lockout rejected');
select (public.food_catalog_manage_governance_principal('67000000-0000-4000-8000-000000000601','human','67000000-0000-4000-8000-000000000099','owner',array['food.governance.manage_principals'],'add second Owner'))->>'principalId' as second_owner \gset
select public.food_catalog_revoke_governance_capability('67000000-0000-4000-8000-000000000602',:'owner_principal','food.governance.manage_principals','safe after second Owner');
reset role;
select pg_temp.plan6_rereview_assert(exists(select 1 from public.food_catalog_governance_capability_assignments where principal_id=:'second_owner'::uuid and capability='food.governance.manage_principals' and revoked_at is null),'second Owner preserves recovery authority');

-- P1-7: unsupported caller-authored versions reject; historical V1 stays frozen after an explicit additive V2 pointer move.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'override_uid',true);
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_report_correction(%L,%L,%L,%L,%L::jsonb,%L)',:'food_a','other','unsupported-policy','unsupported','{}','whatever-v999'),'member cannot choose unsupported policy');
select (public.food_catalog_report_correction(:'food_a','other','historical-v1','historical v1','{}'::jsonb,null))->>'caseId' as historical_v1_case \gset
reset role;
insert into public.food_catalog_governance_policy_versions(policy_version,evidence_policy,evidence_required_categories)
select 'plan6-v2-fixture',evidence_policy,evidence_required_categories from public.food_catalog_governance_policy_versions where policy_version='plan6-v1';
update public.food_catalog_governance_policy_pointer set current_policy_version='plan6-v2-fixture',pointer_revision=pointer_revision+1,updated_at=clock_timestamp() where singleton=true;
select pg_temp.plan6_rereview_assert((select policy_version='plan6-v1' from public.food_catalog_correction_cases where id=:'historical_v1_case'),'historical V1 case remains frozen after current policy moves');
select pg_temp.plan6_rereview_rejected($$update public.food_catalog_governance_policy_versions set evidence_policy='{}'::jsonb where policy_version='plan6-v1'$$,'historical policy version is immutable');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'override_uid',true);
select (public.food_catalog_report_correction(:'food_a','other','current-v2','current v2','{}'::jsonb,null))->>'caseId' as current_v2_case \gset
select pg_temp.plan6_rereview_rejected(format('select public.food_catalog_report_correction(%L,%L,%L,%L,%L::jsonb,%L)',:'food_a','other','stale-v1','stale v1','{}','plan6-v1'),'stale explicit V1 cannot relabel new case after pointer moves');
reset role;
select pg_temp.plan6_rereview_assert((select policy_version='plan6-v2-fixture' from public.food_catalog_correction_cases where id=:'current_v2_case'),'new case uses trusted current policy version');

rollback;
