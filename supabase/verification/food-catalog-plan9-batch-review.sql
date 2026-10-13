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
    or has_function_privilege('PUBLIC',v_function,'execute')
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
