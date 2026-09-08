\set ON_ERROR_STOP on
\set food '68000000-0000-4000-8000-000000000101'
\set owner_uid '68000000-0000-4000-8000-000000000001'
\set owner_principal '68000000-0000-4000-8000-000000000301'
\set worker_principal '68000000-0000-4000-8000-000000000302'
\set other_principal '68000000-0000-4000-8000-000000000303'
\set name_a '68000000-0000-4000-8000-000000000401'
\set name_b '68000000-0000-4000-8000-000000000402'
\set lineage_a '68000000-0000-4000-8000-000000000411'
\set lineage_b '68000000-0000-4000-8000-000000000412'
\set gtin_a '4006381333931'
\set gtin_b '5901234123457'

begin;

create or replace function pg_temp.plan6_authority_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then raise exception 'Plan 6 authority assertion failed: %',p_message; end if;
end
$$;
create or replace function pg_temp.plan6_authority_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 6 authority expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 6 authority expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

select pg_temp.plan6_authority_assert(
  to_regclass('public.food_catalog_name_fact_lineages') is not null
  and to_regclass('public.food_catalog_name_fact_revisions') is not null,
  'Name lineage authority relations exist'
);

insert into public.food_items(id,food_name,is_global,lifecycle_status)
values(:'food','Plan 6 Authority Fixture',true,'active');
insert into public.food_catalog_governance_principals(id,principal_type,subject_id,service_identity_sha256,role_class) values
  (:'owner_principal','human',:'owner_uid',null,'owner'),
  (:'worker_principal','service','authority-outbox-worker',encode(extensions.digest(convert_to('authority-outbox-worker-identity','UTF8'),'sha256'),'hex'),'service'),
  (:'other_principal','service','authority-other-service',encode(extensions.digest(convert_to('authority-other-service-identity','UTF8'),'sha256'),'hex'),'service');
insert into public.food_catalog_governance_capability_assignments(principal_id,capability,reason) values
  (:'owner_principal','food.correction.apply','authority-rereview'),
  (:'owner_principal','food.name.correct','authority-rereview'),
  (:'worker_principal','food.outbox.deliver','authority-rereview-worker');

-- P1-R1: same-language/same-role Name facts have independent lineage/CAS/history.
insert into public.food_names(id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,policy_version) values
  (:'name_a',:'food','en','synonym','Alpha synonym','alpha synonym','Latn','curated','plan6-v1'),
  (:'name_b',:'food','en','synonym','Beta synonym','beta synonym','Latn','curated','plan6-v1');
insert into public.food_catalog_correction_cases(id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,expected_authority_kind,expected_authority_key,expected_authority_revision,expected_authority_id) values
  ('68000000-0000-4000-8000-000000000421',:'food','wrong_name','alpha','authority|name|alpha','approved',2,'plan6-v1','name_fact',:'lineage_a',0,:'name_a'),
  ('68000000-0000-4000-8000-000000000422',:'food','wrong_name','beta','authority|name|beta','approved',2,'plan6-v1','name_fact',:'lineage_b',0,:'name_b');
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_uid',true);
select (public.food_catalog_apply_name_correction(
  '68000000-0000-4000-8000-000000000431','68000000-0000-4000-8000-000000000421',:'food',:'lineage_a',2,0,:'name_a',
  'en','synonym','Alpha synonym corrected','alpha synonym corrected','Latn',null,'correct alpha lineage'
))->>'nameId' as name_a_new \gset
select (public.food_catalog_apply_name_correction(
  '68000000-0000-4000-8000-000000000432','68000000-0000-4000-8000-000000000422',:'food',:'lineage_b',2,0,:'name_b',
  'en','synonym','Beta synonym corrected','beta synonym corrected','Latn',null,'correct beta lineage'
))->>'nameId' as name_b_new \gset
reset role;
select pg_temp.plan6_authority_assert((select count(*)=2 from public.food_catalog_governance_authority_revisions where food_id=:'food' and authority_kind='name_fact' and authority_key in (:'lineage_a',:'lineage_b')),'same-language/same-role Names keep two authority heads');
select pg_temp.plan6_authority_assert((select current_fact_id=:'name_a_new'::uuid from public.food_catalog_governance_authority_revisions where food_id=:'food' and authority_kind='name_fact' and authority_key=:'lineage_a'),'Name A head points to Name A correction');
select pg_temp.plan6_authority_assert((select current_fact_id=:'name_b_new'::uuid from public.food_catalog_governance_authority_revisions where food_id=:'food' and authority_kind='name_fact' and authority_key=:'lineage_b'),'Name B head points to Name B correction');
select pg_temp.plan6_authority_assert(exists(select 1 from public.food_catalog_name_fact_revisions where name_fact_id=:'name_a_new'::uuid and lineage_id=:'lineage_a'::uuid and predecessor_name_fact_id=:'name_a'::uuid),'Name A predecessor stays in lineage A');
select pg_temp.plan6_authority_assert(exists(select 1 from public.food_catalog_name_fact_revisions where name_fact_id=:'name_b_new'::uuid and lineage_id=:'lineage_b'::uuid and predecessor_name_fact_id=:'name_b'::uuid),'Name B predecessor stays in lineage B');
select pg_temp.plan6_authority_assert((select count(*)=4 from public.food_names where food_id=:'food'),'immutable old Name facts remain historical');

