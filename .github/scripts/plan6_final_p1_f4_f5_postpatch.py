from pathlib import Path

# Preserve prior report-account authority after the F4/F5 replacement function is installed.
path = Path("supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql")
text = path.read_text()
old = """  perform private.food_catalog_lock_account_purge(v_user);
  perform 1 from auth.users where id=v_user; if not found then raise exception 'Reporter Auth identity is unavailable.' using errcode='42501'; end if;
  perform 1 from public.account_access_states where user_id=v_user and state='active' and disabled_at is null;
  if not found then raise exception 'Reporter account is not active.' using errcode='42501'; end if;
  v_policy:=private.food_catalog_governance_resolve_policy_version(p_policy_version);
"""
new = """  -- Preserve the canonical active-member helper: it takes the account-purge
  -- serialization lock and rejects stale/disabled/deleting sessions before intake.
  perform private.food_catalog_governance_require_active_member_account(v_user);
  v_policy:=private.food_catalog_governance_current_policy_version();
  if p_policy_version is not null and btrim(p_policy_version)<>v_policy then
    raise exception 'Unsupported governance policy version.' using errcode='22023';
  end if;
"""
if text.count(old) != 1:
    raise RuntimeError(f"expected one patched member-authority block, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))

# The final-P1 concurrency verifier runs after the complete registered DB verification
# suite, so a hard-coded account_deletion_jobs primary key can legitimately collide with
# fixture state left by an earlier verifier. Generate a fresh job identity per verifier
# process and remove it explicitly during cleanup; the race semantics remain unchanged.
concurrency_path = Path("scripts/test-food-catalog-governance-plan6-final-p1-concurrency.mjs")
concurrency = concurrency_path.read_text()
import_anchor = 'import { spawn, spawnSync } from "node:child_process";\n'
if concurrency.count(import_anchor) != 1:
    raise RuntimeError("expected node:child_process import anchor once")
concurrency = concurrency.replace(
    import_anchor,
    import_anchor + 'import { randomUUID } from "node:crypto";\n',
    1,
)
constant_anchor = 'const REPORT_FOOD = "6d000000-0000-4000-8000-000000000202";\n'
if concurrency.count(constant_anchor) != 1:
    raise RuntimeError("expected REPORT_FOOD constant anchor once")
concurrency = concurrency.replace(
    constant_anchor,
    constant_anchor + 'const OWNER_DELETE_JOB = randomUUID();\n',
    1,
)
fixed_job_id = "6d000000-0000-4000-8000-000000000550"
if concurrency.count(fixed_job_id) != 2:
    raise RuntimeError(f"expected hard-coded owner deletion job ID twice, found {concurrency.count(fixed_job_id)}")
concurrency = concurrency.replace(fixed_job_id, "${OWNER_DELETE_JOB}")
cleanup_anchor = "    delete from public.account_deletion_jobs where id='6d000000-0000-4000-8000-000000000601';\n"
if concurrency.count(cleanup_anchor) != 1:
    raise RuntimeError("expected report-purge deletion-job cleanup anchor once")
concurrency = concurrency.replace(
    cleanup_anchor,
    "    delete from public.account_deletion_jobs where id='${OWNER_DELETE_JOB}';\n" + cleanup_anchor,
    1,
)
concurrency_path.write_text(concurrency)

print("Preserved prior active-member/exact-policy authority and collision-safe final-P1 deletion fixture identity.")
