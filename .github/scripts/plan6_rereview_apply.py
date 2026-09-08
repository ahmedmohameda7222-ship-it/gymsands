from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql"
VERIFY = ROOT / "supabase/verification/food-catalog-governance-control-plane.sql"
RUNNER = ROOT / "scripts/run-database-verification.mjs"
REREVIEW_TEST = ROOT / "lib/product/food-catalog-governance-plan6-rereview.test.ts"

sql = MIGRATION.read_text()
if "PLAN6_REREVIEW_HARDENED" in sql:
    raise SystemExit("Plan 6 re-review hardening already applied")


def replace_func(text: str, name: str, replacement: str) -> str:
    pattern = re.compile(rf"create or replace function {re.escape(name)}\([\s\S]*?\n\$function\$;", re.I)
    text2, count = pattern.subn(lambda _match: replacement.strip(), text, count=1)
    if count != 1:
        raise RuntimeError(f"expected exactly one function block for {name}, got {count}")
    return text2


def edit_func(text: str, name: str, transform) -> str:
    pattern = re.compile(rf"create or replace function {re.escape(name)}\([\s\S]*?\n\$function\$;", re.I)
    match = pattern.search(text)
    if not match:
        raise RuntimeError(f"missing function {name}")
    new = transform(match.group(0))
    return text[: match.start()] + new + text[match.end() :]

# Service principals are bound to a signed JWT execution claim hash; human principals must not carry one.
sql = sql.replace(
    "  subject_id text not null check (length(btrim(subject_id)) > 0),\n  role_class text not null",
    "  subject_id text not null check (length(btrim(subject_id)) > 0),\n  service_identity_sha256 text,\n  role_class text not null",
    1,
)
sql = sql.replace(
    "  check ((principal_type='service' and role_class='service') or (principal_type='human' and role_class in ('owner','curator'))),\n  check ((active",
    "  check ((principal_type='service' and role_class='service') or (principal_type='human' and role_class in ('owner','curator'))),\n  check ((principal_type='service' and service_identity_sha256 ~ '^[0-9a-f]{64}$') or (principal_type='human' and service_identity_sha256 is null)),\n  check ((active",
    1,
)
sql = sql.replace(
    ");\n\ncreate table public.food_catalog_governance_capability_assignments",
    ");\ncreate unique index food_catalog_governance_service_identity_uq\n  on public.food_catalog_governance_principals(service_identity_sha256) where principal_type='service';\n\ncreate table public.food_catalog_governance_capability_assignments",
    1,
)

policy_ddl = r'''

-- PLAN6_REREVIEW_HARDENED: explicit immutable governance policy authority.
create table public.food_catalog_governance_policy_versions (
  policy_version text primary key check (length(btrim(policy_version)) between 1 and 80),
  evidence_policy jsonb not null check (jsonb_typeof(evidence_policy)='object'),
  evidence_required_categories text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);
create table public.food_catalog_governance_policy_pointer (
  singleton boolean primary key default true check (singleton),
  current_policy_version text not null references public.food_catalog_governance_policy_versions(policy_version) on delete restrict,
  pointer_revision bigint not null default 0 check (pointer_revision >= 0),
  updated_at timestamptz not null default now()
);
insert into public.food_catalog_governance_policy_versions(policy_version,evidence_policy,evidence_required_categories)
values('plan6-v1',jsonb_build_object(
  'wrong_nutrition',jsonb_build_array('source_record','product_label','manufacturer'),
  'missing_nutrition',jsonb_build_array('source_record','product_label','manufacturer','curator_reason'),
  'wrong_serving',jsonb_build_array('source_record','product_label','manufacturer'),
  'missing_serving',jsonb_build_array('source_record','product_label','manufacturer','curator_reason'),
  'wrong_name',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'wrong_translation',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'wrong_barcode',jsonb_build_array('source_record','product_label','manufacturer','barcode'),
  'wrong_taxonomy',jsonb_build_array('source_record','canonical','curator_reason'),
  'wrong_market_relevance',jsonb_build_array('source_record','manufacturer','canonical','curator_reason'),
  'duplicate_food',jsonb_build_array('source_record','product_label','manufacturer','barcode','canonical'),
  'wrong_variant',jsonb_build_array('source_record','product_label','manufacturer','barcode'),
  'outdated_product',jsonb_build_array('source_record','manufacturer','canonical'),
  'source_conflict',jsonb_build_array('source_record','product_label','manufacturer','canonical'),
  'other',jsonb_build_array('source_record','product_label','manufacturer','barcode','canonical','curator_reason')
),array['wrong_nutrition','wrong_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict']);
insert into public.food_catalog_governance_policy_pointer(singleton,current_policy_version,pointer_revision)
values(true,'plan6-v1',0);
'''
sql = sql.replace("\n-- One-time bootstrap from the pre-Plan-6 admin identity", policy_ddl + "\n-- One-time bootstrap from the pre-Plan-6 admin identity", 1)

# Persistence evidence vocabulary exactly mirrors the domain vocabulary.
sql = sql.replace(
    "evidence_type text not null check (evidence_type in ('source_record','product_label','manufacturer','barcode','canonical','curator_reason'))",
    "evidence_type text not null check (evidence_type in ('source_record','product_label','manufacturer','barcode','canonical','curator_reason'))",
    1,
)

# Crash-safe outbox lease state.
sql = sql.replace(
    "  available_at timestamptz not null default now(),\n  delivered_at timestamptz,",
    "  available_at timestamptz not null default now(),\n  claim_owner text,\n  lease_token uuid,\n  lease_epoch bigint not null default 0 check (lease_epoch >= 0),\n  lease_acquired_at timestamptz,\n  lease_expires_at timestamptz,\n  delivered_at timestamptz,",
    1,
)
sql = sql.replace(
    "  check ((status='delivered' and delivered_at is not null) or (status<>'delivered' and delivered_at is null))\n);",
    "  check ((status='delivered' and delivered_at is not null) or (status<>'delivered' and delivered_at is null)),\n  check ((status='processing' and claim_owner is not null and lease_token is not null and lease_acquired_at is not null and lease_expires_at is not null) or (status<>'processing' and claim_owner is null and lease_token is null and lease_acquired_at is null and lease_expires_at is null))\n);",
    1,
)

