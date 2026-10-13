-- Plan 9: run against a disposable local Supabase after chronological replay.
-- Read-only schema/security assertions; all role-switch tests roll back.
do $test$
declare
  v_function oid;
  v_definition text;
  v_acl text;
begin
  v_function := to_regprocedure('public.food_catalog_review_ingestion_batch_v1(jsonb)');
  if v_function is null then raise exception 'Missing exact Plan 9 review RPC.'; end if;
  select lower(pg_get_functiondef(v_function)),prosecdef::text
    into v_definition,v_acl
    from pg_proc where oid=v_function;
  if v_acl <> 'true' then raise exception 'Review RPC must be SECURITY DEFINER.'; end if;
  if position('set search_path to ''''' in v_definition)=0 then
    raise exception 'Review RPC must fix an empty search_path.';
  end if;
  if has_function_privilege('anon',v_function,'execute')
    or has_function_privilege('service_role',v_function,'execute')
    or not has_function_privilege('authenticated',v_function,'execute')
  then
    raise exception 'Plan 9 RPC violates human-only EXECUTE privileges.';
  end if;
  if has_table_privilege('authenticated','public.food_ingestion_batches','UPDATE') then
    raise exception 'Authenticated callers must never directly UPDATE batch review state.';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.food_catalog_governance_capability_assignments'::regclass
      and contype='c'
      and position('food.ingestion.review' in pg_get_constraintdef(oid))>0
  ) then
    raise exception 'Missing narrow human review capability grant constraint.';
  end if;
  for v_acl in select unnest(array[
    'private.food_catalog_governance_principal_for_user()',
    'private.food_catalog_governance_assert_capability(uuid,text)',
    'private.food_catalog_governance_begin_operation(uuid,uuid,text,text,uuid,uuid,text,text,jsonb)',
    'private.food_catalog_governance_finish_operation(uuid,uuid,uuid,uuid[],jsonb,text,jsonb,text)'
  ]) loop
    if to_regprocedure(v_acl) is null then
      raise exception 'Missing protected governance dependency: %',v_acl;
    end if;
  end loop;
  for v_acl in select unnest(array[
    'food_ingestion_batches','food_ingestion_runs',
    'food_ingestion_reconciliations','food_catalog_governance_audit_events'
  ]) loop
    if not exists(
      select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname=v_acl and c.relrowsecurity
    ) then raise exception 'Required ingestion/governance table RLS is missing: %',v_acl; end if;
  end loop;
  if position('run.execution_mode = ''dry_run''' in v_definition)=0
    or position('run.status = ''completed''' in v_definition)=0
    or position('for update' in v_definition)=0
    or position('review_state = v_expected_state' in v_definition)=0
  then raise exception 'Plan 9 review function has lost dry-run/CAS guards.'; end if;
end
$test$;

begin;
set local role service_role;
do $test$
begin
  begin
    perform public.food_catalog_review_ingestion_batch_v1('{}'::jsonb);
    raise exception 'Service-role human batch review invocation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end
$test$;
rollback;

begin;
set local role anon;
do $test$
begin
  begin
    perform public.food_catalog_review_ingestion_batch_v1('{}'::jsonb);
    raise exception 'Anonymous human batch review invocation unexpectedly succeeded.';
  exception when insufficient_privilege then null;
  end;
end
$test$;
rollback;


