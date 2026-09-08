from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql"
PRIMARY_VERIFY = ROOT / "supabase/verification/food-catalog-governance-control-plane.sql"
REREVIEW_VERIFY = ROOT / "supabase/verification/food-catalog-governance-control-plane-rereview.sql"
AUTH_VERIFY = ROOT / "supabase/verification/food-catalog-governance-control-plane-authority-rereview.sql"
RUNNER = ROOT / "scripts/run-database-verification.mjs"
PRINCIPALS = ROOT / "lib/food-catalog/governance/principals.ts"
PRINCIPALS_TEST = ROOT / "lib/food-catalog/governance/principals.test.ts"
DOC = ROOT / "docs/architecture/food-catalog-governance-control-plane.md"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if text.count(old) != 1:
        raise RuntimeError(f"{label}: expected exactly one anchor, got {text.count(old)}")
    return text.replace(old, new, 1)


def replace_func(text: str, name: str, replacement: str) -> str:
    pattern = re.compile(rf"create or replace function {re.escape(name)}\([\s\S]*?\n\$function\$;", re.I)
    text2, count = pattern.subn(lambda _m: replacement.strip(), text, count=1)
    if count != 1:
        raise RuntimeError(f"expected exactly one function block for {name}, got {count}")
    return text2


sql = MIGRATION.read_text()
if "PLAN6_AUTHORITY_REREVIEW_HARDENED" in sql:
    raise SystemExit("Plan 6 authority re-review hardening already applied")

# P1-R3: explicit least-privileged delivery capability.
sql = replace_once(
    sql,
    "    'food.observability.read','food.ingestion.propose'\n",
    "    'food.observability.read','food.ingestion.propose','food.outbox.deliver'\n",
    "capability vocabulary",
)

# P1-R3: lease ownership is bound to the resolved Service principal; the text label remains derived telemetry only.
sql = replace_once(
    sql,
    "  claim_owner text,\n  lease_token uuid,",
    "  claim_owner text,\n  claim_principal_id uuid references public.food_catalog_governance_principals(id) on delete restrict,\n  lease_token uuid,",
    "outbox claim principal",
)
sql = replace_once(
    sql,
    "check ((status='processing' and claim_owner is not null and lease_token is not null and lease_acquired_at is not null and lease_expires_at is not null) or (status<>'processing' and claim_owner is null and lease_token is null and lease_acquired_at is null and lease_expires_at is null))",
    "check ((status='processing' and claim_owner is not null and claim_principal_id is not null and lease_token is not null and lease_acquired_at is not null and lease_expires_at is not null) or (status<>'processing' and claim_owner is null and claim_principal_id is null and lease_token is null and lease_acquired_at is null and lease_expires_at is null))",
    "outbox processing invariant",
)

# P1-R1: Name facts are genuinely multi-valued, so lineage identity is explicit just like serving facts.
name_tables = r'''

-- PLAN6_AUTHORITY_REREVIEW_HARDENED: stable lineage authority for genuinely multi-valued Name facts.
create table public.food_catalog_name_fact_lineages (
  lineage_id uuid primary key,
  food_id uuid not null references public.food_items(id) on delete restrict,
  created_at timestamptz not null default now()
);
create table public.food_catalog_name_fact_revisions (
  name_fact_id uuid primary key references public.food_names(id) on delete restrict,
  lineage_id uuid not null references public.food_catalog_name_fact_lineages(lineage_id) on delete restrict,
  predecessor_name_fact_id uuid references public.food_names(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(lineage_id,name_fact_id),
  foreign key(lineage_id,predecessor_name_fact_id)
    references public.food_catalog_name_fact_revisions(lineage_id,name_fact_id) on delete restrict,
  check (predecessor_name_fact_id is null or predecessor_name_fact_id<>name_fact_id)
);
'''
sql = replace_once(
    sql,
    "\ncreate table public.food_personal_override_operations (",
    name_tables + "\ncreate table public.food_personal_override_operations (",
    "name lineage tables",
)