extra_tables = r'''

create table public.food_catalog_serving_fact_lineages (
  lineage_id uuid primary key,
  food_id uuid not null references public.food_items(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.food_catalog_serving_fact_revisions (
  serving_option_id uuid primary key references public.food_serving_options(id) on delete restrict,
  lineage_id uuid not null references public.food_catalog_serving_fact_lineages(lineage_id) on delete restrict,
  predecessor_serving_option_id uuid references public.food_serving_options(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(lineage_id,serving_option_id),
  foreign key(lineage_id,predecessor_serving_option_id)
    references public.food_catalog_serving_fact_revisions(lineage_id,serving_option_id) on delete restrict,
  check (predecessor_serving_option_id is null or predecessor_serving_option_id<>serving_option_id)
);

create table public.food_personal_override_operations (
  user_id uuid not null,
  operation_id uuid not null,
  food_id uuid not null references public.food_items(id) on delete restrict,
  command_name text not null check (command_name in ('set','delete')),
  semantic_checksum_sha256 text not null check (semantic_checksum_sha256 ~ '^[0-9a-f]{64}$'),
  result_json jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key(user_id,operation_id)
);
'''
sql = sql.replace("\ncreate or replace function private.reject_food_catalog_governance_immutable_mutation()", extra_tables + "\ncreate or replace function private.reject_food_catalog_governance_immutable_mutation()", 1)

# Freeze policy versions and serving lineage history.
sql = sql.replace(
    "create trigger food_catalog_correction_reports_immutable",
    "create trigger food_catalog_governance_policy_versions_immutable before update or delete on public.food_catalog_governance_policy_versions for each row execute function private.reject_food_catalog_governance_immutable_mutation();\ncreate trigger food_catalog_serving_fact_lineages_immutable before update or delete on public.food_catalog_serving_fact_lineages for each row execute function private.reject_food_catalog_governance_immutable_mutation();\ncreate trigger food_catalog_serving_fact_revisions_immutable before update or delete on public.food_catalog_serving_fact_revisions for each row execute function private.reject_food_catalog_governance_immutable_mutation();\ncreate trigger food_catalog_correction_reports_immutable",
    1,
)

helpers = r'''

create or replace function private.food_catalog_governance_service_principal_for_request()
returns uuid language plpgsql stable security definer set search_path='' as $function$
declare v_identity text; v_hash text; v_principal uuid;
begin
  if auth.role()<>'service_role' then raise exception 'Service Food governance principal requires service_role execution.' using errcode='42501'; end if;
  v_identity:=nullif(btrim(coalesce(auth.jwt()->>'plaivra_food_service_identity','')),'');
  if v_identity is null then raise exception 'Trusted Food service execution identity claim is required.' using errcode='42501'; end if;
  v_hash:=encode(extensions.digest(convert_to(v_identity,'UTF8'),'sha256'),'hex');
  select p.id into v_principal from public.food_catalog_governance_principals p
  where p.principal_type='service' and p.service_identity_sha256=v_hash and p.active and p.revoked_at is null;
  if v_principal is null then raise exception 'Trusted Food service execution identity is not provisioned.' using errcode='42501'; end if;
  return v_principal;
end
$function$;

create or replace function private.food_catalog_governance_current_policy_version()
returns text language sql stable security definer set search_path='' as $function$
  select current_policy_version from public.food_catalog_governance_policy_pointer where singleton=true
$function$;

create or replace function private.food_catalog_governance_evidence_type_allowed(p_policy_version text,p_category text,p_evidence_type text)
returns boolean language sql stable security definer set search_path='' as $function$
  select coalesce((select (evidence_policy->p_category) ? p_evidence_type from public.food_catalog_governance_policy_versions where policy_version=p_policy_version),false)
$function$;

create or replace function private.food_catalog_governance_case_evidence_required(p_policy_version text,p_category text)
returns boolean language sql stable security definer set search_path='' as $function$
  select coalesce((select p_category=any(evidence_required_categories) from public.food_catalog_governance_policy_versions where policy_version=p_policy_version),false)
$function$;

create or replace function private.food_catalog_governance_validate_bounded_evidence(p_value jsonb,p_depth integer default 0)
returns void language plpgsql immutable set search_path='' as $function$
declare v_key text; v_child jsonb;
begin
  if p_depth>4 then raise exception 'Correction evidence exceeds maximum depth.' using errcode='22023'; end if;
  case jsonb_typeof(p_value)
    when 'object' then
      if (select count(*) from jsonb_object_keys(p_value))>24 then raise exception 'Correction evidence object is too large.' using errcode='22023'; end if;
      for v_key,v_child in select key,value from jsonb_each(p_value) loop
        if v_key ~* '(access.?token|authorization|password|secret|cookie|session|api.?key|service.?role)' then raise exception 'Sensitive correction evidence is forbidden.' using errcode='22023'; end if;
        perform private.food_catalog_governance_validate_bounded_evidence(v_child,p_depth+1);
      end loop;
    when 'array' then
      if jsonb_array_length(p_value)>24 then raise exception 'Correction evidence array is too large.' using errcode='22023'; end if;
      for v_child in select value from jsonb_array_elements(p_value) loop
        perform private.food_catalog_governance_validate_bounded_evidence(v_child,p_depth+1);
      end loop;
    when 'string' then
      if length(p_value#>>'{}')>4096 then raise exception 'Correction evidence string is too long.' using errcode='22023'; end if;
    else null;
  end case;
end
$function$;

create or replace function private.food_catalog_governance_assert_recovery_survives(p_target_principal_id uuid)
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if not exists(
    select 1 from public.food_catalog_governance_principals p
    join public.food_catalog_governance_capability_assignments a on a.principal_id=p.id and a.capability='food.governance.manage_principals' and a.revoked_at is null
    where p.principal_type='human' and p.role_class='owner' and p.active and p.revoked_at is null and p.id<>p_target_principal_id
  ) then raise exception 'Final Owner recovery authority cannot be removed.' using errcode='23514'; end if;
end
$function$;

create or replace function private.food_catalog_gtin_is_valid(p_gtin text)
returns boolean language plpgsql immutable set search_path='' as $function$
declare v_sum integer:=0; v_i integer; v_digit integer; v_len integer:=length(coalesce(p_gtin,'')); v_check integer;
begin
  if p_gtin is null or p_gtin !~ '^[0-9]+$' or v_len not in (8,12,13,14) then return false; end if;
  for v_i in 1..v_len-1 loop
    v_digit:=substring(p_gtin from v_i for 1)::integer;
    v_sum:=v_sum + v_digit * case when ((v_len-v_i) % 2)=1 then 3 else 1 end;
  end loop;
  v_check:=(10-(v_sum%10))%10;
  return v_check=substring(p_gtin from v_len for 1)::integer;
end
$function$;

create or replace function private.food_catalog_validate_personal_nutrition_override(p_value jsonb)
returns void language plpgsql immutable set search_path='' as $function$
declare v_key text; v_child jsonb; v_numeric numeric;
begin
  if p_value is null then return; end if;
  if jsonb_typeof(p_value)<>'object' then raise exception 'Personal nutrition override must be a JSON object.' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(p_value))>8 then raise exception 'Personal nutrition override has too many keys.' using errcode='22023'; end if;
  for v_key,v_child in select key,value from jsonb_each(p_value) loop
    if v_key not in ('calories','protein_g','carbs_g','fat_g','saturated_fat_g','fiber_g','sugars_g','sodium_mg') then raise exception 'Unsupported personal nutrition override key: %',v_key using errcode='22023'; end if;
    if jsonb_typeof(v_child)='null' then continue; end if;
    if jsonb_typeof(v_child)<>'number' then raise exception 'Personal nutrition override values must be number or null.' using errcode='22023'; end if;
    v_numeric:=(v_child#>>'{}')::numeric;
    if v_numeric<0 then raise exception 'Personal nutrition override values must be non-negative.' using errcode='22023'; end if;
  end loop;
end
$function$;

create or replace function private.food_catalog_personal_override_begin_operation(p_user_id uuid,p_operation_id uuid,p_food_id uuid,p_command_name text,p_semantics jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_checksum text; v_existing public.food_personal_override_operations%rowtype;
begin
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

create or replace function private.food_catalog_personal_override_finish_operation(p_user_id uuid,p_operation_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $function$
begin
  update public.food_personal_override_operations set result_json=p_result,completed_at=clock_timestamp()
  where user_id=p_user_id and operation_id=p_operation_id and completed_at is null;
  if not found then raise exception 'Personal override operation cannot be completed.' using errcode='40001'; end if;
  return p_result;
end
$function$;
'''
sql = sql.replace("\ncreate or replace function private.food_catalog_governance_assert_capability", helpers + "\ncreate or replace function private.food_catalog_governance_assert_capability", 1)

