from pathlib import Path

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
print("Preserved prior active-member and exact-policy authority in F4/F5 report patch.")
