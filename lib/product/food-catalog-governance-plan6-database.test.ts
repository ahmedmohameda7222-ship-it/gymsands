import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql";
const VERIFIER = "supabase/verification/food-catalog-governance-control-plane.sql";
const LEDGER = "supabase/migration-ledger.json";
const EXACTNESS_CORRECTION = "20260909083000_food_catalog_governance_gtin_lock_exactness.sql";

function read(path: string) { return readFileSync(path, "utf8"); }

describe("Food Catalog Plan 6 database authority", () => {
  it("defines one coherent governance migration and registered rollback-only verifier", () => {
    expect(existsSync(MIGRATION)).toBe(true);
    expect(existsSync(VERIFIER)).toBe(true);
    const verifier = read(VERIFIER).toLowerCase();
    expect(verifier).toContain("begin;");
    expect(verifier).toContain("rollback;");
    expect(read("scripts/run-database-verification.mjs")).toContain("food-catalog-governance-control-plane.sql");
  });

  it("creates explicit principals, corrections, audit, outbox, lifecycle and personal override authority", () => {
    const sql = read(MIGRATION).toLowerCase();
    for (const relation of [
      "food_catalog_governance_principals",
      "food_catalog_governance_capability_assignments",
      "food_catalog_correction_cases",
      "food_catalog_correction_evidence",
      "food_catalog_governance_operations",
      "food_catalog_governance_audit_events",
      "food_catalog_governance_outbox",
      "food_catalog_governance_lifecycle_events",
      "food_personal_override_revisions",
      "food_personal_overrides",
    ]) expect(sql).toContain(relation);
    for (const command of [
      "food_catalog_manage_governance_principal",
      "food_catalog_revoke_governance_capability",
      "food_catalog_apply_nutrition_correction",
      "food_catalog_apply_serving_correction",
      "food_catalog_apply_name_correction",
      "food_catalog_apply_barcode_correction",
      "food_catalog_apply_taxonomy_correction",
      "food_catalog_apply_market_correction",
      "food_catalog_resolve_duplicate",
      "food_catalog_withdraw_food",
      "food_catalog_restore_food",
    ]) expect(sql).toContain(command);
    expect(sql).toContain("food.governance.manage_principals");
  });

  it("removes direct global canonical DML authority while preserving named command boundaries", () => {
    const sql = read(MIGRATION).toLowerCase();
    expect(sql).toContain("drop policy if exists food_items_admin_all");
    expect(sql).toMatch(/revoke[\s\S]*insert[\s\S]*update[\s\S]*delete[\s\S]*on table public\.food_items[\s\S]*authenticated/);
    expect(sql).toMatch(/revoke[\s\S]*insert[\s\S]*update[\s\S]*delete[\s\S]*on table public\.food_items[\s\S]*service_role/);
    expect(sql).toContain("security definer");
    expect(sql).toContain("food_catalog_governance_assert_capability");
  });

  it("revokes application-role execution from every Plan 6 private SECURITY DEFINER helper", () => {
    const sql = read(MIGRATION).toLowerCase();
    expect(sql).toContain("n.nspname='private'");
    expect(sql).toContain("p.proname like 'food_catalog_governance_%'");
    expect(sql).toContain("food_catalog_change_lifecycle");
    expect(sql).toContain("reject_food_catalog_governance_immutable_mutation");
    expect(sql).toContain("revoke all on function %s from public, anon, authenticated, service_role");
  });

  it("extends the canonical account purge to delete Plan 6 personal overrides and proves it in rollback verification", () => {
    const sql = read(MIGRATION).toLowerCase();
    const verifier = read(VERIFIER).toLowerCase();
    expect(sql).toContain("create or replace function public.purge_account_application_data_atomic");
    expect(sql).toContain("private.nutrition_saved_meal_creation_operations");
    expect(sql).toContain("private.nutrition_v1_final_review_core_purge_account_application_data_atomic");
    expect(sql).toMatch(/delete\s+from\s+public\.food_personal_overrides\s+where\s+user_id\s*=\s*p_user_id/);
    expect(sql).toMatch(/delete\s+from\s+public\.food_personal_override_revisions\s+where\s+user_id\s*=\s*p_user_id/);
    expect(sql).toContain("food_personal_overrides_deleted");
    expect(sql).toContain("food_personal_override_revisions_deleted");
    expect(verifier).toContain("plan 6 personal override purge");
    expect(verifier).toContain("purge_account_application_data_atomic");
    expect(verifier).toContain("food_personal_overrides");
    expect(verifier).toContain("food_personal_override_revisions");
  });

  it("does not bypass Plan 3 generation authority or Plan 5 derived-search authority", () => {
    const sql = read(MIGRATION).toLowerCase();
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.food_catalog_current_generation/);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.food_catalog_generations/);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.food_catalog_generation_redirects/);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.food_catalog_search_documents/);
  });

  it("records both Plan 6 migrations as applied Production aliases after exactness reconciliation", () => {
    const ledger = JSON.parse(read(LEDGER)) as { pendingCount: number; unresolvedCount: number; historyRepair: { state: string }; entries: Array<Record<string, unknown>> };
    const entry = ledger.entries.find((item) => item.localFile === "20260908100000_food_catalog_governance_control_plane.sql");
    const correction = ledger.entries.find((item) => item.localFile === EXACTNESS_CORRECTION);
    expect(entry).toEqual(expect.objectContaining({
      state: "applied_version_alias",
      productionVersion: "20260909081402",
      productionName: "food_catalog_governance_control_plane",
    }));
    expect(correction).toEqual(expect.objectContaining({
      state: "applied_version_alias",
      productionVersion: "20260910071241",
      productionName: "food_catalog_governance_gtin_lock_exactness",
    }));
    expect(ledger.pendingCount).toBe(0);
    expect(ledger.unresolvedCount).toBe(0);
    expect(ledger.historyRepair.state).toBe("reconciled");
  });

  it("removes the Plan 2 temporary food-curation direct-access exception", () => {
    const boundary = read("lib/product/nutrition-v1-food-catalog-boundary.test.ts");
    expect(boundary).not.toContain('"services/nutrition-v1/server/food-curation.ts"');
  });
});
