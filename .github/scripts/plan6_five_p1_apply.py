from pathlib import Path

MIGRATION = Path("supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql")
RUNNER = Path("scripts/run-database-verification.mjs")
CONCURRENCY = Path("scripts/test-food-catalog-governance-plan6-concurrency.mjs")
DOC = Path("docs/architecture/food-catalog-governance-control-plane.md")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {count}")
    return text.replace(old, new, 1)


def function_span(text: str, name: str) -> tuple[int, int]:
    marker = f"create or replace function {name}("
    start = text.lower().find(marker.lower())
    if start < 0:
        raise RuntimeError(f"function not found: {name}")
    closing = "\n$function$;"
    end = text.find(closing, start)
    if end < 0:
        raise RuntimeError(f"function closing marker not found: {name}")
    return start, end + len(closing)


def get_function(text: str, name: str) -> str:
    start, end = function_span(text, name)
    return text[start:end]


def replace_function(text: str, name: str, replacement: str) -> str:
    start, end = function_span(text, name)
    return text[:start] + replacement.strip() + text[end:]


sql = MIGRATION.read_text()

helpers_marker = "PLAN6_FIVE_P1_HARDENED"
if helpers_marker not in sql:
    helper_anchor = "create or replace function private.food_catalog_gtin_is_valid(p_gtin text)"
    helpers = r'''
-- PLAN6_FIVE_P1_HARDENED: shared cross-plan serialization and recovery/privacy locks.
create or replace function private.food_catalog_lock_gtin_authority(p_gtin text)
returns void language plpgsql security definer set search_path='' as $function$
declare v_gtin text:=btrim(coalesce(p_gtin,''));
begin
  if length(v_gtin)=0 then raise exception 'GTIN serialization key is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-catalog-gtin:'||v_gtin,0));
end
$function$;

create or replace function private.food_catalog_serialize_gtin_write()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_old text; v_new text;
begin
  if tg_op='INSERT' then
    perform private.food_catalog_lock_gtin_authority(new.gtin);
    return new;
  elsif tg_op='DELETE' then
    perform private.food_catalog_lock_gtin_authority(old.gtin);
    return old;
  end if;
  v_old:=btrim(coalesce(old.gtin,''));
  v_new:=btrim(coalesce(new.gtin,''));
  if v_old=v_new then
    perform private.food_catalog_lock_gtin_authority(v_new);
  else
    perform private.food_catalog_lock_gtin_authority(least(v_old,v_new));
    perform private.food_catalog_lock_gtin_authority(greatest(v_old,v_new));
  end if;
  return new;
end
$function$;

drop trigger if exists food_barcodes_global_gtin_serialization on public.food_barcodes;
create trigger food_barcodes_global_gtin_serialization
before insert or update or delete on public.food_barcodes
for each row execute function private.food_catalog_serialize_gtin_write();

create or replace function private.food_catalog_governance_lock_recovery_set()
returns void language plpgsql security definer set search_path='' as $function$
begin
  perform pg_advisory_xact_lock(hashtextextended('food-catalog-governance-recovery-set',0));
end
$function$;

create or replace function private.food_catalog_governance_assert_recovery_exists()
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_principals p
    join public.food_catalog_governance_capability_assignments a
      on a.principal_id=p.id
     and a.capability='food.governance.manage_principals'
     and a.revoked_at is null
    where p.principal_type='human'
      and p.role_class='owner'
      and p.active
      and p.revoked_at is null
  ) then
    raise exception 'At least one active human Owner recovery principal must remain.' using errcode='23514';
  end if;
end
$function$;

create or replace function private.food_catalog_lock_food_pair(p_food_a uuid,p_food_b uuid)
returns void language plpgsql security definer set search_path='' as $function$
declare v_id uuid; v_count integer:=0;
begin
  if p_food_a is null or p_food_b is null or p_food_a=p_food_b then
    raise exception 'Distinct Food pair is required for identity topology locking.' using errcode='22023';
  end if;
  for v_id in
    select id from public.food_items where id in (p_food_a,p_food_b) order by id
  loop
    perform 1 from public.food_items where id=v_id for update;
    v_count:=v_count+1;
  end loop;
  if v_count<>2 then raise exception 'Food identity topology member not found.' using errcode='23503'; end if;
end
$function$;

create or replace function private.food_catalog_personal_override_require_writable_account(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'Personal Override account identity mismatch.' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:'||p_user_id::text,0));
  perform 1
  from public.account_access_states
  where user_id=p_user_id and state='active' and disabled_at is null
  for share;
  if not found then
    raise exception 'Personal Override writes require an active, non-disabled account.' using errcode='42501';
  end if;
end
$function$;

'''
    sql = replace_once(sql, helper_anchor, helpers + helper_anchor, "five-P1 helper insertion")