sql = replace_once(
    sql,
    "create trigger food_catalog_correction_reports_immutable",
    "create trigger food_catalog_name_fact_lineages_immutable before update or delete on public.food_catalog_name_fact_lineages for each row execute function private.reject_food_catalog_governance_immutable_mutation();\ncreate trigger food_catalog_name_fact_revisions_immutable before update or delete on public.food_catalog_name_fact_revisions for each row execute function private.reject_food_catalog_governance_immutable_mutation();\ncreate trigger food_catalog_correction_reports_immutable",
    "name lineage immutable triggers",
)

# P1-R2: initial CAS predecessor must match the exact semantic key, not just Food/kind.
matcher = r'''
create or replace function private.food_catalog_governance_authority_fact_matches_key(
  p_food_id uuid,p_kind text,p_key text,p_fact_id uuid
) returns boolean language plpgsql stable security definer set search_path='' as $function$
begin
  if p_fact_id is null then return true; end if;
  case p_kind
    when 'nutrition_revision' then
      return coalesce(p_key,'')='' and exists(select 1 from public.food_nutrition_revisions f where f.id=p_fact_id and f.food_id=p_food_id);
    when 'serving_option' then
      return exists(
        select 1 from public.food_catalog_serving_fact_revisions r
        join public.food_catalog_serving_fact_lineages l on l.lineage_id=r.lineage_id
        where r.serving_option_id=p_fact_id and l.food_id=p_food_id and r.lineage_id::text=coalesce(p_key,'')
      );
    when 'name_fact' then
      return exists(
        select 1 from public.food_catalog_name_fact_revisions r
        join public.food_catalog_name_fact_lineages l on l.lineage_id=r.lineage_id
        where r.name_fact_id=p_fact_id and l.food_id=p_food_id and r.lineage_id::text=coalesce(p_key,'')
      );
    when 'barcode_correction' then
      return exists(select 1 from public.food_barcodes f where f.id=p_fact_id and f.food_id=p_food_id and f.gtin=coalesce(p_key,''))
        or exists(select 1 from public.food_catalog_barcode_corrections f where f.id=p_fact_id and f.food_id=p_food_id and f.gtin=coalesce(p_key,''));
    when 'taxonomy_assignment' then
      return exists(select 1 from public.food_taxonomy_assignments f where f.id=p_fact_id and f.food_id=p_food_id and f.node_code=coalesce(p_key,''));
    when 'market_assignment' then
      return exists(select 1 from public.food_market_assignments f where f.id=p_fact_id and f.food_id=p_food_id and f.scope_code=coalesce(p_key,''));
    when 'identity_merge' then
      return coalesce(p_key,'')='' and exists(select 1 from public.food_merge_events f where f.id=p_fact_id and f.source_food_id=p_food_id);
    when 'lifecycle' then
      return coalesce(p_key,'')='' and exists(select 1 from public.food_catalog_governance_lifecycle_events f where f.id=p_fact_id and f.food_id=p_food_id);
    else
      return false;
  end case;
end
$function$;
'''
sql = replace_once(
    sql,
    "\ncreate or replace function private.food_catalog_governance_lock_authority(",
    "\n" + matcher + "\ncreate or replace function private.food_catalog_governance_lock_authority(",
    "exact semantic predecessor matcher",
)