-- P1-R2 Name: another same-Food lineage cannot seed key A.
select pg_temp.plan6_authority_rejected(format(
  'select private.food_catalog_governance_lock_authority(%L,%L,%L,0,%L)',:'food','name_fact',:'lineage_a',:'name_b'
),'Name key A rejects Name key B predecessor');

-- P1-R2 Barcode: exact GTIN key required.
insert into public.food_barcodes(id,food_id,gtin) values
 ('68000000-0000-4000-8000-000000000441',:'food',:'gtin_a'),
 ('68000000-0000-4000-8000-000000000442',:'food',:'gtin_b');
select pg_temp.plan6_authority_rejected(format(
  'select private.food_catalog_governance_lock_authority(%L,%L,%L,0,%L)',:'food','barcode_correction',:'gtin_a','68000000-0000-4000-8000-000000000442'
),'GTIN A rejects GTIN B predecessor');
select private.food_catalog_governance_lock_authority(:'food','barcode_correction',:'gtin_a',0,'68000000-0000-4000-8000-000000000441');

-- P1-R2 Taxonomy: exact node_code required.
insert into public.food_taxonomy_assignments(id,food_id,node_code,assignment_action,policy_version) values
 ('68000000-0000-4000-8000-000000000451',:'food','protein_foods','assign','plan6-v1'),
 ('68000000-0000-4000-8000-000000000452',:'food','dairy','assign','plan6-v1');
select pg_temp.plan6_authority_rejected(format(
  'select private.food_catalog_governance_lock_authority(%L,%L,%L,0,%L)',:'food','taxonomy_assignment','protein_foods','68000000-0000-4000-8000-000000000452'
),'taxonomy key A rejects key B predecessor');
select private.food_catalog_governance_lock_authority(:'food','taxonomy_assignment','protein_foods',0,'68000000-0000-4000-8000-000000000451');

-- P1-R2 Market: exact scope_code required.
insert into public.food_market_assignments(id,food_id,scope_code,relevance_level,assignment_action,policy_version) values
 ('68000000-0000-4000-8000-000000000461',:'food','US','primary','assign','plan6-v1'),
 ('68000000-0000-4000-8000-000000000462',:'food','DE','secondary','assign','plan6-v1');
select pg_temp.plan6_authority_rejected(format(
  'select private.food_catalog_governance_lock_authority(%L,%L,%L,0,%L)',:'food','market_assignment','US','68000000-0000-4000-8000-000000000462'
),'market key A rejects key B predecessor');
select private.food_catalog_governance_lock_authority(:'food','market_assignment','US',0,'68000000-0000-4000-8000-000000000461');

-- P1-R3: outbox execution is trusted Service-principal capability authority, not generic service_role or caller text.
insert into public.food_catalog_governance_operations(operation_id,principal_id,principal_type,capability,command_name,target_food_id,policy_version,reason,semantic_checksum_sha256,result_json,completed_at) values
 ('68000000-0000-4000-8000-000000000501',:'owner_principal','human','food.name.correct','food_catalog_outbox_fixture',:'food','plan6-v1','outbox fixture',repeat('a',64),'{}'::jsonb,clock_timestamp()),
 ('68000000-0000-4000-8000-000000000502',:'owner_principal','human','food.name.correct','food_catalog_outbox_fixture',:'food','plan6-v1','future fixture',repeat('b',64),'{}'::jsonb,clock_timestamp()),
 ('68000000-0000-4000-8000-000000000503',:'owner_principal','human','food.name.correct','food_catalog_outbox_fixture',:'food','plan6-v1','retry fixture',repeat('c',64),'{}'::jsonb,clock_timestamp());