sql = replace_function(sql, "private.food_catalog_personal_override_begin_operation", r'''
create or replace function private.food_catalog_personal_override_begin_operation(p_user_id uuid,p_operation_id uuid,p_food_id uuid,p_command_name text,p_semantics jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_checksum text; v_existing public.food_personal_override_operations%rowtype;
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Personal Override helper identity mismatch.' using errcode='42501'; end if;
  if p_operation_id is null then raise exception 'Personal override operation ID is required.' using errcode='22023'; end if;
  v_checksum:=private.food_catalog_governance_semantic_checksum(p_semantics);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text||'|'||p_operation_id::text,0));
  select * into v_existing from public.food_personal_override_operations where user_id=p_user_id and operation_id=p_operation_id;
  if found then
    if v_existing.food_id<>p_food_id or v_existing.command_name<>p_command_name or v_existing.semantic_checksum_sha256<>v_checksum then
      raise exception 'Personal override operation ID was reused with different semantics.' using errcode='23505';
    end if;
    if v_existing.completed_at is null then raise exception 'Personal override operation is already in progress.' using errcode='40001'; end if;
    return v_existing.result_json;
  end if;
  insert into public.food_personal_override_operations(user_id,operation_id,food_id,command_name,semantic_checksum_sha256)
  values(p_user_id,p_operation_id,p_food_id,p_command_name,v_checksum);
  return null;
end
$function$;
''')

sql = replace_function(sql, "private.food_catalog_personal_override_finish_operation", r'''
create or replace function private.food_catalog_personal_override_finish_operation(p_user_id uuid,p_operation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then raise exception 'Personal Override helper identity mismatch.' using errcode='42501'; end if;
  update public.food_personal_override_operations set result_json=p_result,completed_at=clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id and completed_at is null;
  if not found then raise exception 'Personal override operation cannot be completed.' using errcode='40001'; end if;
  return p_result;
end
$function$;
''')

# Serialize every recovery-set mutation on one lock, then assert the committed postcondition before audit/outbox completion.
for fn_name in ["public.food_catalog_manage_governance_principal", "public.food_catalog_revoke_governance_capability"]:
    fn = get_function(sql, fn_name)
    if "food_catalog_governance_lock_recovery_set" not in fn:
        anchor = "\n  v_replay:=private.food_catalog_governance_begin_operation"
        if anchor not in fn:
            raise RuntimeError(f"{fn_name}: begin-operation anchor missing")
        fn = fn.replace(anchor, "\n  perform private.food_catalog_governance_lock_recovery_set();" + anchor, 1)
    if "food_catalog_governance_assert_recovery_exists" not in fn:
        anchor = "\n  v_result:=jsonb_build_object"
        if anchor not in fn:
            raise RuntimeError(f"{fn_name}: result anchor missing")
        fn = fn.replace(anchor, "\n  perform private.food_catalog_governance_assert_recovery_exists();" + anchor, 1)
    sql = replace_function(sql, fn_name, fn)