-- Rollback-only behavioural and concurrency/CAS integration fixtures. The actor is a
-- local Auth user, not a forged caller-supplied principal ID. Never run on Production.
begin;
insert into auth.users(id,aud,role,email,encrypted_password,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('92000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'plan9-review-owner@example.test','','{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,now(),now());

insert into public.food_catalog_governance_principals
  (id,principal_type,subject_id,human_user_id,role_class,active)
values
  ('92000000-0000-4000-8000-000000000002','human',
   '92000000-0000-4000-8000-000000000001',
   '92000000-0000-4000-8000-000000000001','owner',true);
insert into public.food_catalog_governance_capability_assignments
  (principal_id,capability,granted_by_principal_id,reason)
values
  ('92000000-0000-4000-8000-000000000002','food.ingestion.review',
   '92000000-0000-4000-8000-000000000002','Plan 9 disposable human approval regression'),
  ('92000000-0000-4000-8000-000000000002','food.governance.manage_principals',
   '92000000-0000-4000-8000-000000000002','Plan 9 disposable recovery owner');

insert into public.food_ingestion_batches(
  id,provider,dataset_name,source_version,source_release_date,license_name,
  license_reference,source_reference,source_checksum_sha256,
  importer_version,config_checksum_sha256,manifest_content_checksum_sha256,
  semantic_identity_checksum_sha256,input_count,accepted_count,rejected_count,
  matched_count,created_count,possible_duplicate_count,expected_quarantine_count
)
values
  ('92000000-0000-4000-8000-000000000010','USDA_FDC','FoundationFoods',
   '2026-04-30','2026-04-30','CC0 1.0',
   'https://creativecommons.org/publicdomain/zero/1.0/',
   'https://fdc.nal.usda.gov/fdc-datasets/replay.zip',repeat('a',64),
   'plan8-1a0-v2',repeat('b',64),repeat('c',64),repeat('d',64),
   0,0,0,0,0,0,0),
  ('92000000-0000-4000-8000-000000000020','USDA_FDC','FoundationFoods',
   '2026-04-30','2026-04-30','CC0 1.0',
   'https://creativecommons.org/publicdomain/zero/1.0/',
   'https://fdc.nal.usda.gov/fdc-datasets/replay.zip',repeat('a',64),
   'plan8-1a0-v2',repeat('b',64),repeat('e',64),repeat('f',64),
   0,0,0,0,0,0,0);

insert into public.food_ingestion_runs(
  id,batch_id,execution_mode,attempt_number,status,started_at,completed_at,
  manifest_content_checksum_sha256,observed_input_count,observed_accepted_count,
  observed_rejected_count,observed_created_count,observed_matched_count,
  observed_possible_duplicate_count,observed_quarantine_count
)
values
  ('92000000-0000-4000-8000-000000000011',
   '92000000-0000-4000-8000-000000000010','dry_run',1,
   'completed',now(),now(),repeat('c',64),0,0,0,0,0,0,0);
insert into public.food_ingestion_reconciliations(
  id,run_id,batch_id,manifest_content_checksum_sha256,
  semantic_identity_checksum_sha256,expected_counts,observed_counts,mismatch_codes,reconciled
)
values
  ('92000000-0000-4000-8000-000000000012',
   '92000000-0000-4000-8000-000000000011',
   '92000000-0000-4000-8000-000000000010',
   repeat('c',64),repeat('d',64),
   '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantined":0}'::jsonb,
   '{"input":0,"accepted":0,"rejected":0,"matched":0,"created":0,"possibleDuplicate":0,"quarantined":0}'::jsonb,
   '{}'::text[],true);

set local role authenticated;
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
do $test$
declare
  v_cmd jsonb := jsonb_build_object(
    'operationId','92000000-0000-4000-8000-000000000030',
    'batchId','92000000-0000-4000-8000-000000000010',
    'decision','review','expectedReviewState','prepared',
    'manifestContentChecksumSha256',repeat('c',64),
    'semanticIdentityChecksumSha256',repeat('d',64),
    'source',jsonb_build_object(
      'provider','USDA_FDC','dataset','FoundationFoods','sourceVersion','2026-04-30',
      'sourceReleaseDate','2026-04-30','licenseName','CC0 1.0',
      'licenseReference','https://creativecommons.org/publicdomain/zero/1.0/',
      'sourceReference','https://fdc.nal.usda.gov/fdc-datasets/replay.zip',
      'sourceChecksumSha256',repeat('a',64),
      'importerVersion','plan8-1a0-v2','configChecksumSha256',repeat('b',64)),
    'expectedMutations',jsonb_build_object(
      'input',0,'accepted',0,'rejected',0,'matched',0,
      'created',0,'possibleDuplicate',0,'quarantined',0),
    'reconciliationId','92000000-0000-4000-8000-000000000012',
    'reason','Plan 9 disposable test review');
  v_result jsonb;
begin
  begin
    perform public.food_catalog_review_ingestion_batch_v1(
      v_cmd || jsonb_build_object('operationId','92000000-0000-4000-8000-000000000031',
       'manifestContentChecksumSha256',repeat('0',64)));
    raise exception 'Manifest-drift review was not rejected.';
  exception when check_violation then null;
  end;

  begin
    perform public.food_catalog_review_ingestion_batch_v1(
      v_cmd || jsonb_build_object('operationId','92000000-0000-4000-8000-000000000032',
        'batchId','92000000-0000-4000-8000-000000000020',
        'manifestContentChecksumSha256',repeat('e',64),
        'semanticIdentityChecksumSha256',repeat('f',64),
        'reconciliationId','92000000-0000-4000-8000-000000000012'));
    raise exception 'Wrong-batch reconciliation was not rejected.';
  exception when check_violation then null;
  end;

  v_result := public.food_catalog_review_ingestion_batch_v1(v_cmd);
  if v_result->>'reviewState' <> 'reviewed' then
    raise exception 'Prepared->reviewed transition was not successful.';
  end if;
  if public.food_catalog_review_ingestion_batch_v1(v_cmd) is distinct from v_result then
    raise exception 'Identical review operation replay returned a different result.';
  end if;
  begin
    perform public.food_catalog_review_ingestion_batch_v1(
      v_cmd || jsonb_build_object('reason','Different immutable operation semantics'));
    raise exception 'Operation-ID reuse with different semantics succeeded.';
  exception when unique_violation then null;
  end;

  -- Regression: SQL NULL is not a valid action; it must not silently become
  -- the ELSE/reject transition, even with a legitimate reviewer and exact batch.
  begin
    perform public.food_catalog_review_ingestion_batch_v1(
      v_cmd || jsonb_build_object(
        'operationId','92000000-0000-4000-8000-000000000039',
        'decision',null,'expectedReviewState','reviewed'));
    raise exception 'NULL decision unexpectedly accepted as a rejection.';
  exception when invalid_parameter_value then null;
  end;
  if (select review_state from public.food_ingestion_batches
       where id='92000000-0000-4000-8000-000000000010') <> 'reviewed' then
    raise exception 'NULL decision mutated review state.';
  end if;

  v_cmd := v_cmd || jsonb_build_object(
    'operationId','92000000-0000-4000-8000-000000000033',
    'decision','approve','expectedReviewState','reviewed',
    'reason','Plan 9 disposable approval after exact database dry run',
    'authorizationReference','PLAN9-DISPOSABLE-APPROVAL');
  v_result := public.food_catalog_review_ingestion_batch_v1(v_cmd);
  if v_result->>'reviewState' <> 'approved' then
    raise exception 'Reviewed->approved transition did not succeed.';
  end if;
  if public.food_catalog_review_ingestion_batch_v1(v_cmd) is distinct from v_result then
    raise exception 'Identical approval operation replay returned a different result.';
  end if;
  begin
    perform public.food_catalog_review_ingestion_batch_v1(
      v_cmd || jsonb_build_object(
        'operationId','92000000-0000-4000-8000-000000000034',
        'decision','reject'));
    raise exception 'Stale/CAS review after approval unexpectedly succeeded.';
  exception when serialization_failure then null;
  end;
end
$test$;
reset role;

do $test$
begin
  if (select review_state from public.food_ingestion_batches
      where id='92000000-0000-4000-8000-000000000010') <> 'approved'
    or (select reviewed_at is null or approved_at is null or approval_reference is null
        from public.food_ingestion_batches
        where id='92000000-0000-4000-8000-000000000010')
    or (select count(*) from public.food_catalog_governance_audit_events
        where command_name='food_catalog_review_ingestion_batch_v1') <> 2
    or (select count(*) from public.food_catalog_governance_operations
        where command_name='food_catalog_review_ingestion_batch_v1'
          and completed_at is not null) <> 2
  then raise exception 'Approval/audit/CAS verification failed.'; end if;
end
$test$;
rollback;