# Service capability assertions bind the supplied principal to the signed execution identity.
sql = replace_func(sql, "private.food_catalog_governance_assert_capability", r'''
create or replace function private.food_catalog_governance_assert_capability(p_principal_id uuid, p_capability text)
returns void language plpgsql stable security definer set search_path='' as $function$
declare v_type text; v_subject text; v_resolved_service uuid;
begin
  select p.principal_type,p.subject_id into v_type,v_subject
  from public.food_catalog_governance_principals p
  where p.id=p_principal_id and p.active and p.revoked_at is null;
  if v_type is null then raise exception 'Food governance principal is inactive or unknown.' using errcode='42501'; end if;
  if v_type='human' then
    if auth.uid() is null or auth.uid()::text<>v_subject then raise exception 'Human Food governance principal identity mismatch.' using errcode='42501'; end if;
  elsif v_type='service' then
    v_resolved_service:=private.food_catalog_governance_service_principal_for_request();
    if v_resolved_service<>p_principal_id then raise exception 'Service Food governance principal identity mismatch.' using errcode='42501'; end if;
  end if;
  if not exists(select 1 from public.food_catalog_governance_capability_assignments a where a.principal_id=p_principal_id and a.capability=p_capability and a.revoked_at is null) then
    raise exception 'Food governance capability denied: %',p_capability using errcode='42501';
  end if;
end
$function$;
''')

# Replace fixed evidence-required helper call with versioned policy authority.
sql = re.sub(r"create or replace function private\.food_catalog_governance_case_evidence_required\(p_category text\)[\s\S]*?\n\$function\$;\n", "", sql, count=1)
sql = sql.replace("private.food_catalog_governance_case_evidence_required(v_case.category)", "private.food_catalog_governance_case_evidence_required(v_case.policy_version,v_case.category)")

# GTIN authority is validated at the durable table boundary too.
gtin_hardening = r'''
alter table public.food_barcodes
  add constraint food_barcodes_gtin_gs1_mod10_check check (private.food_catalog_gtin_is_valid(gtin));
'''
sql = sql.replace("\n-- Barcode correction is append-only governance evidence", "\n" + gtin_hardening + "\n-- Barcode correction is append-only governance evidence", 1)
sql = sql.replace("gtin text not null check (gtin ~ '^[0-9]+$' and length(gtin) in (8,12,13,14))", "gtin text not null check (private.food_catalog_gtin_is_valid(gtin))", 1)