sql = replace_function(sql, "public.food_catalog_apply_barcode_correction", r'''
create or replace function public.food_catalog_apply_barcode_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_gtin text,p_action text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text:=btrim(p_gtin); v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text; v_effective uuid; v_effective_food uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if not private.food_catalog_gtin_is_valid(v_key) then raise exception 'GTIN fails supported shape or GS1 Mod-10 validation.' using errcode='23514'; end if;
  if p_action not in ('assign','remove') then raise exception 'Invalid barcode correction action.' using errcode='22023'; end if;
  perform private.food_catalog_lock_gtin_authority(v_key);
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.barcode.correct','food_catalog_apply_barcode_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'barcode_correction',v_key,p_reason,jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'gtin',v_key,'action',p_action,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  if p_source_record_id is not null and not exists(select 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id) then raise exception 'Barcode source record belongs to a different Food.' using errcode='23514'; end if;
  if p_action='assign' then
    if exists(select 1 from public.food_barcodes where gtin=v_key and food_id<>p_food_id) then raise exception 'GTIN is owned by a different canonical Food.' using errcode='23514'; end if;
    insert into public.food_barcodes(food_id,gtin,source_record_id) values(p_food_id,v_key,p_source_record_id)
      on conflict(gtin) do update
        set source_record_id=coalesce(excluded.source_record_id,public.food_barcodes.source_record_id),updated_at=clock_timestamp()
        where public.food_barcodes.food_id=excluded.food_id
      returning id,food_id into v_effective,v_effective_food;
    if v_effective is null or v_effective_food is distinct from p_food_id then
      raise exception 'Effective GTIN assignment changed ownership during correction.' using errcode='40001';
    end if;
    select id,food_id into v_effective,v_effective_food from public.food_barcodes where gtin=v_key for update;
    if not found or v_effective_food is distinct from p_food_id then
      raise exception 'Effective GTIN assignment changed ownership during correction.' using errcode='40001';
    end if;
  else
    delete from public.food_barcodes where gtin=v_key and food_id=p_food_id returning id,food_id into v_effective,v_effective_food;
    if v_effective is null then raise exception 'Effective GTIN assignment not found for target Food.' using errcode='23503'; end if;
    if exists(select 1 from public.food_barcodes where gtin=v_key) then
      raise exception 'Effective GTIN assignment changed ownership during correction.' using errcode='40001';
    end if;
  end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_catalog_barcode_corrections(id,food_id,gtin,correction_action,source_record_id,policy_version,authority_reference)
  values(v_new,p_food_id,v_key,p_action,p_source_record_id,v_policy,'plan6:'||p_operation_id::text);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'barcode_correction',v_key,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'gtin',v_key,'action',p_action,'effectiveBarcodeId',case when p_action='assign' then v_effective else null end,'barcodeCorrectionId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','barcode_correction','authorityKey',v_key,'factId',v_new));
end
$function$;
''')

sql = replace_function(sql, "public.food_catalog_resolve_duplicate", r'''
create or replace function public.food_catalog_resolve_duplicate(
  p_operation_id uuid,p_case_id uuid,p_source_food_id uuid,p_target_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_case public.food_catalog_correction_cases%rowtype; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_source_lifecycle text; v_source_redirect uuid; v_target_lifecycle text; v_target_redirect uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.correction.apply');
  if p_source_food_id=p_target_food_id then raise exception 'Duplicate source and target must be distinct.' using errcode='23514'; end if;
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found or v_case.food_id<>p_source_food_id then raise exception 'Duplicate correction case not found for source Food.' using errcode='23503'; end if;
  v_pre:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.identity.merge','food_catalog_resolve_duplicate',p_source_food_id,p_case_id,v_case.policy_version,p_reason,
    jsonb_build_object('caseId',p_case_id,'sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id));
  if v_pre is not null then return v_pre; end if;
  v_case:=private.food_catalog_governance_require_case(p_case_id,p_source_food_id,p_expected_case_revision,'approved',array['duplicate_food','wrong_variant','other']);
  perform private.food_catalog_governance_lock_authority(p_source_food_id,'identity_merge','',p_expected_authority_revision,p_expected_authority_id);
  perform private.food_catalog_lock_food_pair(p_source_food_id,p_target_food_id);
  select lifecycle_status,merged_into_food_id into v_source_lifecycle,v_source_redirect from public.food_items where id=p_source_food_id;
  select lifecycle_status,merged_into_food_id into v_target_lifecycle,v_target_redirect from public.food_items where id=p_target_food_id;
  if v_source_lifecycle='merged' or v_source_redirect is not null then raise exception 'Source Food already has merge authority.' using errcode='40001'; end if;
  if exists(select 1 from public.food_items where merged_into_food_id=p_source_food_id) then
    raise exception 'A Food with inbound merge redirects cannot become a merge source.' using errcode='23514';
  end if;
  if v_target_lifecycle is distinct from 'active' or v_target_redirect is not null then
    raise exception 'Duplicate target must be an active, unredirected canonical survivor.' using errcode='23514';
  end if;
  insert into public.food_merge_events(id,source_food_id,target_food_id,policy_version,reason_code,evidence_reference,authority_reference)
  values(v_new,p_source_food_id,p_target_food_id,v_case.policy_version,'plan6_duplicate_resolution','case:'||p_case_id::text,'plan6:'||p_operation_id::text);
  update public.food_items set lifecycle_status='merged',merged_into_food_id=p_target_food_id where id=p_source_food_id;
  insert into public.food_catalog_governance_lifecycle_events(operation_id,food_id,event_type,previous_lifecycle,next_lifecycle,replacement_food_id,reason)
  values(p_operation_id,p_source_food_id,'merge',v_source_lifecycle,'merged',p_target_food_id,btrim(p_reason));
  v_revision:=private.food_catalog_governance_advance_authority(p_source_food_id,'identity_merge','',v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id,'mergeEventId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision,'plan3RedirectInput',jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id));
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.identity.merged',jsonb_build_object('sourceFoodId',p_source_food_id,'targetFoodId',p_target_food_id));
end
$function$;
''')

