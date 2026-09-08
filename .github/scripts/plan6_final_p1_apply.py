from __future__ import annotations

from pathlib import Path
import hashlib
import json

ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql"
ROUTE = ROOT / "app/api/user/privacy-requests/route.ts"
WORKER = ROOT / "lib/privacy/account-deletion-worker.ts"
DOC = ROOT / "docs/architecture/food-catalog-governance-control-plane.md"
CONCURRENCY = ROOT / "scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs"
LEDGER = ROOT / "supabase/migration-ledger.json"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_section(text: str, start: str, end: str, new: str, label: str) -> str:
    i = text.find(start)
    if i < 0:
        raise RuntimeError(f"{label}: start marker missing")
    j = text.find(end, i + len(start))
    if j < 0:
        raise RuntimeError(f"{label}: end marker missing")
    return text[:i] + new + text[j:]


sql = MIGRATION.read_text()

sql = replace_section(
    sql,
    "create table public.food_catalog_governance_principals (",
    "create table public.food_catalog_governance_capability_assignments (",
    """create table public.food_catalog_governance_principals (
  id uuid primary key default gen_random_uuid(),
  principal_type text not null check (principal_type in ('human','service')),
  subject_id text not null check (length(btrim(subject_id)) > 0),
  -- Historical principal identity survives Auth deletion. For human principals the
  -- authorization subject is a strongly typed UUID derived once from subject_id;
  -- Service principals never populate this column.
  human_user_id uuid generated always as (
    case when principal_type='human' then btrim(subject_id)::uuid else null end
  ) stored,
  service_identity_sha256 text,
  role_class text not null check (role_class in ('owner','curator','service')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (principal_type, subject_id),
  check ((principal_type='service' and role_class='service') or (principal_type='human' and role_class in ('owner','curator'))),
  check (
    (principal_type='service' and human_user_id is null and service_identity_sha256 ~ '^[0-9a-f]{64}$')
    or (principal_type='human' and human_user_id is not null and service_identity_sha256 is null)
  ),
  check ((active and revoked_at is null) or (not active and revoked_at is not null))
);
create unique index food_catalog_governance_human_user_uq
  on public.food_catalog_governance_principals(human_user_id) where principal_type='human';
create unique index food_catalog_governance_service_identity_uq
  on public.food_catalog_governance_principals(service_identity_sha256) where principal_type='service';

""",
    "principals schema",
)

sql = replace_once(
    sql,
    """insert into public.food_catalog_governance_principals (principal_type, subject_id, role_class)
select 'human', profile.id::text, 'owner'
from public.profiles profile
where profile.role='admin'
on conflict (principal_type, subject_id) do nothing;
""",
    """insert into public.food_catalog_governance_principals (principal_type, subject_id, role_class)
select 'human', profile.id::text, 'owner'
from public.profiles profile
join auth.users auth_user on auth_user.id=profile.id
join public.account_access_states access_state
  on access_state.user_id=profile.id
 and access_state.state='active'
 and access_state.disabled_at is null
where profile.role='admin'
on conflict (principal_type, subject_id) do nothing;
""",
    "bootstrap only live owners",
)

sql = replace_section(
    sql,
    "create table public.food_catalog_correction_reports (",
    "create table public.food_catalog_correction_evidence (",
    """create table public.food_catalog_correction_reports (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.food_catalog_correction_cases(id) on delete restrict,
  created_at timestamptz not null default now()
);
create index food_catalog_correction_reports_case_idx
  on public.food_catalog_correction_reports(case_id,created_at,id);

-- Member-authored intake payload is deliberately separate from durable global
-- report metadata. It is owner data and participates in canonical account purge.
create table public.food_catalog_correction_report_member_payloads (
  report_id uuid primary key references public.food_catalog_correction_reports(id) on delete cascade,
  reporter_user_id uuid not null,
  description text not null check (length(btrim(description)) between 1 and 2000),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence)='object' and pg_column_size(evidence) <= 8192),
  created_at timestamptz not null default now()
);
create index food_catalog_correction_report_member_payloads_owner_idx
  on public.food_catalog_correction_report_member_payloads(reporter_user_id,created_at,report_id);

""",
    "correction report payload split",
)

sql = replace_once(
    sql,
    "create trigger food_catalog_correction_reports_immutable before update or delete on public.food_catalog_correction_reports for each row execute function private.reject_food_catalog_governance_immutable_mutation();\n",
    """create trigger food_catalog_correction_reports_immutable before update or delete on public.food_catalog_correction_reports for each row execute function private.reject_food_catalog_governance_immutable_mutation();
-- Member payload may be physically deleted only through the canonical privacy
-- SECURITY DEFINER path; direct UPDATE remains immutable.
create trigger food_catalog_correction_report_member_payloads_immutable before update on public.food_catalog_correction_report_member_payloads for each row execute function private.reject_food_catalog_governance_immutable_mutation();
""",
    "member payload immutability trigger",
)