# Owner principal management binds service identity and protects the final recovery authority.
sql = replace_func(sql, "public.food_catalog_manage_governance_principal", r'''
create or replace function public.food_catalog_manage_governance_principal(
  p_operation_id uuid,p_target_principal_type text,p_target_subject_id text,p_role_class text,p_capabilities text[],p_reason text,p_service_identity text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_target uuid; v_existing_role text; v_replay jsonb; v_cap text; v_result jsonb; v_service_hash text; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  v_service_hash:=case when p_target_principal_type='service' then encode(extensions.digest(convert_to(btrim(coalesce(p_service_identity,'')),'UTF8'),'sha256'),'hex') else null end;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_manage_governance_principal',null,null,v_policy,p_reason,
    jsonb_build_object('principalType',p_target_principal_type,'subjectId',btrim(p_target_subject_id),'roleClass',p_role_class,'capabilities',to_jsonb(coalesce(p_capabilities,'{}'::text[])),'serviceIdentitySha256',v_service_hash));
  if v_replay is not null then return v_replay; end if;
  if p_target_principal_type not in ('human','service') or length(btrim(coalesce(p_target_subject_id,'')))=0 then raise exception 'Invalid governance principal identity.' using errcode='22023'; end if;
  if (p_target_principal_type='service' and (p_role_class<>'service' or length(btrim(coalesce(p_service_identity,'')))=0)) or (p_target_principal_type='human' and p_role_class not in ('owner','curator')) then raise exception 'Governance principal role/type or service identity is invalid.' using errcode='23514'; end if;
  select id,role_class into v_target,v_existing_role from public.food_catalog_governance_principals where principal_type=p_target_principal_type and subject_id=btrim(p_target_subject_id) for update;
  if v_target is not null and v_existing_role='owner' and p_role_class<>'owner' then perform private.food_catalog_governance_assert_recovery_survives(v_target); end if;
  insert into public.food_catalog_governance_principals(principal_type,subject_id,service_identity_sha256,role_class,active,revoked_at)
  values(p_target_principal_type,btrim(p_target_subject_id),v_service_hash,p_role_class,true,null)
  on conflict(principal_type,subject_id) do update set service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null
  returning id into v_target;
  if p_role_class<>'owner' then
    update public.food_catalog_governance_capability_assignments set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
    where principal_id=v_target and capability='food.governance.manage_principals' and revoked_at is null;
  end if;
  foreach v_cap in array coalesce(p_capabilities,'{}'::text[]) loop
    if v_cap='food.governance.manage_principals' and p_role_class<>'owner' then raise exception 'Only Owner principals may receive principal management capability.' using errcode='23514'; end if;
    if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose') then raise exception 'Service principal governance escalation is forbidden.' using errcode='23514'; end if;
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,granted_by_principal_id,reason)
    values(v_target,v_cap,v_actor,btrim(p_reason)) on conflict(principal_id,capability) where revoked_at is null do nothing;
  end loop;
  v_result:=jsonb_build_object('principalId',v_target,'principalType',p_target_principal_type,'roleClass',p_role_class);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,v_target,'{}'::uuid[],v_result,'food.governance.principal.managed',jsonb_build_object('principalId',v_target));
end
$function$;
''')

sql = replace_func(sql, "public.food_catalog_revoke_governance_capability", r'''
create or replace function public.food_catalog_revoke_governance_capability(
  p_operation_id uuid,p_target_principal_id uuid,p_capability text,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_replay jsonb; v_assignment uuid; v_result jsonb; v_policy text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_revoke_governance_capability',null,null,v_policy,p_reason,jsonb_build_object('targetPrincipalId',p_target_principal_id,'capability',p_capability));
  if v_replay is not null then return v_replay; end if;
  if p_capability='food.governance.manage_principals' and exists(select 1 from public.food_catalog_governance_principals where id=p_target_principal_id and principal_type='human' and role_class='owner' and active and revoked_at is null) then
    perform private.food_catalog_governance_assert_recovery_survives(p_target_principal_id);
  end if;
  update public.food_catalog_governance_capability_assignments set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
  where principal_id=p_target_principal_id and capability=p_capability and revoked_at is null returning id into v_assignment;
  if v_assignment is null then raise exception 'Active capability assignment not found.' using errcode='23503'; end if;
  v_result:=jsonb_build_object('principalId',p_target_principal_id,'capability',p_capability,'revoked',true);
  return private.food_catalog_governance_finish_operation(p_operation_id,v_assignment,null,'{}'::uuid[],v_result,'food.governance.capability.revoked',jsonb_build_object('principalId',p_target_principal_id,'capability',p_capability));
end
$function$;
''')

# Trusted current policy and recursive evidence validation at both report/proposal entry points.
sql = replace_func(sql, "public.food_catalog_service_propose_correction", r'''
create or replace function public.food_catalog_service_propose_correction(
  p_operation_id uuid,p_principal_id uuid,p_food_id uuid,p_category text,p_claim_key text,p_description text,
  p_evidence jsonb default '{}'::jsonb,p_policy_version text default null,p_reason text default 'service proposal'
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_policy text; v_replay jsonb; v_proposal uuid; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  if p_principal_id is distinct from v_actor then raise exception 'Service Food governance principal identity mismatch.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then raise exception 'Unsupported governance policy version.' using errcode='22023'; end if;
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid service correction proposal category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Service correction proposal text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Service correction proposal evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found for service proposal.' using errcode='23503'; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.ingestion.propose','food_catalog_service_propose_correction',p_food_id,null,v_policy,p_reason,jsonb_build_object('foodId',p_food_id,'category',p_category,'claimKey',btrim(p_claim_key),'description',btrim(p_description),'evidence',coalesce(p_evidence,'{}'::jsonb)));
  if v_replay is not null then return v_replay; end if;
  insert into public.food_catalog_service_proposals(operation_id,principal_id,food_id,category,claim_key,description,evidence,policy_version)
  values(p_operation_id,v_actor,p_food_id,p_category,btrim(p_claim_key),btrim(p_description),coalesce(p_evidence,'{}'::jsonb),v_policy) returning id into v_proposal;
  v_result:=jsonb_build_object('proposalId',v_proposal,'foodId',p_food_id,'canonicalMutation',false);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,null,'{}'::uuid[],v_result,'food.governance.service.proposed',jsonb_build_object('proposalId',v_proposal,'foodId',p_food_id,'category',p_category));
end
$function$;
''')