sql = replace_function(sql, "private.food_catalog_change_lifecycle", r'''
create or replace function private.food_catalog_change_lifecycle(
  p_operation_id uuid,p_food_id uuid,p_command text,p_expected_lifecycle text,p_expected_authority_revision bigint,p_expected_authority_id uuid,p_replacement_food_id uuid,p_reason text,p_break_glass_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_cap text; v_next text; v_replay jsonb; v_current text; v_redirect uuid; v_replacement_lifecycle text; v_replacement_redirect uuid; v_event uuid:=gen_random_uuid(); v_revision bigint; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_cap:=case when p_command='withdraw' then 'food.lifecycle.withdraw' when p_command='restore' then 'food.lifecycle.restore' else null end;
  if v_cap is null then raise exception 'Unsupported lifecycle command.' using errcode='22023'; end if;
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,v_cap,'food_catalog_'||p_command||'_food',p_food_id,null,'plan6-v1',p_reason,
    jsonb_build_object('foodId',p_food_id,'command',p_command,'expectedLifecycle',p_expected_lifecycle,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'replacementFoodId',p_replacement_food_id,'breakGlassReason',p_break_glass_reason));
  if v_replay is not null then return v_replay; end if;
  perform private.food_catalog_governance_lock_authority(p_food_id,'lifecycle','',p_expected_authority_revision,p_expected_authority_id);
  if p_replacement_food_id=p_food_id then raise exception 'Replacement Food must be distinct.' using errcode='23514'; end if;
  if p_replacement_food_id is null then
    perform 1 from public.food_items where id=p_food_id for update;
    if not found then raise exception 'Food not found.' using errcode='23503'; end if;
  else
    perform private.food_catalog_lock_food_pair(p_food_id,p_replacement_food_id);
  end if;
  select lifecycle_status,merged_into_food_id into v_current,v_redirect from public.food_items where id=p_food_id;
  if not found then raise exception 'Food not found.' using errcode='23503'; end if;
  if v_current<>p_expected_lifecycle then raise exception 'Food lifecycle CAS conflict.' using errcode='40001'; end if;
  if v_current='merged' or v_redirect is not null then raise exception 'Merged or redirected Food lifecycle cannot be changed.' using errcode='23514'; end if;
  if p_command='withdraw' then
    if v_current='withdrawn' then raise exception 'Food cannot be withdrawn from current lifecycle.' using errcode='23514'; end if;
    if exists(select 1 from public.food_items where merged_into_food_id=p_food_id) then
      raise exception 'A current merge survivor cannot be withdrawn while inbound redirects point to it.' using errcode='23514';
    end if;
    if p_replacement_food_id is not null then
      select lifecycle_status,merged_into_food_id into v_replacement_lifecycle,v_replacement_redirect from public.food_items where id=p_replacement_food_id;
      if v_replacement_lifecycle is distinct from 'active' or v_replacement_redirect is not null then
        raise exception 'Replacement Food must be an active, unredirected canonical root.' using errcode='23514';
      end if;
    end if;
    v_next:='withdrawn';
  else
    if v_current<>'withdrawn' then raise exception 'Only withdrawn Food can be restored.' using errcode='23514'; end if;
    v_next:='active';
  end if;
  update public.food_items set lifecycle_status=v_next,merged_into_food_id=case when p_command='restore' then null else merged_into_food_id end where id=p_food_id;
  insert into public.food_catalog_governance_lifecycle_events(id,operation_id,food_id,event_type,previous_lifecycle,next_lifecycle,replacement_food_id,reason)
  values(v_event,p_operation_id,p_food_id,p_command,v_current,v_next,p_replacement_food_id,btrim(p_reason));
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'lifecycle','',v_event);
  v_result:=jsonb_build_object('foodId',p_food_id,'lifecycle',v_next,'lifecycleEventId',v_event,'authorityRevision',v_revision,'replacementFoodId',p_replacement_food_id);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_event,'{}'::uuid[],v_result,'food.lifecycle.'||p_command,jsonb_build_object('foodId',p_food_id,'lifecycle',v_next),p_break_glass_reason);
end
$function$;
''')