principal_marker = "create or replace function private.food_catalog_governance_principal_for_user()"
helpers = """-- PLAN6_FINAL_P1_HARDENED: one account-lifecycle lock, one live-human
-- authority model, and one canonical Food-before-GTIN writer order.
create or replace function private.food_catalog_lock_account_purge(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if p_user_id is null then raise exception 'Account serialization identity is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:'||p_user_id::text,0));
end
$function$;

create or replace function private.food_catalog_governance_require_active_member_account(p_user_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if auth.uid() is null or auth.uid()<>p_user_id then
    raise exception 'Food Catalog member account identity mismatch.' using errcode='42501';
  end if;
  perform private.food_catalog_lock_account_purge(p_user_id);
  perform 1
  from auth.users auth_user
  join public.account_access_states access_state on access_state.user_id=auth_user.id
  where auth_user.id=p_user_id and access_state.state='active' and access_state.disabled_at is null
  for share of access_state;
  if not found then
    raise exception 'Food Catalog member action requires an active, non-disabled account.' using errcode='42501';
  end if;
end
$function$;

"""
if helpers in sql:
    raise RuntimeError("helpers already inserted")
sql = sql.replace(principal_marker, helpers + principal_marker, 1)

sql = replace_section(
    sql,
    "create or replace function private.food_catalog_governance_principal_for_user()",
    "create or replace function private.food_catalog_governance_service_principal_for_request()",
    """create or replace function private.food_catalog_governance_principal_for_user()
returns uuid language plpgsql security definer set search_path='' as $function$
declare v_user uuid:=auth.uid(); v_principal uuid;
begin
  if v_user is null then raise exception 'Authenticated Food governance principal is required.' using errcode='42501'; end if;
  perform private.food_catalog_lock_account_purge(v_user);
  select p.id into v_principal
  from public.food_catalog_governance_principals p
  join auth.users auth_user on auth_user.id=p.human_user_id
  join public.account_access_states access_state
    on access_state.user_id=auth_user.id
   and access_state.state='active'
   and access_state.disabled_at is null
  where p.principal_type='human'
    and p.human_user_id=auth.uid()
    and p.active
    and p.revoked_at is null
  for share of access_state;
  if v_principal is null then raise exception 'Authenticated member has no live Food governance principal.' using errcode='42501'; end if;
  return v_principal;
end
$function$;


""",
    "live human resolver",
)

sql = replace_section(
    sql,
    "create or replace function private.food_catalog_governance_assert_recovery_survives(p_target_principal_id uuid)",
    "-- PLAN6_FIVE_P1_HARDENED: shared cross-plan serialization and recovery/privacy locks.",
    """create or replace function private.food_catalog_governance_assert_recovery_survives(p_target_principal_id uuid)
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_principals p
    join auth.users auth_user on auth_user.id=p.human_user_id
    join public.account_access_states access_state
      on access_state.user_id=auth_user.id
     and access_state.state='active'
     and access_state.disabled_at is null
    join public.food_catalog_governance_capability_assignments a
      on a.principal_id=p.id
     and a.capability='food.governance.manage_principals'
     and a.revoked_at is null
    where p.principal_type='human'
      and p.role_class='owner'
      and p.active
      and p.revoked_at is null
      and p.id<>p_target_principal_id
  ) then raise exception 'Final usable Owner recovery authority cannot be removed.' using errcode='23514'; end if;
end
$function$;


""",
    "usable recovery survives",
)

sql = replace_section(
    sql,
    "create or replace function private.food_catalog_lock_gtin_authority(p_gtin text)",
    "create or replace function private.food_catalog_governance_lock_recovery_set()",
    """create or replace function private.food_catalog_lock_food_authority(p_food_id uuid)
returns void language plpgsql security definer set search_path='' as $function$
begin
  if p_food_id is null then raise exception 'Canonical Food identity is required.' using errcode='22023'; end if;
  perform 1 from public.food_items where id=p_food_id for update;
  if not found then raise exception 'Canonical Food not found.' using errcode='23503'; end if;
end
$function$;

create or replace function private.food_catalog_lock_gtin_authority(p_gtin text)
returns void language plpgsql security definer set search_path='' as $function$
declare v_gtin text:=btrim(coalesce(p_gtin,''));
begin
  if length(v_gtin)=0 then raise exception 'GTIN serialization key is required.' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended('food-catalog-gtin:'||v_gtin,0));
end
$function$;

-- Safety trigger for every privileged food_barcodes writer, including the already-
-- applied Plan 4 runtime. Lock order is always Food row(s), then normalized GTIN(s).
create or replace function private.food_catalog_serialize_gtin_write()
returns trigger language plpgsql security definer set search_path='' as $function$
declare v_old text; v_new text; v_food uuid; v_gtin text;
begin
  if tg_op='INSERT' then
    perform private.food_catalog_lock_food_authority(new.food_id);
    perform private.food_catalog_lock_gtin_authority(new.gtin);
    return new;
  elsif tg_op='DELETE' then
    perform private.food_catalog_lock_food_authority(old.food_id);
    perform private.food_catalog_lock_gtin_authority(old.gtin);
    return old;
  end if;

  for v_food in
    select distinct x from unnest(array[old.food_id,new.food_id]) as t(x)
    where x is not null order by x
  loop
    perform private.food_catalog_lock_food_authority(v_food);
  end loop;

  v_old:=btrim(coalesce(old.gtin,''));
  v_new:=btrim(coalesce(new.gtin,''));
  for v_gtin in
    select distinct x from unnest(array[v_old,v_new]) as t(x)
    where length(x)>0 order by x
  loop
    perform private.food_catalog_lock_gtin_authority(v_gtin);
  end loop;
  return new;
end
$function$;

drop trigger if exists food_barcodes_global_gtin_serialization on public.food_barcodes;
create trigger food_barcodes_global_gtin_serialization
before insert or update or delete on public.food_barcodes
for each row execute function private.food_catalog_serialize_gtin_write();

""",
    "Food then GTIN global trigger",
)