sql = replace_func(sql, "public.food_catalog_report_correction", r'''
create or replace function public.food_catalog_report_correction(
  p_food_id uuid,p_category text,p_claim_key text,p_description text,p_evidence jsonb default '{}'::jsonb,p_policy_version text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_policy text; v_issue text; v_case uuid; v_report uuid;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated reporter is required.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then raise exception 'Unsupported governance policy version.' using errcode='22023'; end if;
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid correction category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Correction report text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Correction report evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found.' using errcode='23503'; end if;
  v_issue:=lower(p_food_id::text||'|'||p_category||'|'||regexp_replace(btrim(p_claim_key),'\s+',' ','g'));
  perform pg_advisory_xact_lock(hashtextextended(v_issue,0));
  select id into v_case from public.food_catalog_correction_cases where issue_key=v_issue and state in ('reported','under_review','approved') order by created_at,id limit 1;
  if v_case is null then
    insert into public.food_catalog_correction_cases(food_id,category,claim_key,issue_key,policy_version) values(p_food_id,p_category,btrim(p_claim_key),v_issue,v_policy) returning id into v_case;
    insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,policy_version,reason) values(v_case,null,'reported',0,v_policy,'member-report');
  end if;
  insert into public.food_catalog_correction_reports(case_id,reporter_user_id,description,evidence) values(v_case,v_user,btrim(p_description),coalesce(p_evidence,'{}'::jsonb)) returning id into v_report;
  return jsonb_build_object('caseId',v_case,'reportId',v_report,'canonicalMutation',false,'policyVersion',(select policy_version from public.food_catalog_correction_cases where id=v_case));
end
$function$;
''')

sql = replace_func(sql, "public.food_catalog_attach_correction_evidence", r'''
create or replace function public.food_catalog_attach_correction_evidence(
  p_operation_id uuid,p_case_id uuid,p_evidence_type text,p_source_record_id uuid,p_evidence_reference text,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_case public.food_catalog_correction_cases%rowtype; v_replay jsonb; v_evidence uuid; v_result jsonb;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id;
  if not found then raise exception 'Correction case not found.' using errcode='23503'; end if;
  v_replay:=private.food_catalog_governance_begin_operation(p_operation_id,v_actor,'food.evidence.attach','food_catalog_attach_correction_evidence',v_case.food_id,p_case_id,v_case.policy_version,p_reason,jsonb_build_object('caseId',p_case_id,'evidenceType',p_evidence_type,'sourceRecordId',p_source_record_id,'reference',nullif(btrim(coalesce(p_evidence_reference,'')),'')));
  if v_replay is not null then return v_replay; end if;
  select * into v_case from public.food_catalog_correction_cases where id=p_case_id for update;
  if v_case.state not in ('reported','under_review') then raise exception 'Evidence is frozen after a governance decision.' using errcode='23514'; end if;
  if not private.food_catalog_governance_evidence_type_allowed(v_case.policy_version,v_case.category,p_evidence_type) then raise exception 'Evidence type is not allowed for this correction category.' using errcode='23514'; end if;
  if p_source_record_id is not null then
    perform 1 from public.food_source_records where id=p_source_record_id and food_id=v_case.food_id;
    if not found then raise exception 'Source correction evidence must belong to the same Food.' using errcode='23514'; end if;
  elsif length(btrim(coalesce(p_evidence_reference,''))) not between 1 and 500 then raise exception 'Inspectable evidence reference is required.' using errcode='22023'; end if;
  insert into public.food_catalog_correction_evidence(case_id,food_id,evidence_type,source_record_id,evidence_reference,attached_by_principal_id)
  values(p_case_id,v_case.food_id,p_evidence_type,p_source_record_id,nullif(btrim(coalesce(p_evidence_reference,'')),''),v_actor) returning id into v_evidence;
  v_result:=jsonb_build_object('evidenceId',v_evidence,'caseId',p_case_id);
  return private.food_catalog_governance_finish_operation(p_operation_id,null,v_evidence,array[v_evidence],v_result,'food.correction.evidence.attached',jsonb_build_object('caseId',p_case_id,'evidenceId',v_evidence));
end
$function$;
''')

# Applying a global correction requires both generic apply authority and the domain capability.
sql = edit_func(sql, "private.food_catalog_governance_prepare_apply", lambda block: block.replace(
    "begin\n  select * into v_case",
    "begin\n  perform private.food_catalog_governance_assert_capability(p_principal_id,'food.correction.apply');\n  select * into v_case",
    1,
))
sql = edit_func(sql, "public.food_catalog_resolve_duplicate", lambda block: block.replace(
    "  v_actor:=private.food_catalog_governance_principal_for_user();\n",
    "  v_actor:=private.food_catalog_governance_principal_for_user();\n  perform private.food_catalog_governance_assert_capability(v_actor,'food.correction.apply');\n",
    1,
))