lock_fn = r'''
create or replace function private.food_catalog_governance_lock_authority(
  p_food_id uuid,p_kind text,p_key text,p_expected_revision bigint,p_expected_fact_id uuid
) returns public.food_catalog_governance_authority_revisions language plpgsql security definer set search_path='' as $function$
declare v_head public.food_catalog_governance_authority_revisions%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_food_id::text||'|'||p_kind||'|'||coalesce(p_key,''),0));
  select * into v_head from public.food_catalog_governance_authority_revisions
  where food_id=p_food_id and authority_kind=p_kind and authority_key=coalesce(p_key,'') for update;
  if not found then
    if coalesce(p_expected_revision,0)<>0 then raise exception 'Food governance authority CAS conflict.' using errcode='40001'; end if;
    if p_expected_fact_id is not null and not private.food_catalog_governance_authority_fact_matches_key(p_food_id,p_kind,coalesce(p_key,''),p_expected_fact_id) then
      raise exception 'Expected Food governance authority predecessor does not match target Food/kind/key.' using errcode='23514';
    end if;
    v_head.food_id:=p_food_id;
    v_head.authority_kind:=p_kind;
    v_head.authority_key:=coalesce(p_key,'');
    v_head.authority_revision:=0;
    v_head.current_fact_id:=p_expected_fact_id;
  elsif v_head.authority_revision<>coalesce(p_expected_revision,0) or v_head.current_fact_id is distinct from p_expected_fact_id then
    raise exception 'Food governance authority CAS conflict.' using errcode='40001';
  end if;
  return v_head;
end
$function$;
'''
sql = replace_func(sql, "private.food_catalog_governance_lock_authority", lock_fn)

# Reorder serving lineage initialization before generic CAS validation so exact-key predecessor matching remains valid.
serving_fn = r'''
create or replace function public.food_catalog_apply_serving_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_serving_lineage_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_label text,p_amount numeric,p_unit_code text,p_gram_weight numeric,p_source_record_id uuid,p_source_portion_code text,p_evidence_class text,p_source_primary boolean,p_reason text,p_break_glass_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_lineage_food uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if p_serving_lineage_id is null then raise exception 'Serving lineage ID is required.' using errcode='22023'; end if;
  if p_break_glass_reason is not null then perform private.food_catalog_governance_assert_capability(v_actor,'food.break_glass'); if length(btrim(p_break_glass_reason))=0 then raise exception 'Break-glass reason is required.' using errcode='22023'; end if; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_food_id::text||'|serving_lineage|'||p_serving_lineage_id::text,0));
  select food_id into v_lineage_food from public.food_catalog_serving_fact_lineages where lineage_id=p_serving_lineage_id for update;
  if v_lineage_food is null then
    insert into public.food_catalog_serving_fact_lineages(lineage_id,food_id) values(p_serving_lineage_id,p_food_id);
    if p_expected_authority_id is not null then
      perform 1 from public.food_serving_options where id=p_expected_authority_id and food_id=p_food_id;
      if not found then raise exception 'Expected predecessor serving option not found.' using errcode='40001'; end if;
      insert into public.food_catalog_serving_fact_revisions(serving_option_id,lineage_id,predecessor_serving_option_id)
      values(p_expected_authority_id,p_serving_lineage_id,null) on conflict(serving_option_id) do nothing;
    end if;
  elsif v_lineage_food<>p_food_id then
    raise exception 'Serving lineage belongs to a different Food.' using errcode='23514';
  end if;
  if p_expected_authority_id is not null and not exists(select 1 from public.food_catalog_serving_fact_revisions where serving_option_id=p_expected_authority_id and lineage_id=p_serving_lineage_id) then
    raise exception 'Expected serving predecessor belongs to a different lineage.' using errcode='40001';
  end if;
  if p_expected_authority_id is null and exists(select 1 from public.food_catalog_serving_fact_revisions where lineage_id=p_serving_lineage_id) then
    raise exception 'Explicit predecessor serving option is required for an existing lineage.' using errcode='40001';
  end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.serving.correct','food_catalog_apply_serving_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'serving_option',p_serving_lineage_id::text,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'servingLineageId',p_serving_lineage_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'label',p_label,'amount',p_amount,'unitCode',p_unit_code,'gramWeight',p_gram_weight,'sourceRecordId',p_source_record_id,'sourcePortionCode',p_source_portion_code,'evidenceClass',p_evidence_class,'sourcePrimary',p_source_primary,'breakGlassReason',p_break_glass_reason));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
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
'''
sql = replace_func(sql, "public.food_catalog_apply_serving_correction", serving_fn)

