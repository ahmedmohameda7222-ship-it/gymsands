import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql";
const verifier = "supabase/verification/food-catalog-governance-control-plane.sql";
const legacyCuration = "services/nutrition-v1/server/food-curation.ts";
const governanceExecutor = "services/food-catalog/server/governance-command-executor.ts";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Food Catalog Plan 6 governance authority", () => {
  it("retires the legacy generic global Food row editor", () => {
    const source = read(legacyCuration);
    expect(source).not.toMatch(/\.from\(["']food_items["']\)[\s\S]{0,180}\.update\(/);
    expect(source).not.toContain('role !== "admin"');
  });

  it("defines the explicit governance control-plane migration", () => {
    expect(existsSync(migration)).toBe(true);
    const sql = read(migration);
    for (const authority of [
      "food_catalog_governance_principals",
      "food_catalog_governance_capability_assignments",
      "food_catalog_correction_cases",
      "food_catalog_correction_evidence",
      "food_catalog_governance_operations",
      "food_catalog_governance_audit_events",
      "food_catalog_governance_outbox",
      "food_personal_overrides",
    ]) expect(sql).toContain(authority);
    expect(sql).toContain("food_catalog_apply_nutrition_correction");
    expect(sql).toContain("food_catalog_apply_serving_correction");
    expect(sql).toContain("food_catalog_resolve_duplicate");
    expect(sql).toContain("food_catalog_withdraw_food");
    expect(sql).toContain("food_catalog_restore_food");
  });

  it("locks canonical global Food DML behind named security-definer commands", () => {
    const sql = read(migration).toLowerCase();
    expect(sql).toMatch(/revoke\s+(?:all|insert[^;]*update[^;]*delete|insert[^;]*delete[^;]*update)[^;]*on\s+table\s+public\.food_items[^;]*service_role/);
    expect(sql).toContain("security definer");
    expect(sql).toContain("food_catalog_governance_assert_capability");
    expect(sql).toContain("food_catalog_governance_audit_events");
  });

  it("uses existing privacy-safe operational logging for failed commands, CAS conflicts, and authorization denials", () => {
    expect(existsSync(governanceExecutor)).toBe(true);
    const source = read(governanceExecutor);
    expect(source).toContain("logOperationalEvent");
    expect(source).toContain('"cas_conflict"');
    expect(source).toContain('"authorization_denied"');
    expect(source).toContain('"failed"');
    expect(source).not.toMatch(/accessToken|bearer|password|secret|requestBody|commandArgs/i);
  });

  it("gives future provider adapters a constrained Service-principal proposal path without apply/approve authority", () => {
    const sql = read(migration).toLowerCase();
    const proof = read(verifier).toLowerCase();
    expect(sql).toContain("food_catalog_service_proposals");
    expect(sql).toContain("food_catalog_service_propose_correction");
    expect(sql).toContain("'food.ingestion.propose'");
    expect(sql).toContain("grant execute on function public.food_catalog_service_propose_correction");
    expect(proof).toContain("service principal proposal");
    expect(proof).toContain("service principal cannot approve");
  });

  it("preserves Plan 3 current-generation and Plan 5 derived-search authority", () => {
    const sql = read(migration).toLowerCase();
    expect(sql).not.toMatch(/update\s+public\.food_catalog_current_generation/);
    expect(sql).not.toMatch(/insert\s+into\s+public\.food_catalog_generations/);
    expect(sql).not.toMatch(/(?:insert\s+into|update|delete\s+from)\s+public\.food_catalog_search_documents/);
  });
});