sql = replace_section(
    sql,
    "create or replace function private.food_catalog_governance_assert_recovery_exists()",
    "create or replace function private.food_catalog_lock_food_pair(p_food_a uuid,p_food_b uuid)",
    """create or replace function private.food_catalog_governance_assert_recovery_exists()
returns void language plpgsql stable security definer set search_path='' as $function$
begin
  if not exists(
    select 1
    from public.food_catalog_governance_principals p
    join auth.users auth_user on auth_user.id=p.human_user_id
    join public.account_access_states access_state
      on access_state.user_id=auth_user.id
     and access_state.state='active'
     and access_state.disabled_at is null
    join public.food_catalog_governance_capability_assignments a
      on a.principal_id=p.id
     and a.capability='food.governance.manage_principals'
     and a.revoked_at is null
    where p.principal_type='human'
      and p.role_class='owner'
      and p.active
      and p.revoked_at is null
  ) then
    raise exception 'At least one live active human Owner recovery principal must remain.' using errcode='23514';
  end if;
end
$function$;

""",
    "usable recovery exists",
)

sql = replace_once(
    sql,
    "perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:'||p_user_id::text,0));",
    "perform private.food_catalog_lock_account_purge(p_user_id);",
    "personal override shared purge lock",
)

sql = replace_section(
    sql,
    "create or replace function private.food_catalog_governance_assert_capability(p_principal_id uuid, p_capability text)",
    "create or replace function private.food_catalog_governance_semantic_checksum(p_semantics jsonb)",
    """create or replace function private.food_catalog_governance_assert_capability(p_principal_id uuid, p_capability text)
returns void language plpgsql security definer set search_path='' as $function$
declare v_type text; v_resolved_human uuid; v_resolved_service uuid;
begin
  select p.principal_type into v_type
  from public.food_catalog_governance_principals p
  where p.id=p_principal_id and p.active and p.revoked_at is null;
  if v_type is null then raise exception 'Food governance principal is inactive or unknown.' using errcode='42501'; end if;
  if v_type='human' then
    v_resolved_human:=private.food_catalog_governance_principal_for_user();
    if v_resolved_human<>p_principal_id then raise exception 'Human Food governance principal identity mismatch.' using errcode='42501'; end if;
  elsif v_type='service' then
    v_resolved_service:=private.food_catalog_governance_service_principal_for_request();
    if v_resolved_service<>p_principal_id then raise exception 'Service Food governance principal identity mismatch.' using errcode='42501'; end if;
  end if;
  if not exists(select 1 from public.food_catalog_governance_capability_assignments a where a.principal_id=p_principal_id and a.capability=p_capability and a.revoked_at is null) then
    raise exception 'Food governance capability denied: %',p_capability using errcode='42501';
  end if;
end
$function$;

""",
    "live capability assertion",
)