name_fn = r'''
create or replace function public.food_catalog_apply_name_correction(
  p_operation_id uuid,p_case_id uuid,p_food_id uuid,p_name_lineage_id uuid,p_expected_case_revision bigint,p_expected_authority_revision bigint,p_expected_authority_id uuid,
  p_language_tag text,p_name_role text,p_name_text text,p_normalized_text text,p_script_code text,p_source_record_id uuid,p_reason text
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor uuid; v_pre jsonb; v_new uuid:=gen_random_uuid(); v_revision bigint; v_case_revision bigint; v_result jsonb; v_evidence uuid[]; v_policy text; v_lineage_food uuid;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  if p_name_lineage_id is null then raise exception 'Name lineage ID is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_food_id::text||'|name_lineage|'||p_name_lineage_id::text,0));
  select food_id into v_lineage_food from public.food_catalog_name_fact_lineages where lineage_id=p_name_lineage_id for update;
  if v_lineage_food is null then
    insert into public.food_catalog_name_fact_lineages(lineage_id,food_id) values(p_name_lineage_id,p_food_id);
    if p_expected_authority_id is not null then
      perform 1 from public.food_names where id=p_expected_authority_id and food_id=p_food_id;
      if not found then raise exception 'Expected predecessor Name fact not found.' using errcode='40001'; end if;
      insert into public.food_catalog_name_fact_revisions(name_fact_id,lineage_id,predecessor_name_fact_id)
      values(p_expected_authority_id,p_name_lineage_id,null) on conflict(name_fact_id) do nothing;
    end if;
  elsif v_lineage_food<>p_food_id then
    raise exception 'Name lineage belongs to a different Food.' using errcode='23514';
  end if;
  if p_expected_authority_id is not null and not exists(select 1 from public.food_catalog_name_fact_revisions where name_fact_id=p_expected_authority_id and lineage_id=p_name_lineage_id) then
    raise exception 'Expected Name predecessor belongs to a different lineage.' using errcode='40001';
  end if;
  if p_expected_authority_id is null and exists(select 1 from public.food_catalog_name_fact_revisions where lineage_id=p_name_lineage_id) then
    raise exception 'Explicit predecessor Name fact is required for an existing lineage.' using errcode='40001';
  end if;
  v_pre:=private.food_catalog_governance_prepare_apply(p_operation_id,v_actor,'food.name.correct','food_catalog_apply_name_correction',p_case_id,p_food_id,p_expected_case_revision,p_expected_authority_revision,p_expected_authority_id,'name_fact',p_name_lineage_id::text,p_reason,
    jsonb_build_object('caseId',p_case_id,'foodId',p_food_id,'nameLineageId',p_name_lineage_id,'expectedCaseRevision',p_expected_case_revision,'expectedAuthorityRevision',p_expected_authority_revision,'expectedAuthorityId',p_expected_authority_id,'languageTag',p_language_tag,'nameRole',p_name_role,'nameText',p_name_text,'normalizedText',p_normalized_text,'scriptCode',p_script_code,'sourceRecordId',p_source_record_id));
  if (v_pre->>'replay')::boolean then return v_pre->'result'; end if;
  select policy_version into v_policy from public.food_catalog_correction_cases where id=p_case_id;
  insert into public.food_names(id,food_id,language_tag,name_role,name_text,normalized_text,script_code,origin,source_record_id,policy_version)
  values(v_new,p_food_id,btrim(p_language_tag),p_name_role,btrim(p_name_text),btrim(p_normalized_text),nullif(btrim(coalesce(p_script_code,'')),''),'curated',p_source_record_id,v_policy);
  insert into public.food_catalog_name_fact_revisions(name_fact_id,lineage_id,predecessor_name_fact_id) values(v_new,p_name_lineage_id,p_expected_authority_id);
  v_revision:=private.food_catalog_governance_advance_authority(p_food_id,'name_fact',p_name_lineage_id::text,v_new);
  v_case_revision:=private.food_catalog_governance_mark_case_applied(p_case_id,p_operation_id,v_actor,p_reason);
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_evidence from public.food_catalog_correction_evidence where case_id=p_case_id;
  v_result:=jsonb_build_object('foodId',p_food_id,'nameLineageId',p_name_lineage_id,'nameId',v_new,'authorityRevision',v_revision,'caseRevision',v_case_revision);
  return private.food_catalog_governance_finish_operation(p_operation_id,p_expected_authority_id,v_new,v_evidence,v_result,'food.correction.applied',jsonb_build_object('foodId',p_food_id,'authorityKind','name_fact','authorityKey',p_name_lineage_id::text,'factId',v_new));
end
$function$;
'''
sql = replace_func(sql, "public.food_catalog_apply_name_correction", name_fn)

