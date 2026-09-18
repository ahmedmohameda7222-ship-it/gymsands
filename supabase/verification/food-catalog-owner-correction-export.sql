\set ON_ERROR_STOP on

begin;

create or replace function pg_temp.owner_correction_export_assert(p_condition boolean,p_message text)
returns void language plpgsql as $$
begin
  if not coalesce(p_condition,false) then
    raise exception 'Plan 7 owner correction export assertion failed: %',p_message;
  end if;
end
$$;

create or replace function pg_temp.owner_correction_export_rejected(p_sql text,p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    raise exception 'Plan 7 owner correction export expected rejection did not occur: %',p_message;
  exception when others then
    if sqlerrm like 'Plan 7 owner correction export expected rejection did not occur:%' then raise; end if;
  end;
end
$$;

grant execute on function pg_temp.owner_correction_export_assert(boolean,text) to public;
grant execute on function pg_temp.owner_correction_export_rejected(text,text) to public;

-- RED guard: this verification is intentionally useful before the forward migration.
select pg_temp.owner_correction_export_assert(
  to_regprocedure('public.food_catalog_export_owner_personal_overrides_v1()') is not null,
  'public.food_catalog_export_owner_personal_overrides_v1() is missing'
);
select pg_temp.owner_correction_export_assert(
  (
    select count(*)=1 and bool_and(p.pronargs=0) and bool_and(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='food_catalog_export_owner_personal_overrides_v1'
  ),
  'personal override RPC must exist as one zero-argument SECURITY DEFINER function'
);
select pg_temp.owner_correction_export_assert(
  has_function_privilege('authenticated','public.food_catalog_export_owner_personal_overrides_v1()','EXECUTE'),
  'authenticated must have personal override RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_function_privilege('anon','public.food_catalog_export_owner_personal_overrides_v1()','EXECUTE'),
  'anon unexpectedly has personal override RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_function_privilege('service_role','public.food_catalog_export_owner_personal_overrides_v1()','EXECUTE'),
  'service_role unexpectedly has personal override RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where n.nspname='public'
      and p.proname='food_catalog_export_owner_personal_overrides_v1'
      and p.pronargs=0
      and acl.grantee=0
      and acl.privilege_type='EXECUTE'
  ),
  'PUBLIC unexpectedly has personal override RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_table_privilege('anon','public.food_personal_override_revisions','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_override_revisions','SELECT')
  and not has_table_privilege('service_role','public.food_personal_override_revisions','SELECT')
  and not has_table_privilege('anon','public.food_personal_overrides','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_overrides','SELECT')
  and not has_table_privilege('service_role','public.food_personal_overrides','SELECT')
  and not has_table_privilege('anon','public.food_personal_override_operations','SELECT')
  and not has_table_privilege('authenticated','public.food_personal_override_operations','SELECT')
  and not has_table_privilege('service_role','public.food_personal_override_operations','SELECT'),
  'an application role unexpectedly has direct personal-override SELECT'
);
select pg_temp.owner_correction_export_assert(
  (
    select position('private.food_catalog_governance_require_active_member_account' in pg_get_functiondef(p.oid))>0
      and position('public.food_personal_override_revisions' in pg_get_functiondef(p.oid))>0
      and position('public.food_personal_overrides' in pg_get_functiondef(p.oid))>0
      and position('public.food_personal_override_operations' in pg_get_functiondef(p.oid))>0
      and position('personal_food_override_revisions' in pg_get_functiondef(p.oid))>0
      and position('personal_food_overrides' in pg_get_functiondef(p.oid))>0
      and position('personal_food_override_operations' in pg_get_functiondef(p.oid))>0
      and position('INSERT INTO ' in upper(pg_get_functiondef(p.oid)))=0
      and position('UPDATE ' in upper(pg_get_functiondef(p.oid)))=0
      and position('DELETE FROM ' in upper(pg_get_functiondef(p.oid)))=0
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='food_catalog_export_owner_personal_overrides_v1' and p.pronargs=0
  ),
  'personal override RPC definition escaped the owner-only read contract'
);

select pg_temp.owner_correction_export_assert(
  to_regprocedure('public.food_catalog_export_owner_correction_report_payloads_v1()') is not null,
  'public.food_catalog_export_owner_correction_report_payloads_v1() is missing'
);

select pg_temp.owner_correction_export_assert(
  (
    select count(*)=1 and bool_and(p.pronargs=0) and bool_and(p.prosecdef)
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='food_catalog_export_owner_correction_report_payloads_v1'
  ),
  'RPC must exist as one zero-argument SECURITY DEFINER function'
);
select pg_temp.owner_correction_export_assert(
  has_function_privilege('authenticated','public.food_catalog_export_owner_correction_report_payloads_v1()','EXECUTE'),
  'authenticated must have RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_function_privilege('anon','public.food_catalog_export_owner_correction_report_payloads_v1()','EXECUTE'),
  'anon unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_function_privilege('service_role','public.food_catalog_export_owner_correction_report_payloads_v1()','EXECUTE'),
  'service_role unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not exists(
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl
    where n.nspname='public'
      and p.proname='food_catalog_export_owner_correction_report_payloads_v1'
      and p.pronargs=0
      and acl.grantee=0
      and acl.privilege_type='EXECUTE'
  ),
  'PUBLIC unexpectedly has RPC EXECUTE'
);
select pg_temp.owner_correction_export_assert(
  not has_table_privilege('anon','public.food_catalog_correction_report_member_payloads','SELECT')
  and not has_table_privilege('authenticated','public.food_catalog_correction_report_member_payloads','SELECT')
  and not has_table_privilege('service_role','public.food_catalog_correction_report_member_payloads','SELECT'),
  'an application role unexpectedly has direct member-payload SELECT'
);
select pg_temp.owner_correction_export_assert(
  (
    select position('private.food_catalog_governance_require_active_member_account' in pg_get_functiondef(p.oid))>0
      and position('public.food_catalog_correction_report_member_payloads' in pg_get_functiondef(p.oid))>0
      and position('public.food_catalog_correction_cases' in pg_get_functiondef(p.oid))=0
      and position('public.food_catalog_correction_reports' in pg_get_functiondef(p.oid))=0
      and position('EXECUTE ' in upper(pg_get_functiondef(p.oid)))=0
      and position('INSERT INTO ' in upper(pg_get_functiondef(p.oid)))=0
      and position('UPDATE ' in upper(pg_get_functiondef(p.oid)))=0
      and position('DELETE FROM ' in upper(pg_get_functiondef(p.oid)))=0
      and regexp_replace(lower(pg_get_functiondef(p.oid)),'[[:space:]]+',' ','g') like '%where member_payload.reporter_user_id = v_user%'
      and regexp_replace(lower(pg_get_functiondef(p.oid)),'[[:space:]]+',' ','g') like '%order by member_payload.created_at asc, member_payload.report_id asc%'
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='food_catalog_export_owner_correction_report_payloads_v1' and p.pronargs=0
  ),
  'RPC definition escaped the owner-only read contract'
);

