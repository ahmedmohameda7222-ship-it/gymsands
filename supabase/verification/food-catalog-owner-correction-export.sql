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
select pg_temp.owner_correction_export_exact(
  :'report_a',:'report_b',:'owner_a','Owner A exact claim','Owner A exact description',
  '{"owner":"A","nested":{"exact":true},"ordinal":1}'::jsonb,'2026-09-15 20:45:00.123456+00'::timestamptz
);
reset role;

-- Owner B sees only B and receives all six fields verbatim.
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',:'owner_b',true);
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
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'authenticated caller without owner identity'
);
reset role;

-- EXECUTE is authenticated-only in practice, not only in catalog ACLs.
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select set_config('request.jwt.claim.sub','',true);
select pg_temp.owner_correction_export_rejected(
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'anon RPC execution'
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
  'select * from public.food_catalog_export_owner_correction_report_payloads_v1()',
  'service_role RPC execution'
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
  'select report_id from public.food_catalog_correction_report_member_payloads limit 1',
  'authenticated direct member-payload SELECT'
);
reset role;

rollback;
