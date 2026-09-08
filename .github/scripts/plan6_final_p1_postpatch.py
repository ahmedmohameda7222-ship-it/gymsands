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
migration.write_text(text)

# Make the permanent GTIN adversary deterministic: Plan6 holds GTIN while sleeping,
# then wait until Plan4 MATCH is visibly blocked on that advisory lock.
script = concurrency.read_text()
script = script.replace("aaa_plan6_final_p1_barcode_sleep", "zzz_plan6_final_p1_barcode_sleep")
script = script.replace("perform pg_catalog.pg_sleep(3);", "perform pg_catalog.pg_sleep(15);", 1)
needle = "  const [r6, r4] = await Promise.all([p6.done, p4Session.done]);\n"
replacement = """  await waitFor(
    () => runSql(`select count(*) from pg_stat_activity where application_name='${APP_P4_MATCH}' and state='active' and wait_event_type='Lock' and wait_event='advisory'`) === "1",
    10000,
    "Plan4 MATCH to block on the in-flight GTIN advisory lock",
  );
  const [r6, r4] = await Promise.all([p6.done, p4Session.done]);
"""
if script.count(needle) != 1:
    raise SystemExit(f"GTIN concurrency synchronization marker count={script.count(needle)}")
script = script.replace(needle, replacement, 1)
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