# Service principal provisioning may explicitly grant delivery, but it remains service-only and not a default capability.
sql = replace_once(
    sql,
    "if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose') then raise exception 'Service principal governance escalation is forbidden.' using errcode='23514'; end if;",
    "if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose','food.outbox.deliver') then raise exception 'Service principal governance escalation is forbidden.' using errcode='23514'; end if;\n    if v_cap='food.outbox.deliver' and p_target_principal_type<>'service' then raise exception 'Governance outbox delivery capability is Service-principal-only.' using errcode='23514'; end if;",
    "service outbox capability provisioning",
)

claim_fn = r'''
create or replace function public.food_catalog_claim_governance_outbox(p_event_id uuid,p_lease_seconds integer default 300)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_token uuid:=gen_random_uuid(); v_actor uuid;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.outbox.deliver');
  if p_lease_seconds not between 1 and 3600 then raise exception 'Governance outbox lease is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status='processing',attempt_count=attempt_count+1,claim_owner=v_actor::text,claim_principal_id=v_actor,lease_token=v_token,lease_epoch=lease_epoch+1,lease_acquired_at=clock_timestamp(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),updated_at=clock_timestamp(),last_error=null
  where event_id=p_event_id and available_at<=clock_timestamp() and (status in ('pending','failed') or (status='processing' and lease_expires_at<=clock_timestamp())) returning * into v_row;
  if not found then raise exception 'Governance outbox event is not claimable.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'eventType',v_row.event_type,'payload',v_row.payload,'attemptCount',v_row.attempt_count,'claimOwner',v_row.claim_owner,'claimPrincipalId',v_row.claim_principal_id,'leaseToken',v_row.lease_token,'leaseEpoch',v_row.lease_epoch,'leaseExpiresAt',v_row.lease_expires_at);
end
$function$;
'''
sql = replace_func(sql, "public.food_catalog_claim_governance_outbox", claim_fn)

finish_fn = r'''
create or replace function public.food_catalog_finish_governance_outbox(p_event_id uuid,p_lease_token uuid,p_delivered boolean,p_error text default null,p_retry_after_seconds integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_row public.food_catalog_governance_outbox%rowtype; v_actor uuid;
begin
  v_actor:=private.food_catalog_governance_service_principal_for_request();
  perform private.food_catalog_governance_assert_capability(v_actor,'food.outbox.deliver');
  if p_lease_token is null or p_retry_after_seconds not between 0 and 86400 then raise exception 'Governance outbox finish lease/retry is invalid.' using errcode='22023'; end if;
  update public.food_catalog_governance_outbox set status=case when p_delivered then 'delivered' else 'failed' end,delivered_at=case when p_delivered then clock_timestamp() else null end,last_error=case when p_delivered then null else nullif(btrim(coalesce(p_error,'')),'') end,available_at=case when p_delivered then available_at else clock_timestamp()+make_interval(secs=>p_retry_after_seconds) end,claim_owner=null,claim_principal_id=null,lease_token=null,lease_acquired_at=null,lease_expires_at=null,updated_at=clock_timestamp()
  where event_id=p_event_id and status='processing' and claim_principal_id=v_actor and lease_token=p_lease_token and lease_expires_at>clock_timestamp() returning * into v_row;
  if not found then raise exception 'Governance outbox lease is stale, expired, owned by another Service principal, or not processing.' using errcode='40001'; end if;
  return jsonb_build_object('eventId',v_row.event_id,'status',v_row.status,'attemptCount',v_row.attempt_count);
end
$function$;
'''
sql = replace_func(sql, "public.food_catalog_finish_governance_outbox", finish_fn)
sql = replace_once(sql, "revoke all on function public.food_catalog_claim_governance_outbox(uuid,text,integer) from public,anon,authenticated;", "revoke all on function public.food_catalog_claim_governance_outbox(uuid,integer) from public,anon,authenticated;", "claim revoke signature")
sql = replace_once(sql, "grant execute on function public.food_catalog_claim_governance_outbox(uuid,text,integer) to service_role;", "grant execute on function public.food_catalog_claim_governance_outbox(uuid,integer) to service_role;", "claim grant signature")