sql = replace_section(
    sql,
    "create or replace function public.food_catalog_manage_governance_principal(",
    "create or replace function public.food_catalog_revoke_governance_capability(",
    """create or replace function public.food_catalog_manage_governance_principal(
  p_operation_id uuid,p_target_principal_type text,p_target_subject_id text,p_role_class text,p_capabilities text[],p_reason text,p_service_identity text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare
  v_actor uuid; v_target uuid; v_existing_role text; v_replay jsonb; v_cap text;
  v_result jsonb; v_service_hash text; v_policy text; v_human_user uuid; v_subject text;
begin
  v_actor:=private.food_catalog_governance_principal_for_user();
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_target_principal_type not in ('human','service') or length(btrim(coalesce(p_target_subject_id,'')))=0 then
    raise exception 'Invalid governance principal identity.' using errcode='22023';
  end if;
  if (p_target_principal_type='service' and (p_role_class<>'service' or length(btrim(coalesce(p_service_identity,'')))=0))
     or (p_target_principal_type='human' and p_role_class not in ('owner','curator')) then
    raise exception 'Governance principal role/type or service identity is invalid.' using errcode='23514';
  end if;

  if p_target_principal_type='human' then
    begin
      v_human_user:=btrim(p_target_subject_id)::uuid;
    exception when invalid_text_representation then
      raise exception 'Human governance principal subject must be an Auth user UUID.' using errcode='22023';
    end;
    v_subject:=v_human_user::text;
    v_service_hash:=null;
  else
    v_human_user:=null;
    v_subject:=btrim(p_target_subject_id);
    v_service_hash:=encode(extensions.digest(convert_to(btrim(coalesce(p_service_identity,'')),'UTF8'),'sha256'),'hex');
  end if;

  -- Actor account lock is acquired by principal_for_user. Recovery comes next.
  -- Target account state is re-read only after recovery serialization so account
  -- deletion cannot race a human promotion through a stale pre-lock snapshot.
  perform private.food_catalog_governance_lock_recovery_set();
  if p_target_principal_type='human' then
    perform 1
    from auth.users auth_user
    join public.account_access_states access_state
      on access_state.user_id=auth_user.id
     and access_state.state='active'
     and access_state.disabled_at is null
    where auth_user.id=v_human_user;
    if not found then
      raise exception 'Human governance principal requires an existing active, non-disabled Auth account.' using errcode='42501';
    end if;
  end if;

  v_replay:=private.food_catalog_governance_begin_operation(
    p_operation_id,v_actor,'food.governance.manage_principals','food_catalog_manage_governance_principal',
    null,null,v_policy,p_reason,
    jsonb_build_object('principalType',p_target_principal_type,'subjectId',v_subject,'roleClass',p_role_class,
      'capabilities',to_jsonb(coalesce(p_capabilities,'{}'::text[])),'serviceIdentitySha256',v_service_hash)
  );
  if v_replay is not null then return v_replay; end if;

  select id,role_class into v_target,v_existing_role
  from public.food_catalog_governance_principals
  where principal_type=p_target_principal_type and subject_id=v_subject
  for update;
  if v_target is not null and v_existing_role='owner' and p_role_class<>'owner' then
    perform private.food_catalog_governance_assert_recovery_survives(v_target);
  end if;

  insert into public.food_catalog_governance_principals(principal_type,subject_id,service_identity_sha256,role_class,active,revoked_at)
  values(p_target_principal_type,v_subject,v_service_hash,p_role_class,true,null)
  on conflict(principal_type,subject_id) do update
    set service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null
  returning id into v_target;

  if p_role_class<>'owner' then
    update public.food_catalog_governance_capability_assignments
    set revoked_at=clock_timestamp(),revoked_by_principal_id=v_actor
    where principal_id=v_target and capability='food.governance.manage_principals' and revoked_at is null;
  end if;
  foreach v_cap in array coalesce(p_capabilities,'{}'::text[]) loop
    if v_cap='food.governance.manage_principals' and p_role_class<>'owner' then
      raise exception 'Only Owner principals may receive principal management capability.' using errcode='23514';
    end if;
    if p_target_principal_type='service' and v_cap not in ('food.correction.report','food.evidence.attach','food.ingestion.propose','food.outbox.deliver') then
      raise exception 'Service principal governance escalation is forbidden.' using errcode='23514';
    end if;
    if v_cap='food.outbox.deliver' and p_target_principal_type<>'service' then
      raise exception 'Governance outbox delivery capability is Service-principal-only.' using errcode='23514';
    end if;
    insert into public.food_catalog_governance_capability_assignments(principal_id,capability,granted_by_principal_id,reason)
    values(v_target,v_cap,v_actor,btrim(p_reason))
    on conflict(principal_id,capability) where revoked_at is null do nothing;
  end loop;
  perform private.food_catalog_governance_assert_recovery_exists();
  v_result:=jsonb_build_object('principalId',v_target,'principalType',p_target_principal_type,'roleClass',p_role_class);
  return private.food_catalog_governance_finish_operation(
    p_operation_id,null,v_target,'{}'::uuid[],v_result,'food.governance.principal.managed',jsonb_build_object('principalId',v_target)
  );
end
$function$;

""",
    "human management binding",
)