# Independent serving lineages: approval/apply CAS is keyed by lineage UUID, never one Food-wide empty key.
sql = replace_func(sql, "public.food_catalog_apply_serving_correction", r'''
create or replace function public.food_catalog_apply_serving_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_serving_lineage_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_label text,p_amount numeric,p_unit_code text,p_gram_weight numeric,p_source_record_id uuid,p_source_portion_code text,p_evidence_class text,p_source_primary boolean,p_reason text,p_break_glass_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_lineage_food uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if p_serving_lineage_id is null then raise exception 'Serving lineage ID is required.' using errcode='22023'; end if;
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.serving.correct','food_catalog_apply_serving_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'serving_option',p_serving_lineage_id::text,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'servingLineageId',p_serving_lineage_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'label',p_label,'amount',p_amount,'unitCode',p_unit_code,'gramWeight',p_gram_weight,'sourceRecordId',p_source_record_id,'sourcePortionCode',p_source_portion_code,'evidenceClass',p_evidence_class,'sourcePrimary',p_source_primary,'breakGlassReason',p_break_glass_reason));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select food_id into v_lineage_food from public.food_catalog_serving_fact_lineages where lineage_id=p_serving_lineage_id for update;
  if v_lineage_food is null then
    insert into public.food_catalog_serving_fact_lineages(lineage_id,food_id) values(p_serving_lineage_id,p_food_id);
    if p_expected_authority_id is not null then
      perform 1 from public.food_serving_options where id=p_expected_authority_id and food_id=p_food_id;
      if not found then raise exception 'Expected predecessor serving option not found.' using errcode='40001'; end if;
      insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id) values(p_expected_authority_id,p_serving_lineage_id,null) on conflict(serving_option_id) do nothing;
    end if;
  elsif v_lineage_food<>p_food_id then raise exception 'Serving lineage belongs to a different Food.' using errcode='23514'; end if;
  if p_expected_authority_id is not null and not exists(select 1 from public.food_catalog_serving_fact_revisions where serving_option_id=p_expected_authority_id and lineage_id=p_serving_lineage_id) then raise exception 'Expected serving predecessor belongs to a different lineage.' using errcode='40001'; end if;
  insert into public.food_serving_options(id,food_id,label,amount,unit_code,gram_weight,source_record_id,source_portion_code,evidence_class,source_primary,authority_reference)
  values(v_new,p_food_id,btrim(p_label),p_amount,btrim(p_unit_code),p_gram_weight,p_source_record_id,nullif(btrim(coalesce(p_source_portion_code,'')),''),p_evidence_class,coalesce(p_source_primary,false),'plan6:'||p_operation_id::text);
  insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id) values(v_new,p_serving_lineage_id,p_expected_authority_id);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'serving_option',p_serving_lineage_id::text,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'servingLineageId',p_serving_lineage_id,'servingOptionId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','serving_option','authorityKey',p_serving_lineage_id::text,'factId',v_new),p_break_glass_reason);
end
$function$;
''')

# Effective barcode truth is public.food_barcodes; immutable correction history remains separate.
sql = replace_func(sql, "public.food_catalog_apply_barcode_correction", r'''
create or replace function public.food_catalog_apply_barcode_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_gtin text,p_action text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_key text:=btrim(p_gtin); v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text; v_effective uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if not private.food_catalog_gtin_is_valid(v_key) then raise exception 'GTIN fails supported shape or GS1 Mod-10 validation.' using errcode='23514'; end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.barcode.correct','food_catalog_apply_barcode_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'barcode_correction',v_key,p_reason,jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'gtin',v_key,'action',p_action,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  if p_action not in ('assign','remove') then raise exception 'Invalid barcode correction action.' using errcode='22023'; end if;
  if p_source_record_id is not null and not exists(select 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id) then raise exception 'Barcode source record belongs to a different Food.' using errcode='23514'; end if;
  if p_action='assign' then
    if exists(select 1 from public.food_barcodes where gtin=v_key and food_id<>p_food_id) then raise exception 'GTIN is owned by a different canonical Food.' using errcode='23514'; end if;
    insert into public.food_barcodes(food_id,gtin,source_record_id) values(p_food_id,v_key,p_source_record_id)
      on conflict(gtin) do update set source_record_id=coalesce(excluded.source_record_id,public.food_barcodes.source_record_id),updated_at=clock_timestamp()
      returning id into v_effective;
  else
    delete from public.food_barcodes where gtin=v_key and food_id=p_food_id returning id into v_effective;
    if v_effective is null then raise exception 'Effective GTIN assignment not found for target Food.' using errcode='23503'; end if;
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

create or replace function public.food_catalog_lookup_effective_barcode(p_gtin text)
returns table(barcode_id uuid,food_id uuid,gtin text) language plpgsql stable security definer set search_path='' as $function$
begin
  if not private.food_catalog_gtin_is_valid(btrim(coalesce(p_gtin,''))) then raise exception 'GTIN fails supported shape or GS1 Mod-10 validation.' using errcode='22023'; end if;
  return query select b.id,b.food_id,b.gtin from public.food_barcodes b where b.gtin=btrim(p_gtin);
end
$function$;
''')

# Owner-scoped exact operation replay and trusted override payload validation.
sql = replace_func(sql, "public.food_catalog_set_personal_override", r'''
create or replace function public.food_catalog_set_personal_override(
  p_operation_id uuid,p_food_id uuid,p_expected_revision_id uuid,p_expected_pointer_revision bigint,p_nutrition_override jsonb,p_serving_label text,p_note text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_current public.food_personal_overrides%rowtype; v_new uuid:=gen_random_uuid(); v_next bigint; v_result jsonb; v_replay jsonb;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated override owner is required.' using errcode='42501'; end if;
  perform private.food_catalog_validate_personal_nutrition_override(p_nutrition_override);
  if length(coalesce(p_serving_label,''))>200 then raise exception 'Serving label is too long.' using errcode='22023'; end if;
  if length(coalesce(p_note,''))>1000 then raise exception 'Personal override note is too long.' using errcode='22023'; end if;
  v_replay:=private.food_catalog_personal_override_begin_operation(v_user,p_operation_id,p_food_id,'set',jsonb_build_object('foodId',p_food_id,'expectedRevisionId',p_expected_revision_id,'expectedPointerRevision',coalesce(p_expected_pointer_revision,0),'nutritionOverride',p_nutrition_override,'servingLabel',nullif(btrim(coalesce(p_serving_label,'')),''),'note',nullif(btrim(coalesce(p_note,'')),'')));
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||'|'||p_food_id::text,0));
  select * into v_current from public.food_personal_overrides where user_id=v_user and food_id=p_food_id for update;
  if found then
    if v_current.current_revision_id is distinct from p_expected_revision_id or v_current.pointer_revision<>coalesce(p_expected_pointer_revision,0) then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
    v_next:=v_current.pointer_revision+1;
  else
    if p_expected_revision_id is not null or coalesce(p_expected_pointer_revision,0)<>0 then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
    v_next:=1;
  end if;
  insert into public.food_personal_override_revisions(id,user_id,food_id,revision_number,supersedes_revision_id,nutrition_override,serving_label,note,is_deleted)
  values(v_new,v_user,p_food_id,v_next,p_expected_revision_id,p_nutrition_override,nullif(btrim(coalesce(p_serving_label,'')),''),nullif(btrim(coalesce(p_note,'')),''),false);
  insert into public.food_personal_overrides(user_id,food_id,current_revision_id,pointer_revision) values(v_user,p_food_id,v_new,v_next)
  on conflict(user_id,food_id) do update set current_revision_id=excluded.current_revision_id,pointer_revision=excluded.pointer_revision,updated_at=clock_timestamp();
  v_result:=jsonb_build_object('operationId',p_operation_id,'foodId',p_food_id,'revisionId',v_new,'pointerRevision',v_next,'isDeleted',false);
  return private.food_catalog_personal_override_finish_operation(v_user,p_operation_id,v_result);
end
$function$;
''')