# RLS/ACL for Name lineage authority.
sql = replace_once(
    sql,
    "alter table public.food_catalog_serving_fact_revisions enable row level security;\nalter table public.food_personal_override_operations enable row level security;",
    "alter table public.food_catalog_serving_fact_revisions enable row level security;\nalter table public.food_catalog_name_fact_lineages enable row level security;\nalter table public.food_catalog_name_fact_revisions enable row level security;\nalter table public.food_personal_override_operations enable row level security;",
    "name lineage RLS",
)
sql = replace_once(
    sql,
    "revoke all on table public.food_catalog_serving_fact_revisions from anon,authenticated,service_role;\nrevoke all on table public.food_personal_override_operations from anon,authenticated,service_role;",
    "revoke all on table public.food_catalog_serving_fact_revisions from anon,authenticated,service_role;\nrevoke all on table public.food_catalog_name_fact_lineages from anon,authenticated,service_role;\nrevoke all on table public.food_catalog_name_fact_revisions from anon,authenticated,service_role;\nrevoke all on table public.food_personal_override_operations from anon,authenticated,service_role;",
    "name lineage ACL",
)
MIGRATION.write_text(sql)

# TS capability vocabulary mirrors the database while keeping delivery opt-in only.
principals = PRINCIPALS.read_text()
principals = replace_once(principals, '  "food.ingestion.propose",\n', '  "food.ingestion.propose",\n  "food.outbox.deliver",\n', 'TS outbox capability')
principals = replace_once(
    principals,
    'const OWNER_CAPABILITIES = FOOD_GOVERNANCE_CAPABILITIES.filter((capability) => capability !== "food.ingestion.propose");',
    'const OWNER_CAPABILITIES = FOOD_GOVERNANCE_CAPABILITIES.filter((capability) => capability !== "food.ingestion.propose" && capability !== "food.outbox.deliver");',
    'Owner default excludes delivery',
)
PRINCIPALS.write_text(principals)

pt = PRINCIPALS_TEST.read_text()
pt = replace_once(
    pt,
    '    expect(() => assertFoodGovernanceCapability(service, "food.governance.manage_principals")).toThrow(/capability denied/i);',
    '    expect(() => assertFoodGovernanceCapability(service, "food.governance.manage_principals")).toThrow(/capability denied/i);\n    expect(DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.service).not.toContain("food.outbox.deliver");\n    expect(DEFAULT_FOOD_GOVERNANCE_CAPABILITIES.owner).not.toContain("food.outbox.deliver");',
    'default outbox capability test',
)
PRINCIPALS_TEST.write_text(pt)

# Existing primary verifier now provisions one explicit worker Service principal and uses trusted execution identity.
pv = PRIMARY_VERIFY.read_text()
pv = replace_once(
    pv,
    "select :'service_principal',capability,'plan6-verifier-service' from unnest(array['food.correction.report','food.evidence.attach','food.ingestion.propose']) capability;",
    "select :'service_principal',capability,'plan6-verifier-service' from unnest(array['food.correction.report','food.evidence.attach','food.ingestion.propose','food.outbox.deliver']) capability;",
    'primary service capability fixture',
)
pv = replace_once(
    pv,
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect (public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422','governance-worker',300))->>'leaseToken' as primary_retry_lease_a \\gset",
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','plan6-verifier-service-identity')::text,true);\nselect (public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422',300))->>'leaseToken' as primary_retry_lease_a \\gset",
    'primary outbox trusted identity',
)
pv = pv.replace("public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422','governance-worker',300)", "public.food_catalog_claim_governance_outbox('66000000-0000-4000-8000-000000000422',300)")
PRIMARY_VERIFY.write_text(pv)