sql = replace_section(
    sql,
    "create or replace function public.food_catalog_report_correction(",
    "create or replace function public.food_catalog_attach_correction_evidence(",
    """create or replace function public.food_catalog_report_correction(
  p_food_id uuid,p_category text,p_claim_key text,p_description text,p_evidence jsonb default '{}'::jsonb,p_policy_version text default null
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_user uuid; v_policy text; v_issue text; v_case uuid; v_report uuid;
begin
  v_user:=auth.uid(); if v_user is null then raise exception 'Authenticated reporter is required.' using errcode='42501'; end if;
  -- Account-purge serialization precedes issue/case locking. A stale JWT from a
  -- disabled/deleting account fails before either global metadata or member payload exists.
  perform private.food_catalog_governance_require_active_member_account(v_user);
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then raise exception 'Unsupported governance policy version.' using errcode='22023'; end if;
  if p_category not in ('wrong_nutrition','missing_nutrition','wrong_serving','missing_serving','wrong_name','wrong_translation','wrong_barcode','wrong_taxonomy','wrong_market_relevance','duplicate_food','wrong_variant','outdated_product','source_conflict','other') then raise exception 'Invalid correction category.' using errcode='22023'; end if;
  if length(btrim(coalesce(p_claim_key,''))) not between 1 and 240 or length(btrim(coalesce(p_description,''))) not between 1 and 2000 then raise exception 'Correction report text is outside allowed bounds.' using errcode='22023'; end if;
  if jsonb_typeof(coalesce(p_evidence,'{}'::jsonb))<>'object' or pg_column_size(coalesce(p_evidence,'{}'::jsonb))>8192 then raise exception 'Correction report evidence must remain bounded.' using errcode='22023'; end if;
  perform private.food_catalog_governance_validate_bounded_evidence(coalesce(p_evidence,'{}'::jsonb),0);
  perform 1 from public.food_items where id=p_food_id and is_global=true; if not found then raise exception 'Global Food not found.' using errcode='23503'; end if;
  v_issue:=lower(p_food_id::text||'|'||p_category||'|'||regexp_replace(btrim(p_claim_key),'\\s+',' ','g'));
  perform pg_advisory_xact_lock(hashtextextended(v_issue,0));
  select id into v_case from public.food_catalog_correction_cases where issue_key=v_issue and state in ('reported','under_review','approved') order by created_at,id limit 1;
  if v_case is null then
    insert into public.food_catalog_correction_cases(food_id,category,claim_key,issue_key,policy_version)
    values(p_food_id,p_category,btrim(p_claim_key),v_issue,v_policy) returning id into v_case;
    insert into public.food_catalog_correction_events(case_id,from_state,to_state,state_revision,policy_version,reason)
    values(v_case,null,'reported',0,v_policy,'member-report');
  end if;
  insert into public.food_catalog_correction_reports(case_id) values(v_case) returning id into v_report;
  insert into public.food_catalog_correction_report_member_payloads(report_id,reporter_user_id,description,evidence)
  values(v_report,v_user,btrim(p_description),coalesce(p_evidence,'{}'::jsonb));
  return jsonb_build_object('caseId',v_case,'reportId',v_report,'canonicalMutation',false,'policyVersion',(select policy_version from public.food_catalog_correction_cases where id=v_case));
end
$function$;

""",
    "member report privacy boundary",
)

barcode_start = "create or replace function public.food_catalog_apply_barcode_correction("
barcode_end = "create or replace function public.food_catalog_lookup_effective_barcode("
i = sql.find(barcode_start)
j = sql.find(barcode_end, i)
if i < 0 or j < 0:
    raise RuntimeError("barcode apply section missing")
barcode = sql[i:j]
barcode = replace_once(
    barcode,
    """  if p_action not in ('assign','remove') then raise exception 'Invalid barcode correction action.' using errcode='22023'; end if;
  perform private.food_catalog_lock_gtin_authority(v_key);
  v_pre:=private.food_catalog_governance_prepare_apply(""",
    """  if p_action not in ('assign','remove') then raise exception 'Invalid barcode correction action.' using errcode='22023'; end if;
  -- Plan 4 already owns source-record locks before canonical Food. If caller supplies
  -- source evidence, join that order first; canonical barcode ownership then follows
  -- the global Food row -> normalized GTIN -> governance operation/CAS contract.
  if p_source_record_id is not null then
    perform 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id for key share;
    if not found then raise exception 'Barcode source record belongs to a different Food.' using errcode='23514'; end if;
  end if;
  perform private.food_catalog_lock_food_authority(p_food_id);
  perform private.food_catalog_lock_gtin_authority(v_key);
  v_pre:=private.food_catalog_governance_prepare_apply(""",
    "barcode Food before GTIN",
)
barcode = replace_once(
    barcode,
    "  if p_source_record_id is not null and not exists(select 1 from public.food_source_records where id=p_source_record_id and food_id=p_food_id) then raise exception 'Barcode source record belongs to a different Food.' using errcode='23514'; end if;\n",
    "",
    "remove late barcode source check",
)
sql = sql[:i] + barcode + sql[j:]