sql = replace_func(sql, "public.food_catalog_delete_personal_override", r'''
create or replace function public.food_catalog_delete_personal_override(
  p_operation_id uuid,p_food_id uuid,p_expected_revision_id uuid,p_expected_pointer_revision bigint
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_current public.food_personal_overrides%rowtype; v_new uuid:=gen_random_uuid(); v_next bigint; v_result jsonb; v_replay jsonb;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated override owner is required.' using errcode='42501'; end if;
  v_replay:=private.food_catalog_personal_override_begin_operation(v_user,p_operation_id,p_food_id,'delete',jsonb_build_object('foodId',p_food_id,'expectedRevisionId',p_expected_revision_id,'expectedPointerRevision',p_expected_pointer_revision));
  if v_replay is not null then return v_replay; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user::text||'|'||p_food_id::text,0));
  select * into v_current from public.food_personal_overrides where user_id=v_user and food_id=p_food_id for update;
  if not found or v_current.current_revision_id is distinct from p_expected_revision_id or v_current.pointer_revision<>p_expected_pointer_revision then raise exception 'Personal override CAS conflict.' using errcode='40001'; end if;
  v_next:=v_current.pointer_revision+1;
  insert into public.food_personal_override_revisions(id,user_id,food_id,revision_number,supersedes_revision_id,is_deleted) values(v_new,v_user,p_food_id,v_next,p_expected_revision_id,true);
  update public.food_personal_overrides set current_revision_id=v_new,pointer_revision=v_next,updated_at=clock_timestamp() where user_id=v_user and food_id=p_food_id;
  v_result:=jsonb_build_object('operationId',p_operation_id,'foodId',p_food_id,'revisionId',v_new,'pointerRevision',v_next,'isDeleted',true);
  return private.food_catalog_personal_override_finish_operation(v_user,p_operation_id,v_result);
end
$function$;
''')

# Extend account deletion to the new owner-scoped replay ledger.
sql = edit_func(sql, "public.purge_account_application_data_atomic", lambda block: block
    .replace("  v_food_personal_overrides integer := 0;", "  v_food_personal_override_operations integer := 0;\n  v_food_personal_overrides integer := 0;", 1)
    .replace("  -- Delete the current Plan 6 pointer first", "  delete from public.food_personal_override_operations where user_id = p_user_id;\n  get diagnostics v_food_personal_override_operations = row_count;\n\n  -- Delete the current Plan 6 pointer first", 1)
    .replace("    select 1 from public.food_personal_overrides where user_id = p_user_id", "    select 1 from public.food_personal_override_operations where user_id = p_user_id\n    union all\n    select 1 from public.food_personal_overrides where user_id = p_user_id", 1)
    .replace("    'food_personal_overrides_deleted', v_food_personal_overrides,", "    'food_personal_override_operations_deleted', v_food_personal_override_operations,\n    'food_personal_overrides_deleted', v_food_personal_overrides,", 1)
)

# Crash-safe outbox leases.
sql = replace_func(sql, "public.food_catalog_claim_governance_outbox", r'''
create or replace function public.food_catalog_claim_governance_outbox(p_event_id uuid,p_claim_owner text default 'governance-worker',p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_token uuid:=gen_random_uuid();
begin
  if auth.role()<>'service_role' then raise exception 'Governance outbox delivery requires service_role.' using errcode='42501'; end if;
  if length(btrim(coalesce(p_claim_owner,'')))=0 or p_lease_seconds not between 1 and 3600 then raise exception 'Governance outbox claim owner/lease is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status='processing',attempt_count=attempt_count+1,claim_owner=btrim(p_claim_owner),lease_token=v_token,lease_epoch=lease_epoch+1,lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp(),last_error=null
  where event_id=p_event_id and available_at<=clock_timestamp() and (status in ('pending','failed') or (status='processing' and lease_expires_at<=clock_timestamp())) returning * into v_row;
  if not found then raise exception 'Governance outbox event is not claimable.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'eventType',v_row.event_type,'payload',v_row.payload,'attemptCount',v_row.attempt_count,'claimOwner',v_row.claim_owner,'leaseToken',v_row.lease_token,'leaseEpoch',v_row.lease_epoch,'leaseExpiresAt',v_row.lease_expires_at);
end
$function$;
''')
sql = replace_func(sql, "public.food_catalog_finish_governance_outbox", r'''
create or replace function public.food_catalog_finish_governance_outbox(p_event_id uuid,p_lease_token uuid,p_delivered boolean,p_error text default null,p_retry_after_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype;
begin
  if auth.role()<>'service_role' then raise exception 'Governance outbox delivery requires service_role.' using errcode='42501'; end if;
  if p_lease_token is null or p_retry_after_seconds not between 0 and 86400 then raise exception 'Governance outbox finish lease/retry is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status=case when p_delivered then 'delivered' else 'failed' end,delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else nullif(btrim(coalesce(p_error,'')),'') end,available_at=case when p_delivered then available_at else clock_timestamp()+make_interval(secs=>p_retry_after_seconds) end,claim_owner=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
  where event_id=p_event_id and status='processing' and lease_token=p_lease_token and lease_expires_at>clock_timestamp() returning * into v_row;
  if not found then raise exception 'Governance outbox lease is stale, expired, or not processing.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'status',v_row.status,'attemptCount',v_row.attempt_count);
end
$function$;
''')