# Personal Override public writes join the canonical account-deletion serialization BEFORE operation-ledger replay/creation.
for fn_name in ["public.food_catalog_set_personal_override", "public.food_catalog_delete_personal_override"]:
    fn = get_function(sql, fn_name)
    if "food_catalog_personal_override_require_writable_account" not in fn:
        anchor = "  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated override owner is required.' using errcode='42501'; end if;"
        if anchor not in fn:
            raise RuntimeError(f"{fn_name}: authenticated owner anchor missing")
        fn = fn.replace(anchor, anchor + "\n  perform private.food_catalog_personal_override_require_writable_account(v_user);", 1)
    sql = replace_function(sql, fn_name, fn)

# The Plan 6 wrapper takes the canonical purge lock before its own deletions; the delegated core reuses the same lock/state authority.
purge_name = "public.purge_account_application_data_atomic"
purge = get_function(sql, purge_name)
if "plaivra-account-data-purge:" not in purge:
    anchor = "begin\n  -- Existing reviewed top-level Nutrition V1 replay cleanup remains explicit."
    replacement = "begin\n  if p_user_id is null then raise exception 'Account-data purge requires a user ID.' using errcode='22023'; end if;\n  perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:'||p_user_id::text,0));\n  -- Existing reviewed top-level Nutrition V1 replay cleanup remains explicit."
    if anchor not in purge:
        raise RuntimeError("purge lock insertion anchor missing")
    purge = purge.replace(anchor, replacement, 1)
sql = replace_function(sql, purge_name, purge)

# Final private ACL pass includes every privileged Personal Override helper plus non-governance lock/trigger helpers.
acl_old = """        p.proname like 'food_catalog_governance_%'\n        or p.proname in ('food_catalog_change_lifecycle','reject_food_catalog_governance_immutable_mutation')"""
acl_new = """        p.proname like 'food_catalog_governance_%'\n        or p.proname like 'food_catalog_personal_override_%'\n        or p.proname in ('food_catalog_change_lifecycle','food_catalog_lock_gtin_authority','food_catalog_serialize_gtin_write','food_catalog_lock_food_pair','reject_food_catalog_governance_immutable_mutation')"""
if acl_new not in sql:
    sql = replace_once(sql, acl_old, acl_new, "private ACL hardening")

MIGRATION.write_text(sql)

# Register the permanent rollback verifier and the permanent distinct-session concurrency verifier.
runner = RUNNER.read_text()
verification_anchor = '  "supabase/verification/food-catalog-governance-control-plane-authority-rereview.sql",\n'
verification_line = '  "supabase/verification/food-catalog-governance-control-plane-five-p1-rereview.sql",\n'
if verification_line not in runner:
    runner = replace_once(runner, verification_anchor, verification_anchor + verification_line, "database verifier registration")
concurrency_anchor = '''  run(process.execPath, ["scripts/test-food-catalog-grant-promotion-concurrency.mjs"], {\n    ...executionEnv,\n    PLAIVRA_GRANT_PROMOTION_CONCURRENCY_TEST_DATABASE_URL: localUrl,\n  });\n'''
concurrency_new = concurrency_anchor + '''  run(process.execPath, ["scripts/test-food-catalog-governance-plan6-concurrency.mjs"], {\n    ...executionEnv,\n    PLAIVRA_PLAN6_CONCURRENCY_TEST_DATABASE_URL: localUrl,\n  });\n'''
if "PLAIVRA_PLAN6_CONCURRENCY_TEST_DATABASE_URL" not in runner:
    runner = replace_once(runner, concurrency_anchor, concurrency_new, "Plan 6 concurrency verifier registration")