begin_delete = """-- Canonical privacy transition for Food governance identity. The lock order is
-- account-purge user -> recovery set. This function intentionally deactivates the
-- effective principal but preserves the historical principal/capability/audit rows.
create or replace function public.food_catalog_begin_account_deletion(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_state text; v_principal uuid; v_role text; v_was_active boolean:=false;
begin
  if auth.role()<>'service_role' then raise exception 'Account deletion governance transition requires service_role.' using errcode='42501'; end if;
  if p_user_id is null then raise exception 'Account deletion user ID is required.' using errcode='22023'; end if;
  perform private.food_catalog_lock_account_purge(p_user_id);
  perform private.food_catalog_governance_lock_recovery_set();

  perform 1 from auth.users where id=p_user_id;
  if not found then raise exception 'Account deletion requires an existing Auth user.' using errcode='23503'; end if;
  select state into v_state from public.account_access_states where user_id=p_user_id for update;
  if not found then raise exception 'Account deletion requires canonical account access state.' using errcode='23503'; end if;
  if v_state not in ('active','deletion_pending','deletion_processing') then
    raise exception 'Account state does not permit canonical deletion transition.' using errcode='55000';
  end if;

  select id,role_class,active into v_principal,v_role,v_was_active
  from public.food_catalog_governance_principals
  where principal_type='human' and human_user_id=p_user_id
  for update;
  if v_principal is not null and v_was_active then
    if v_role='owner' and exists(
      select 1 from public.food_catalog_governance_capability_assignments
      where principal_id=v_principal and capability='food.governance.manage_principals' and revoked_at is null
    ) then
      perform private.food_catalog_governance_assert_recovery_survives(v_principal);
    end if;
    update public.food_catalog_governance_principals
    set active=false,revoked_at=clock_timestamp()
    where id=v_principal;
  end if;

  if v_state='active' then
    update public.account_access_states
    set state='deletion_pending',reason_code='member_requested_deletion',disabled_at=coalesce(disabled_at,clock_timestamp()),updated_at=clock_timestamp()
    where user_id=p_user_id;
    v_state:='deletion_pending';
  end if;
  return jsonb_build_object('userId',p_user_id,'accountState',v_state,'governancePrincipalId',v_principal,'governancePrincipalDeactivated',coalesce(v_was_active,false));
end
$function$;

"""
purge_marker = "-- Extend the canonical Nutrition account-deletion lifecycle in place so the reviewed\n"
if begin_delete in sql:
    raise RuntimeError("begin deletion already inserted")
sql = sql.replace(purge_marker, begin_delete + purge_marker, 1)

purge_start = "create or replace function public.purge_account_application_data_atomic(p_user_id uuid)"
purge_end = "revoke all on function public.purge_account_application_data_atomic(uuid) from public, anon, authenticated, service_role;"
sql = replace_section(
    sql,
    purge_start,
    purge_end,
    """create or replace function public.purge_account_application_data_atomic(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_saved_meal_creation_operations integer := 0;
  v_food_personal_override_operations integer := 0;
  v_food_personal_overrides integer := 0;
  v_food_personal_override_revisions integer := 0;
  v_food_report_member_payloads integer := 0;
  v_governance_principal uuid;
  v_governance_role text;
begin
  if p_user_id is null then raise exception 'Account-data purge requires a user ID.' using errcode='22023'; end if;
  perform private.food_catalog_lock_account_purge(p_user_id);
  perform private.food_catalog_governance_lock_recovery_set();

  -- Defensive privacy integration for canonical/legacy callers: if the begin-
  -- deletion transition was not invoked, purge still cannot let a live final Owner
  -- disappear. Failure rolls this transaction back before any owner data is erased.
  select id,role_class into v_governance_principal,v_governance_role
  from public.food_catalog_governance_principals
  where principal_type='human' and human_user_id=p_user_id and active and revoked_at is null
  for update;
  if v_governance_principal is not null then
    if v_governance_role='owner' and exists(
      select 1 from public.food_catalog_governance_capability_assignments
      where principal_id=v_governance_principal and capability='food.governance.manage_principals' and revoked_at is null
    ) then
      perform private.food_catalog_governance_assert_recovery_survives(v_governance_principal);
    end if;
    update public.food_catalog_governance_principals
    set active=false,revoked_at=clock_timestamp()
    where id=v_governance_principal;
  end if;

  delete from private.nutrition_saved_meal_creation_operations where user_id=p_user_id;
  get diagnostics v_saved_meal_creation_operations=row_count;

  delete from public.food_catalog_correction_report_member_payloads where reporter_user_id=p_user_id;
  get diagnostics v_food_report_member_payloads=row_count;

  delete from public.food_personal_override_operations where user_id=p_user_id;
  get diagnostics v_food_personal_override_operations=row_count;
  delete from public.food_personal_overrides where user_id=p_user_id;
  get diagnostics v_food_personal_overrides=row_count;
  delete from public.food_personal_override_revisions where user_id=p_user_id;
  get diagnostics v_food_personal_override_revisions=row_count;

  -- Preserve the reviewed Nutrition V1 delegated purge graph directly.
  v_result:=private.nutrition_v1_final_review_core_purge_account_application_data_atomic(p_user_id);

  if exists(select 1 from private.nutrition_saved_meal_creation_operations where user_id=p_user_id) then
    raise exception 'Nutrition V1 account-data purge left Saved Meal creation replay rows behind.' using errcode='23514';
  end if;
  if exists(
    select 1 from public.food_personal_override_operations where user_id=p_user_id
    union all select 1 from public.food_personal_overrides where user_id=p_user_id
    union all select 1 from public.food_personal_override_revisions where user_id=p_user_id
  ) then
    raise exception 'Food Catalog Plan 6 personal override purge left owner rows behind.' using errcode='23514';
  end if;
  if exists(select 1 from public.food_catalog_correction_report_member_payloads where reporter_user_id=p_user_id) then
    raise exception 'Food Catalog Plan 6 correction report member payload purge left owner rows behind.' using errcode='23514';
  end if;

  return v_result || jsonb_build_object(
    'nutrition_saved_meal_creation_operations_deleted',v_saved_meal_creation_operations,
    'food_personal_override_operations_deleted',v_food_personal_override_operations,
    'food_personal_overrides_deleted',v_food_personal_overrides,
    'food_personal_override_revisions_deleted',v_food_personal_override_revisions,
    'food_correction_report_member_payloads_deleted',v_food_report_member_payloads
  );
end
$function$;

""",
    "privacy purge integration",
)