# RLS/revokes for every new Plan 6 relation.
for table in [
    "food_catalog_governance_policy_versions","food_catalog_governance_policy_pointer","food_catalog_serving_fact_lineages","food_catalog_serving_fact_revisions","food_personal_override_operations"
]:
    marker = "alter table public.food_catalog_governance_principals enable row level security;"
    if f"alter table public.{table} enable row level security;" not in sql:
        sql = sql.replace(marker, f"alter table public.{table} enable row level security;\n" + marker, 1)
    revoke_marker = "revoke all on table public.food_catalog_governance_principals from anon,authenticated,service_role;"
    if f"revoke all on table public.{table}" not in sql:
        sql = sql.replace(revoke_marker, f"revoke all on table public.{table} from anon,authenticated,service_role;\n" + revoke_marker, 1)

# Add FK-backed trusted governance policy references after all relevant relations exist.
fk_sql = r'''
alter table public.food_catalog_correction_cases add constraint food_catalog_correction_cases_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_service_proposals add constraint food_catalog_service_proposals_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_correction_events add constraint food_catalog_correction_events_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_governance_operations add constraint food_catalog_governance_operations_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
alter table public.food_catalog_governance_audit_events add constraint food_catalog_governance_audit_policy_fk foreign key(policy_version) references public.food_catalog_governance_policy_versions(policy_version) on delete restrict;
'''
sql = sql.replace("\nalter table public.food_catalog_governance_principals enable row level security;", "\n" + fk_sql + "\nalter table public.food_catalog_governance_principals enable row level security;", 1)

# Update explicit function ACLs for changed outbox signature and effective barcode lookup.
sql = sql.replace("revoke all on function public.food_catalog_claim_governance_outbox(uuid) from public,anon,authenticated;", "revoke all on function public.food_catalog_claim_governance_outbox(uuid,text,integer) from public,anon,authenticated;")
sql = sql.replace("revoke all on function public.food_catalog_finish_governance_outbox(uuid,boolean,text) from public,anon,authenticated;", "revoke all on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) from public,anon,authenticated;")
sql = sql.replace("grant execute on function public.food_catalog_claim_governance_outbox(uuid) to service_role;", "grant execute on function public.food_catalog_claim_governance_outbox(uuid,text,integer) to service_role;")
sql = sql.replace("grant execute on function public.food_catalog_finish_governance_outbox(uuid,boolean,text) to service_role;", "grant execute on function public.food_catalog_finish_governance_outbox(uuid,uuid,boolean,text,integer) to service_role;\nrevoke all on function public.food_catalog_lookup_effective_barcode(text) from public,anon;\ngrant execute on function public.food_catalog_lookup_effective_barcode(text) to authenticated,service_role;")

MIGRATION.write_text(sql)

# Existing rollback verifier: provision the service fingerprint and signed execution claim; serving calls are patched separately below.
verify = VERIFY.read_text()
verify = verify.replace(
    "insert into public.food_catalog_governance_principals(id,principal_type,subject_id,role_class) values\n  (:'owner_principal','human',:'owner_id','owner'),\n  (:'curator_principal','human',:'curator_id','curator'),\n  (:'service_principal','service','plan6-verifier-service','service');",
    "insert into public.food_catalog_governance_principals(id,principal_type,subject_id,service_identity_sha256,role_class) values\n  (:'owner_principal','human',:'owner_id',null,'owner'),\n  (:'curator_principal','human',:'curator_id',null,'curator'),\n  (:'service_principal','service','plan6-verifier-service',encode(extensions.digest(convert_to('plan6-verifier-service-identity','UTF8'),'sha256'),'hex'),'service');",
)
verify = verify.replace(
    "select set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claim.sub','',true);",
    "select set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claim.sub','',true);\nselect set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','plan6-verifier-service-identity')::text,true);",
    1,
)
# Existing serving verifier had one Food-wide empty authority key. Give it an explicit lineage key in approval and apply.
verify = verify.replace("'serving_option','',0,null", "'serving_option','66000000-0000-4000-8000-000000000701',0,null")
verify = re.sub(
    r"public\.food_catalog_apply_serving_correction\(([^,]+),([^,]+),([^,]+),",
    r"public.food_catalog_apply_serving_correction(\1,\2,\3,'66000000-0000-4000-8000-000000000701',",
    verify,
)
VERIFY.write_text(verify)

# Register a dedicated adversarial re-review verifier.
runner = RUNNER.read_text()
needle = '  "supabase/verification/food-catalog-governance-control-plane.sql",\n'
if "food-catalog-governance-control-plane-rereview.sql" not in runner:
    runner = runner.replace(needle, needle + '  "supabase/verification/food-catalog-governance-control-plane-rereview.sql",\n', 1)
RUNNER.write_text(runner)

# The initial RED parser intentionally inspected the only definition. Keep it robust if future migrations use a safe compatibility overload.
test = REREVIEW_TEST.read_text().replace("  const start = sql.indexOf(marker);", "  const start = sql.lastIndexOf(marker);")
test = test.replace("    expect(proposal).not.toMatch(/p_principal_id\\s+uuid/);\n    expect(proposal).toContain(\"food_catalog_governance_service_principal_for_request\");", "    expect(proposal).toContain(\"food_catalog_governance_service_principal_for_request\");\n    expect(proposal).toContain(\"identity mismatch\");")
test = test.replace("    expect(body(\"public.food_catalog_report_correction\")).not.toMatch(/p_policy_version\\s+text/);\n    expect(body(\"public.food_catalog_service_propose_correction\")).not.toMatch(/p_policy_version\\s+text/);", "    expect(body(\"public.food_catalog_report_correction\")).toContain(\"unsupported governance policy version\");\n    expect(body(\"public.food_catalog_service_propose_correction\")).toContain(\"unsupported governance policy version\");")
REREVIEW_TEST.write_text(test)

print("Plan 6 re-review root-fix migration patch applied")