RUNNER.write_text(runner)

# Strengthen the deletion_processing behavioral fixture so pre-fix code would succeed unless the new lifecycle gate blocks it.
concurrency = CONCURRENCY.read_text()
old_dproc = '''  runSql(authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000801','${PURGE_FOOD}',null,0,'{\"protein_g\":11}'::jsonb,null,'dproc seed')`));\n  runSql(`update public.account_access_states set state='deletion_processing',disabled_at=clock_timestamp() where user_id='${DPROC_UID}';`);\n  const setResult = spawnSync("psql", [...psqlArgs, "-c", authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000802','${PURGE_FOOD}','6a000000-0000-4000-8000-000000000000',1,'{\"protein_g\":12}'::jsonb,null,'blocked set')`)], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });\n  if (setResult.status === 0) throw new Error("deletion_processing account unexpectedly set Personal Override.");\n  const current = runSql(`select current_revision_id::text from public.food_personal_overrides where user_id='${DPROC_UID}' and food_id='${PURGE_FOOD}'`);\n'''
new_dproc = '''  runSql(authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000801','${PURGE_FOOD}',null,0,'{\"protein_g\":11}'::jsonb,null,'dproc seed')`));\n  const current = runSql(`select current_revision_id::text from public.food_personal_overrides where user_id='${DPROC_UID}' and food_id='${PURGE_FOOD}'`);\n  runSql(`update public.account_access_states set state='deletion_processing',disabled_at=clock_timestamp() where user_id='${DPROC_UID}';`);\n  const setResult = spawnSync("psql", [...psqlArgs, "-c", authSql(DPROC_UID, `select public.food_catalog_set_personal_override('6a000000-0000-4000-8000-000000000802','${PURGE_FOOD}','${current}',1,'{\"protein_g\":12}'::jsonb,null,'blocked set')`)], { encoding: "utf8", env: { ...process.env, PGPASSWORD: "postgres" } });\n  if (setResult.status === 0) throw new Error("deletion_processing account unexpectedly set Personal Override.");\n'''
if new_dproc not in concurrency:
    concurrency = replace_once(concurrency, old_dproc, new_dproc, "deletion_processing test fixture")
CONCURRENCY.write_text(concurrency)

# Record the architectural correction without changing prior authority descriptions.
doc = DOC.read_text()
doc_marker = "## Five-P1 concurrency and privilege hardening"
if doc_marker not in doc:
    doc += r'''

## Five-P1 concurrency and privilege hardening

The independent security/correctness re-review added five fail-closed boundaries without changing cross-plan ownership. Private Personal Override helpers are caller-bound to `auth.uid()` and have application-role/PUBLIC EXECUTE removed. Personal Override writes acquire the canonical account-purge advisory lock and require an active, non-disabled `account_access_states` row before their operation ledger can be created or replayed; the Plan 6 purge wrapper takes that same lock before deleting Plan 6 owner data.

GTIN ownership now has one database-wide serialization domain keyed only by normalized GTIN. A `food_barcodes` trigger covers every privileged writer, including the already-applied Plan 4 ingestion runtime, while the Plan 6 barcode command acquires the same lock before authority/ownership checks and verifies final effective ownership before correction history, authority advancement, case application, audit, or outbox success. The applied Plan 4 migration remains byte-for-byte untouched.

Governance recovery-set mutations share one advisory-lock domain and assert after mutation that at least one active human Owner retains active `food.governance.manage_principals`; a failed postcondition rolls back the operation and its audit/outbox atomically. Duplicate resolution locks source and target Foods in deterministic ID order, requires an active unredirected target, forbids using a current merge survivor as a later source, and thereby prevents chains/cycles. Lifecycle withdrawal rejects Foods with inbound merge redirects and validates any replacement as an active unredirected canonical root.
'''
DOC.write_text(doc)

print("Plan 6 five-P1 hardening patch applied to working tree.")