# Previous re-review verifier keeps its lease/retry coverage but now executes as the explicit worker Service principal.
rv = REREVIEW_VERIFY.read_text()
rv = replace_once(
    rv,
    "  (:'service_a','food.ingestion.propose','service-a-propose'),",
    "  (:'service_a','food.ingestion.propose','service-a-propose'),\n  (:'service_a','food.outbox.deliver','service-a-outbox'),",
    'rereview service worker capability',
)
first_outbox = "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550','worker-a',300))->>'leaseToken' as lease_a \\gset"
rv = replace_once(
    rv,
    first_outbox,
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550',300))->>'leaseToken' as lease_a \\gset",
    'rereview outbox trusted identity',
)
# Every later service_role block in the outbox section needs the same trusted claim; harmless duplicates are avoided by exact replacement.
rv = rv.replace(
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550','worker-b',300))",
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000550',300))",
)
rv = rv.replace(
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000552','worker-retry-b',300))",
    "set local role service_role;\nselect set_config('request.jwt.claim.role','service_role',true);\nselect set_config('request.jwt.claims',jsonb_build_object('role','service_role','plaivra_food_service_identity','service-a-identity')::text,true);\nselect (public.food_catalog_claim_governance_outbox('67000000-0000-4000-8000-000000000552',300))",
)
rv = re.sub(r"public\.food_catalog_claim_governance_outbox\(([^,\n]+),'worker-[^']+',300\)", r"public.food_catalog_claim_governance_outbox(\1,300)", rv)
REREVIEW_VERIFY.write_text(rv)

# Permanent adversarial database verifier for R1/R2/R3.
AUTH_VERIFY.write_text(r'''\set ON_ERROR_STOP on
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
''')

runner = RUNNER.read_text()
runner = replace_once(
    runner,
    '  "supabase/verification/food-catalog-governance-control-plane-rereview.sql",\n',
    '  "supabase/verification/food-catalog-governance-control-plane-rereview.sql",\n  "supabase/verification/food-catalog-governance-control-plane-authority-rereview.sql",\n',
    'register authority verifier',
)
RUNNER.write_text(runner)

# Architecture documentation records the durable authority choices without changing Plan scope.
doc = DOC.read_text()
if "Name fact lineages" not in doc:
    doc += r'''

## Deeper authority re-review hardening

### Name fact lineages

Name facts are genuinely multi-valued. `food_catalog_name_fact_lineages` and `food_catalog_name_fact_revisions` give each independent Name fact a stable lineage and predecessor chain. The governance head key for `name_fact` is the lineage UUID, never `language_tag:name_role`, so multiple synonyms, aliases, or transliterations with the same language and role remain independently correctable while old Name facts stay immutable history. Plan 3 generation membership remains fact-ID based and can continue selecting multiple Name facts.

### Exact semantic predecessor validation

Initial governance-head seeding validates the predecessor against the exact semantic key. Name uses lineage identity; serving uses serving lineage; barcode uses exact GTIN; taxonomy uses exact `node_code`; market uses exact `scope_code`. Same-Food membership alone is not predecessor authority, so audit `old_authority_id` and CAS initialization cannot be seeded from an unrelated keyed fact.

### Outbox Service-principal authority

Governance outbox delivery is an explicit opt-in Service capability: `food.outbox.deliver`. Claim and finish resolve the non-forgeable `plaivra_food_service_identity` execution claim through the existing Service-principal hash binding, require that capability, and bind the active lease to the resolved principal. Generic `service_role`, an unrelated Service principal, or caller-authored worker text is not delivery authority. Lease expiry/reclaim, stale-token rejection, `available_at`, retry scheduling, and terminal delivery semantics remain local Postgres control-plane behavior with no paid queue dependency.
'''
DOC.write_text(doc)

print("Plan 6 authority re-review root fix applied")
