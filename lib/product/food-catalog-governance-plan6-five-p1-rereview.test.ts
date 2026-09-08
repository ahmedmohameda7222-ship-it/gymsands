import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql";
const HARDENING = "supabase/migrations/20260908110000_food_catalog_governance_five_p1_hardening.sql";
const sql = [MIGRATION, HARDENING]
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, "utf8"))
  .join("\n")
  .toLowerCase();

function body(name: string) {
  const marker = `create or replace function ${name.toLowerCase()}`;
  const start = sql.lastIndexOf(marker);
  if (start < 0) return "";
  const next = sql.indexOf("create or replace function ", start + marker.length);
  return sql.slice(start, next < 0 ? sql.length : next);
}

describe("Plan 6 five-P1 security/correctness re-review blockers", () => {
  it("P1-1 makes private Personal Override helpers caller-bound and non-executable by application roles", () => {
    const begin = body("private.food_catalog_personal_override_begin_operation");
    const finish = body("private.food_catalog_personal_override_finish_operation");
    for (const fn of [begin, finish]) {
      expect(fn).toContain("auth.uid()");
      expect(fn).toContain("p_user_id");
      expect(fn).toMatch(/auth\.uid\(\)\s+is\s+null|auth\.uid\(\)\s*<>\s*p_user_id/);
    }
    expect(sql).toContain("p.proname like 'food_catalog_personal_override_%'");
  });

  it("P1-2 establishes one normalized GTIN serialization domain across every food_barcodes writer", () => {
    const lock = body("private.food_catalog_lock_gtin_authority");
    const guard = body("private.food_catalog_serialize_gtin_write");
    const barcode = body("public.food_catalog_apply_barcode_correction");
    expect(lock).toContain("food-catalog-gtin:");
    expect(guard).toContain("food_catalog_lock_gtin_authority");
    expect(sql).toContain("food_barcodes_global_gtin_serialization");
    expect(barcode).toContain("food_catalog_lock_gtin_authority");
    expect(barcode.indexOf("food_catalog_lock_gtin_authority")).toBeLessThan(barcode.indexOf("food_catalog_governance_prepare_apply"));
    expect(barcode).not.toContain("on conflict(gtin) do update set source_record_id=coalesce(excluded.source_record_id,public.food_barcodes.source_record_id)");
    expect(barcode).toContain("effective gtin assignment changed ownership during correction");
  });

  it("P1-3 serializes and post-validates the global Owner recovery set", () => {
    const lock = body("private.food_catalog_governance_lock_recovery_set");
    const assertRecovery = body("private.food_catalog_governance_assert_recovery_exists");
    const manage = body("public.food_catalog_manage_governance_principal");
    const revoke = body("public.food_catalog_revoke_governance_capability");
    expect(lock).toContain("food-catalog-governance-recovery-set");
    expect(assertRecovery).toContain("food.governance.manage_principals");
    for (const fn of [manage, revoke]) {
      expect(fn).toContain("food_catalog_governance_lock_recovery_set");
      expect(fn).toContain("food_catalog_governance_assert_recovery_exists");
    }
  });

  it("P1-4 locks identity pairs deterministically and forbids chains, cycles, and non-active survivors", () => {
    const pairLock = body("private.food_catalog_lock_food_pair");
    const merge = body("public.food_catalog_resolve_duplicate");
    const lifecycle = body("private.food_catalog_change_lifecycle");
    expect(pairLock).toContain("order by id");
    expect(pairLock).toContain("for update");
    expect(merge).toContain("food_catalog_lock_food_pair");
    expect(merge).toMatch(/p_target_food_id[\s\S]*lifecycle_status='active'/);
    expect(merge).toContain("merged_into_food_id=p_source_food_id");
    expect(lifecycle).toContain("merged_into_food_id=p_food_id");
    expect(lifecycle).toContain("active, unredirected canonical root");
  });

  it("P1-5 joins Personal Override writes to the canonical account-purge lock before the operation ledger", () => {
    const gate = body("private.food_catalog_personal_override_require_writable_account");
    const setOverride = body("public.food_catalog_set_personal_override");
    const deleteOverride = body("public.food_catalog_delete_personal_override");
    expect(gate).toContain("plaivra-account-data-purge:");
    expect(gate).toContain("account_access_states");
    expect(gate).toContain("state='active'");
    expect(gate).toContain("disabled_at is null");
    expect(gate).toContain("for share");
    for (const fn of [setOverride, deleteOverride]) {
      const gateAt = fn.indexOf("food_catalog_personal_override_require_writable_account");
      const beginAt = fn.indexOf("food_catalog_personal_override_begin_operation");
      expect(gateAt).toBeGreaterThanOrEqual(0);
      expect(beginAt).toBeGreaterThan(gateAt);
    }
  });
});