\set owner_a '70000000-0000-4000-8000-000000000001'
\set owner_b '70000000-0000-4000-8000-000000000002'
\set food_a '70000000-0000-4000-8000-000000000101'
\set food_b '70000000-0000-4000-8000-000000000102'
\set case_a '70000000-0000-4000-8000-000000000201'
\set case_b '70000000-0000-4000-8000-000000000202'
\set report_a '70000000-0000-4000-8000-000000000301'
\set report_b '70000000-0000-4000-8000-000000000302'
\set revision_a '70000000-0000-4000-8000-000000000401'
\set revision_b '70000000-0000-4000-8000-000000000402'
\set operation_a '70000000-0000-4000-8000-000000000501'
\set operation_b '70000000-0000-4000-8000-000000000502'

insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values
(:'owner_a','authenticated','authenticated','plan7-owner-export-a@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp()),
(:'owner_b','authenticated','authenticated','plan7-owner-export-b@example.test','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,clock_timestamp(),clock_timestamp());

insert into public.account_access_states(user_id,state,reason_code,disabled_at) values
(:'owner_a','active','plan7-owner-export-fixture',null),
(:'owner_b','active','plan7-owner-export-fixture',null)
on conflict(user_id) do update set state='active',reason_code='plan7-owner-export-fixture',disabled_at=null,updated_at=clock_timestamp();

insert into public.food_items(id,food_name,is_global,lifecycle_status) values
(:'food_a','Plan 7 owner export fixture A',true,'active'),
(:'food_b','Plan 7 owner export fixture B',true,'active');

insert into public.food_catalog_correction_cases(
  id,food_id,category,claim_key,issue_key,state,state_revision,policy_version,created_at,updated_at
) values
(:'case_a',:'food_a','other','owner-export-a','plan7-owner-export-a','reported',0,'plan6-v1','2026-09-15 20:40:00+00','2026-09-15 20:40:00+00'),
(:'case_b',:'food_b','other','owner-export-b','plan7-owner-export-b','reported',0,'plan6-v1','2026-09-15 20:41:00+00','2026-09-15 20:41:00+00');

insert into public.food_catalog_correction_reports(id,case_id,created_at) values
(:'report_a',:'case_a','2026-09-15 20:45:00.123456+00'),
(:'report_b',:'case_b','2026-09-15 20:46:00.654321+00');

insert into public.food_catalog_correction_report_member_payloads(
  report_id,reporter_user_id,claim_text,description,evidence,created_at
) values
(:'report_a',:'owner_a','Owner A exact claim','Owner A exact description','{"owner":"A","nested":{"exact":true},"ordinal":1}'::jsonb,'2026-09-15 20:45:00.123456+00'),
(:'report_b',:'owner_b','Owner B exact claim','Owner B exact description','{"owner":"B","nested":{"exact":true},"ordinal":2}'::jsonb,'2026-09-15 20:46:00.654321+00');

insert into public.food_personal_override_revisions(
  id,user_id,food_id,revision_number,nutrition_override,serving_label,note,is_deleted,created_at
) values
(:'revision_a',:'owner_a',:'food_a',1,'{"calories":111,"protein_g":22}'::jsonb,'Owner A serving','Owner A note',false,'2026-09-15 20:47:00.111111+00'),
(:'revision_b',:'owner_b',:'food_b',1,'{"calories":222,"protein_g":33}'::jsonb,'Owner B serving','Owner B note',false,'2026-09-15 20:48:00.222222+00');

insert into public.food_personal_overrides(
  user_id,food_id,current_revision_id,pointer_revision,updated_at
) values
(:'owner_a',:'food_a',:'revision_a',1,'2026-09-15 20:49:00.111111+00'),
(:'owner_b',:'food_b',:'revision_b',1,'2026-09-15 20:50:00.222222+00');

insert into public.food_personal_override_operations(
  user_id,operation_id,food_id,command_name,semantic_checksum_sha256,result_json,created_at,completed_at
) values
(:'owner_a',:'operation_a',:'food_a','set',repeat('a',64),'{"owner":"A","result":"exact"}'::jsonb,'2026-09-15 20:51:00.111111+00','2026-09-15 20:51:01.111111+00'),
(:'owner_b',:'operation_b',:'food_b','set',repeat('b',64),'{"owner":"B","result":"exact"}'::jsonb,'2026-09-15 20:52:00.222222+00','2026-09-15 20:52:01.222222+00');

create or replace function pg_temp.owner_personal_override_export_exact(
  p_expected_owner uuid,p_forbidden_owner uuid,p_expected_food uuid,
  p_expected_revision uuid,p_expected_operation uuid
)
returns void language plpgsql as $
declare
  v_payload jsonb;
  v_revisions jsonb;
  v_overrides jsonb;
  v_operations jsonb;
begin
  v_payload:=public.food_catalog_export_owner_personal_overrides_v1();
  v_revisions:=v_payload->'personal_food_override_revisions';
  v_overrides:=v_payload->'personal_food_overrides';
  v_operations:=v_payload->'personal_food_override_operations';

  if jsonb_typeof(v_payload)<>'object'
    or jsonb_typeof(v_revisions)<>'array'
    or jsonb_typeof(v_overrides)<>'array'
    or jsonb_typeof(v_operations)<>'array'
    or jsonb_array_length(v_revisions)<>1
    or jsonb_array_length(v_overrides)<>1
    or jsonb_array_length(v_operations)<>1 then
    raise exception 'Plan 7 personal override export did not return exactly one row per owner family';
  end if;

  if (v_revisions->0->>'id')::uuid is distinct from p_expected_revision
    or (v_revisions->0->>'user_id')::uuid is distinct from p_expected_owner
    or (v_revisions->0->>'food_id')::uuid is distinct from p_expected_food
    or (v_overrides->0->>'user_id')::uuid is distinct from p_expected_owner
    or (v_overrides->0->>'food_id')::uuid is distinct from p_expected_food
    or (v_overrides->0->>'current_revision_id')::uuid is distinct from p_expected_revision
    or (v_operations->0->>'user_id')::uuid is distinct from p_expected_owner
    or (v_operations->0->>'food_id')::uuid is distinct from p_expected_food
    or (v_operations->0->>'operation_id')::uuid is distinct from p_expected_operation then
    raise exception 'Plan 7 personal override export changed or omitted an owner field';
  end if;

  if exists(select 1 from jsonb_array_elements(v_revisions) item where (item->>'user_id')::uuid=p_forbidden_owner)
    or exists(select 1 from jsonb_array_elements(v_overrides) item where (item->>'user_id')::uuid=p_forbidden_owner)
    or exists(select 1 from jsonb_array_elements(v_operations) item where (item->>'user_id')::uuid=p_forbidden_owner) then
    raise exception 'Plan 7 personal override export leaked a cross-owner row';
  end if;
end
$;
grant execute on function pg_temp.owner_personal_override_export_exact(uuid,uuid,uuid,uuid,uuid) to authenticated;

create or replace function pg_temp.owner_correction_export_exact(
  p_expected_report uuid,p_forbidden_report uuid,p_expected_owner uuid,p_expected_claim text,
  p_expected_description text,p_expected_evidence jsonb,p_expected_created_at timestamptz
)
returns void language plpgsql as $$
declare
  v_count bigint;
  v_row record;
begin
  select count(*) into v_count from public.food_catalog_export_owner_correction_report_payloads_v1();
  if v_count<>1 then
    raise exception 'Plan 7 owner correction export expected exactly one owner row, got %',v_count;
  end if;
  select * into strict v_row from public.food_catalog_export_owner_correction_report_payloads_v1();
  if v_row.report_id is distinct from p_expected_report
    or v_row.reporter_user_id is distinct from p_expected_owner
    or v_row.claim_text is distinct from p_expected_claim
    or v_row.description is distinct from p_expected_description
    or v_row.evidence is distinct from p_expected_evidence
    or v_row.created_at is distinct from p_expected_created_at then
    raise exception 'Plan 7 owner correction export changed an owner payload field';
  end if;
  if exists(
    select 1 from public.food_catalog_export_owner_correction_report_payloads_v1()
    where report_id=p_forbidden_report
  ) then
    raise exception 'Plan 7 owner correction export leaked a cross-owner report';
  end if;
end
$$;
grant execute on function pg_temp.owner_correction_export_exact(uuid,uuid,uuid,text,text,jsonb,timestamptz) to authenticated;

-- Owner A sees only A and receives all six fields verbatim.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_personal_override_export_exact(
  :'owner_a',:'owner_b',:'food_a',:'revision_a',:'operation_a'
);
select pg_temp.owner_correction_export_exact(
  :'report_a',:'report_b',:'owner_a','Owner A exact claim','Owner A exact description',
  '{"owner":"A","nested":{"exact":true},"ordinal":1}'::jsonb,'2026-09-15 20:45:00.123456+00'::timestamptz
);
reset role;

-- Owner B sees only B and receives all six fields verbatim.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_b',true);
select pg_temp.owner_personal_override_export_exact(
  :'owner_b',:'owner_a',:'food_b',:'revision_b',:'operation_b'
);
select pg_temp.owner_correction_export_exact(
  :'report_b',:'report_a',:'owner_b','Owner B exact claim','Owner B exact description',
  '{"owner":"B","nested":{"exact":true},"ordinal":2}'::jsonb,'2026-09-15 20:46:00.654321+00'::timestamptz
);
reset role;

-- No valid owner identity must fail closed; there is no owner-id argument to substitute.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.owner_correction_export_rejected(
  'select public.food_catalog_export_owner_personal_overrides_v1()',
  'authenticated personal override caller without owner identity'
);
select pg_temp.owner_correction_export_rejected(
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'authenticated caller without owner identity'
);
reset role;

-- EXECUTE is authenticated-only in practice, not only in catalog ACLs.
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.owner_correction_export_rejected(
  'select public.food_catalog_export_owner_personal_overrides_v1()',
  'anon personal override RPC execution'
);
select pg_temp.owner_correction_export_rejected(
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'anon RPC execution'
);
select pg_temp.owner_correction_export_rejected(
  'select id from public.food_personal_override_revisions limit 1',
  'anon direct personal-override revision SELECT'
);
select pg_temp.owner_correction_export_rejected(
  'select report_id from public.food_catalog_correction_report_member_payloads limit 1',
  'anon direct member-payload SELECT'
);
reset role;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_correction_export_rejected(
  'select public.food_catalog_export_owner_personal_overrides_v1()',
  'service_role personal override RPC execution'
);
select pg_temp.owner_correction_export_rejected(
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'service_role RPC execution'
);
select pg_temp.owner_correction_export_rejected(
  'select id from public.food_personal_override_revisions limit 1',
  'service_role direct personal-override revision SELECT'
);
select pg_temp.owner_correction_export_rejected(
  'select report_id from public.food_catalog_correction_report_member_payloads limit 1',
  'service_role direct member-payload SELECT'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_a',true);
select pg_temp.owner_correction_export_rejected(
  'select id from public.food_personal_override_revisions limit 1',
  'authenticated direct personal-override revision SELECT'
);
select pg_temp.owner_correction_export_rejected(
  'select food_id from public.food_personal_overrides limit 1',
  'authenticated direct personal-override pointer SELECT'
);
select pg_temp.owner_correction_export_rejected(
  'select operation_id from public.food_personal_override_operations limit 1',
  'authenticated direct personal-override operation SELECT'
);
select pg_temp.owner_correction_export_rejected(
  'select report_id from public.food_catalog_correction_report_member_payloads limit 1',
  'authenticated direct member-payload SELECT'
);
reset role;

rollback;