insert into public.food_catalog_governance_outbox(event_id,operation_id,event_type,payload,available_at) values
 ('68000000-0000-4000-8000-000000000501','68000000-0000-4000-8000-000000000501','authority.test','{}'::jsonb,clock_timestamp()),
 ('68000000-0000-4000-8000-000000000502','68000000-0000-4000-8000-000000000502','authority.future','{}'::jsonb,clock_timestamp()+interval '1 hour'),
 ('68000000-0000-4000-8000-000000000503','68000000-0000-4000-8000-000000000503','authority.retry','{}'::jsonb,clock_timestamp());
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role')::text,true);
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300)$$,'generic service_role without trusted Service identity cannot claim');
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','authority-other-service-identity')::text,true);
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300)$$,'unrelated Service principal without delivery capability cannot claim');
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','spoofed-outbox-worker')::text,true);
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300)$$,'spoofed worker identity cannot claim');
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','authority-outbox-worker-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300))->>'leaseToken' as lease_a \gset
reset role;
select pg_temp.plan6_authority_assert((select claim_principal_id=:'worker_principal'::uuid and claim_owner=:'worker_principal' from public.food_catalog_governance_outbox where event_id='68000000-0000-4000-8000-000000000501'),'claim ownership is derived from trusted Service principal');
update public.food_catalog_governance_outbox set lease_expires_at=clock_timestamp()-interval '1 second' where event_id='68000000-0000-4000-8000-000000000501';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','authority-outbox-worker-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300))->>'leaseToken' as lease_b \gset
select pg_temp.plan6_authority_rejected(format('select public.food_catalog_finish_governance_outbox(%L,%L,true,null,0)','68000000-0000-4000-8000-000000000501',:'lease_a'),'stale claim token fails after authorized reclaim');
select public.food_catalog_finish_governance_outbox('68000000-0000-4000-8000-000000000501',:'lease_b',true,null,0);
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000501',300)$$,'Delivered remains terminal');
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000502',300)$$,'available_at is preserved');
select (public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000503',300))->>'leaseToken' as retry_a \gset
select public.food_catalog_finish_governance_outbox('68000000-0000-4000-8000-000000000503',:'retry_a',false,'transient',60);
select pg_temp.plan6_authority_rejected($$select public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000503',300)$$,'retry delay is preserved');
reset role;
update public.food_catalog_governance_outbox set available_at=clock_timestamp()-interval '1 second' where event_id='68000000-0000-4000-8000-000000000503';
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','authority-outbox-worker-identity')::text,true);
select (public.food_catalog_claim_governance_outbox('68000000-0000-4000-8000-000000000503',300))->>'leaseToken' as retry_b \gset
select public.food_catalog_finish_governance_outbox('68000000-0000-4000-8000-000000000503',:'retry_b',true,null,0);
reset role;
select pg_temp.plan6_authority_assert((select status='delivered' and attempt_count=2 from public.food_catalog_governance_outbox where event_id='68000000-0000-4000-8000-000000000503'),'authorized retry/reclaim preserves leased delivery semantics');

-- Multi-valued authority review closure: serving+Name use explicit lineages; barcode/taxonomy/market retain distinct semantic-key heads.
select pg_temp.plan6_authority_assert(
  to_regclass('public.food_catalog_serving_fact_lineages') is not null
  and to_regclass('public.food_catalog_name_fact_lineages') is not null
  and private.food_catalog_governance_authority_fact_matches_key(:'food','barcode_correction',:'gtin_a','68000000-0000-4000-8000-000000000441')
  and private.food_catalog_governance_authority_fact_matches_key(:'food','taxonomy_assignment','protein_foods','68000000-0000-4000-8000-000000000451')
  and private.food_catalog_governance_authority_fact_matches_key(:'food','market_assignment','US','68000000-0000-4000-8000-000000000461'),
  'no equivalent supported multi-valued authority key collapse remains'
);

rollback;