sql = replace_once(
    sql,
    "alter table public.food_catalog_correction_reports enable row level security;\n",
    "alter table public.food_catalog_correction_reports enable row level security;\nalter table public.food_catalog_correction_report_member_payloads enable row level security;\n",
    "payload RLS",
)
sql = replace_once(
    sql,
    "revoke all on table public.food_catalog_correction_reports from anon,authenticated,service_role;\n",
    "revoke all on table public.food_catalog_correction_reports from anon,authenticated,service_role;\nrevoke all on table public.food_catalog_correction_report_member_payloads from anon,authenticated,service_role;\n",
    "payload ACL",
)
sql = replace_once(
    sql,
    "or p.proname in ('food_catalog_change_lifecycle','food_catalog_lock_gtin_authority','food_catalog_serialize_gtin_write','food_catalog_lock_food_pair','reject_food_catalog_governance_immutable_mutation')",
    "or p.proname in ('food_catalog_change_lifecycle','food_catalog_lock_account_purge','food_catalog_lock_food_authority','food_catalog_lock_gtin_authority','food_catalog_serialize_gtin_write','food_catalog_lock_food_pair','reject_food_catalog_governance_immutable_mutation')",
    "private ACL helper inventory",
)

service_acl_marker = "revoke all on function public.food_catalog_service_propose_correction(uuid,uuid,uuid,text,text,text,jsonb,text,text) from public,anon,authenticated,service_role;"
service_acl = """revoke all on function public.food_catalog_begin_account_deletion(uuid) from public,anon,authenticated,service_role;
grant execute on function public.food_catalog_begin_account_deletion(uuid) to service_role;

""" + service_acl_marker
sql = replace_once(sql, service_acl_marker, service_acl, "account deletion RPC ACL")

MIGRATION.write_text(sql)

# The permanent concurrency harness must force its barrier after the safety trigger
# so current-head RED reproduces the old lock inversion and GREEN proves it is gone.
concurrency = CONCURRENCY.read_text()
concurrency = concurrency.replace("aaa_plan6_final_p1_barcode_sleep", "zzz_plan6_final_p1_barcode_sleep")
CONCURRENCY.write_text(concurrency)

route = ROUTE.read_text()
old_route = """  const chatgptAccessRevoked = await revokeDeletionConnections(context.user.id, context.accessToken);
  if (!chatgptAccessRevoked) {
    return NextResponse.json({ error: \"ChatGPT access could not be revoked; no deletion job was queued.\" }, { status: 503 });
  }

  const state = await admin.from(\"account_access_states\").upsert({
    user_id: context.user.id,
    state: \"deletion_pending\",
    reason_code: \"member_requested_deletion\"
  }, { onConflict: \"user_id\" });
  if (state.error) {
    console.error(\"Plaivra deletion access-state update failed:\", state.error.message);
    return NextResponse.json({ error: \"The deletion request could not be queued safely.\" }, { status: 500 });
  }
"""
new_route = """  const governanceDeletion = await admin.rpc(\"food_catalog_begin_account_deletion\", {
    p_user_id: context.user.id,
  });
  if (governanceDeletion.error) {
    console.error(\"Plaivra Food governance deletion transition failed:\", governanceDeletion.error.message);
    if (governanceDeletion.error.code === \"23514\") {
      return NextResponse.json({
        error: \"Account deletion is blocked while this account is the final usable Food governance recovery Owner. Provision another usable Owner first.\",
      }, { status: 409 });
    }
    return NextResponse.json({ error: \"The deletion request could not be queued safely.\" }, { status: 500 });
  }

  const chatgptAccessRevoked = await revokeDeletionConnections(context.user.id, context.accessToken);
  if (!chatgptAccessRevoked) {
    return NextResponse.json({ error: \"ChatGPT access could not be revoked; no deletion job was queued.\" }, { status: 503 });
  }
"""
route = replace_once(route, old_route, new_route, "privacy request governance deletion transition")
ROUTE.write_text(route)

