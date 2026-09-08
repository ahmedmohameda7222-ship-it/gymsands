from pathlib import Path
import hashlib
import json

root = Path(__file__).resolve().parents[2]
migration = root / "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql"
concurrency = root / "scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs"
ledger_path = root / "supabase/migration-ledger.json"
text = migration.read_text()

old = """  human_user_id uuid generated always as (
    case when principal_type='human' then btrim(subject_id)::uuid else null end
  ) stored,
"""
new = """  human_user_id uuid,
"""
if text.count(old) != 1:
    raise SystemExit(f"expected generated human_user_id block once, found {text.count(old)}")
text = text.replace(old, new, 1)

marker = """create unique index food_catalog_governance_service_identity_uq
  on public.food_catalog_governance_principals(service_identity_sha256) where principal_type='service';

"""
binding = marker + """create or replace function private.food_catalog_governance_bind_human_identity()
returns trigger language plpgsql set search_path='' as $function$
declare v_subject uuid;
begin
  if new.principal_type='human' then
    begin
      v_subject:=btrim(new.subject_id)::uuid;
    exception when invalid_text_representation then
      raise exception 'Human governance principal subject must be a UUID.' using errcode='22023';
    end;
    if new.human_user_id is null then
      new.human_user_id:=v_subject;
    elsif new.human_user_id<>v_subject then
      raise exception 'Human governance UUID identity must match subject authority.' using errcode='23514';
    end if;
  elsif new.human_user_id is not null then
    raise exception 'Service governance principal cannot carry a human Auth identity.' using errcode='23514';
  end if;
  return new;
end
$function$;
create trigger food_catalog_governance_principals_bind_human_identity
before insert or update of principal_type,subject_id,human_user_id
on public.food_catalog_governance_principals
for each row execute function private.food_catalog_governance_bind_human_identity();

"""
if text.count(marker) != 1:
    raise SystemExit(f"service identity index marker count={text.count(marker)}")
text = text.replace(marker, binding, 1)

# Principal management writes the strong human UUID binding explicitly; the trigger
# remains a defensive consistency boundary for database-owner/bootstrap inserts.
manage_start = text.index("create or replace function public.food_catalog_manage_governance_principal(")
manage_end = text.index("create or replace function public.food_catalog_revoke_governance_capability(", manage_start)
manage = text[manage_start:manage_end]
manage_old_insert = "insert into public.food_catalog_governance_principals(principal_type,subject_id,service_identity_sha256,role_class,active,revoked_at)"
manage_new_insert = "insert into public.food_catalog_governance_principals(principal_type,subject_id,human_user_id,service_identity_sha256,role_class,active,revoked_at)"
manage_old_values = "values(p_target_principal_type,v_subject,v_service_hash,p_role_class,true,null)"
manage_new_values = "values(p_target_principal_type,v_subject,v_human_user,v_service_hash,p_role_class,true,null)"
manage_old_update = "set service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null"
manage_new_update = "set human_user_id=excluded.human_user_id,service_identity_sha256=excluded.service_identity_sha256,role_class=excluded.role_class,active=true,revoked_at=null"
for old_value, new_value, label in [
    (manage_old_insert, manage_new_insert, "management principal insert binding"),
    (manage_old_values, manage_new_values, "management principal values binding"),
    (manage_old_update, manage_new_update, "management principal upsert binding"),
]:
    if manage.count(old_value) != 1:
        raise SystemExit(f"expected one {label}, found {manage.count(old_value)}")
    manage = manage.replace(old_value, new_value, 1)
text = text[:manage_start] + manage + text[manage_end:]

# Preserve the earlier P1-5 contract literally as well as semantically. Personal
# Override writes still join the same canonical per-user purge-lock domain before
# the operation ledger; keeping the key inline also prevents this security boundary
# from depending on direct EXECUTE access to the new shared helper.
po_start = text.index("create or replace function private.food_catalog_personal_override_require_writable_account(p_user_id uuid)")
po_end = text.index("create or replace function private.food_catalog_gtin_is_valid", po_start)
po = text[po_start:po_end]
po_old = "perform private.food_catalog_lock_account_purge(p_user_id);"
po_new = "perform pg_advisory_xact_lock(hashtextextended('plaivra-account-data-purge:'||p_user_id::text,0));"
if po.count(po_old) != 1:
    raise SystemExit(f"expected one Personal Override shared purge-lock call, found {po.count(po_old)}")
po = po.replace(po_old, po_new, 1)
text = text[:po_start] + po + text[po_end:]
migration.write_text(text)

# The permanent GREEN adversary forces overlap after the canonical Food->GTIN
# safety trigger has acquired the corrected lock order. It deliberately does not
# require Plan4 to wait on a GTIN advisory lock: after the fix, Plan4 may correctly
# wait on the Food row instead. The harness itself rejects any PostgreSQL deadlock,
# requires both legitimate transactions to complete, and verifies final authority.
# The separate RED workflow patches this same harness to assert the old advisory
# wait explicitly when reproducing the pre-fix GTIN->Food inversion.
script = concurrency.read_text()
script = script.replace("aaa_plan6_final_p1_barcode_sleep", "zzz_plan6_final_p1_barcode_sleep")
script = script.replace("perform pg_catalog.pg_sleep(3);", "perform pg_catalog.pg_sleep(15);", 1)
concurrency.write_text(script)

# postpatch changes the pending Plan 6 migration bytes, so refresh its pending
# repository hash only after all in-place migration edits are complete.
ledger = json.loads(ledger_path.read_text())
new_hash = hashlib.sha256(migration.read_bytes()).hexdigest()
updated = 0
for entry in ledger.get("entries", []):
    if entry.get("localFile") == "20260908100000_food_catalog_governance_control_plane.sql":
        if entry.get("state") != "pending":
            raise SystemExit(f"Plan 6 ledger entry is not pending: {entry.get('state')}")
        entry["repositorySha256"] = new_hash
        updated += 1
if updated != 1:
    raise SystemExit(f"expected one pending Plan 6 ledger entry, found {updated}")
ledger_path.write_text(json.dumps(ledger, separators=(",", ":")))
print(f"Plan 6 final P1 postpatch complete; migration sha256={new_hash}")