worker = WORKER.read_text()
old_worker = """async function disableAccount(admin: SupabaseClient, userId: string) {
  const result = await admin.from(\"account_access_states\").upsert({
"""
new_worker = """async function disableAccount(admin: SupabaseClient, userId: string) {
  const governanceDeletion = await admin.rpc(\"food_catalog_begin_account_deletion\", { p_user_id: userId });
  if (governanceDeletion.error) throw new DeletionWorkerError(\"governance_recovery_owner_blocked\");
  const result = await admin.from(\"account_access_states\").upsert({
"""
worker = replace_once(worker, old_worker, new_worker, "deletion worker governance gate")
WORKER.write_text(worker)

doc = DOC.read_text()
append = """

## Final P1 lock, live-identity, and report-privacy hardening

The final adversarial re-review freezes one cross-authority lock-order contract. When a path participates in account deletion or member authorization it first acquires the canonical per-user `plaivra-account-data-purge:` transaction advisory lock. Mutations that can affect recovery then acquire the single governance recovery-set lock. Canonical barcode ownership writers acquire canonical Food row authority before the database-wide normalized-GTIN advisory lock; multiple Food IDs are ordered by UUID and multiple GTINs lexically. Governance operation and authority/CAS locks are acquired after those entity locks. Plan 4 remains byte-for-byte unchanged: its existing MATCH path already reaches canonical Food before `food_barcodes`, while the Plan 6 trigger now enforces Food-before-GTIN for every privileged barcode writer. When Plan 6 carries source-record evidence it joins Plan 4's existing source-record-before-Food ordering before entering the Food/GTIN domain, avoiding an FK lock inversion.

Human governance authorization is no longer arbitrary text authority. Human principals retain their stable governance principal ID and a durable UUID `human_user_id` derived from the Auth subject for historical audit identity; Service principals remain on the separate trusted service-identity hash binding. Runtime human resolution requires the Auth identity to still exist and `account_access_states` to be `active` with no `disabled_at`. Principal provisioning/promotion rejects malformed, nonexistent, disabled, pending, processing, legal-hold, or otherwise non-active human accounts. The recovery predicate uses the same live-account definition.

Canonical account deletion acquires the account-purge lock and then recovery-set lock before deactivating an effective human governance principal. Deleting one of multiple usable Owners deactivates that principal while preserving historical principal/capability/audit rows. Deleting the final usable recovery Owner fails closed until another usable Owner exists. The privacy route and deletion worker use this database transition before disabling/deleting Auth identity, and the purge function repeats the invariant defensively for legacy callers.

Member Correction Reports now separate durable non-personal report metadata (`report_id`, Case linkage, timestamp) from the owner-scoped member payload (reporter UUID, free-text description, submitted JSON evidence). Report intake takes the same per-user privacy lock and requires an active account before creating either metadata or payload. Canonical account purge physically removes the member payload and explicitly verifies its absence while preserving the global Correction Case, curator-attached governed evidence, decisions, audit/outbox records, and applied Food history. Member-submitted payload is intake only and never substitutes for governed Correction Evidence required by approval policy.
"""
if "## Final P1 lock, live-identity, and report-privacy hardening" not in doc:
    doc += append
DOC.write_text(doc)

# Plan 6 is pending/unapplied, so only its pending repository hash is refreshed.
ledger = json.loads(LEDGER.read_text())
new_hash = hashlib.sha256(MIGRATION.read_bytes()).hexdigest()
updated = 0
for entry in ledger.get("entries", []):
    if entry.get("localFile") == "20260908100000_food_catalog_governance_control_plane.sql":
        if entry.get("state") != "pending":
            raise RuntimeError(f"Plan 6 ledger entry is not pending: {entry.get('state')}")
        entry["repositorySha256"] = new_hash
        updated += 1
if updated != 1:
    raise RuntimeError(f"expected one pending Plan 6 ledger entry, found {updated}")
LEDGER.write_text(json.dumps(ledger, separators=(",", ":")))

print(f"Plan 6 final P1 patch applied; migration sha256={new_hash}")
