import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260908100000_food_catalog_governance_control_plane.sql";
const sql = readFileSync(MIGRATION, "utf8").toLowerCase();

function body(name: string) {
  const marker = `create or replace function ${name.toLowerCase()}`;
  const start = sql.lastIndexOf(marker);
  if (start < 0) return "";
  const next = sql.indexOf("create or replace function ", start + marker.length);
  return sql.slice(start, next < 0 ? sql.length : next);
}

describe("Plan 6 deeper authority re-review blockers", () => {
  it("P1-R1 gives each Name fact an independent stable lineage authority", () => {
    expect(sql).toContain("food_catalog_name_fact_lineages");
    expect(sql).toContain("food_catalog_name_fact_revisions");
    const name = body("public.food_catalog_apply_name_correction");
    expect(name).toMatch(/p_name_lineage_id\s+uuid/);
    expect(name).toContain("p_name_lineage_id::text");
    expect(name).toContain("predecessor_name_fact_id");
    expect(name).not.toContain("lower(btrim(p_language_tag)||':'||btrim(p_name_role))");
  });

  it("P1-R2 validates an initial predecessor against the exact semantic authority key", () => {
    const matcher = body("private.food_catalog_governance_authority_fact_matches_key");
    expect(matcher).toContain("name_fact");
    expect(matcher).toContain("barcode_correction");
    expect(matcher).toContain("taxonomy_assignment");
    expect(matcher).toContain("market_assignment");
    expect(matcher).toContain("food_catalog_name_fact_revisions");
    expect(matcher).toContain("gtin");
    expect(matcher).toContain("node_code");
    expect(matcher).toContain("scope_code");
    const lock = body("private.food_catalog_governance_lock_authority");
    expect(lock).toContain("food_catalog_governance_authority_fact_matches_key");
  });

  it("P1-R3 binds outbox claim and finish to a least-privileged trusted Service principal", () => {
    expect(sql).toContain("'food.outbox.deliver'");
    expect(sql).toContain("claim_principal_id uuid");
    const claim = body("public.food_catalog_claim_governance_outbox");
    const finish = body("public.food_catalog_finish_governance_outbox");
    for (const fn of [claim, finish]) {
      expect(fn).toContain("food_catalog_governance_service_principal_for_request");
      expect(fn).toContain("food.outbox.deliver");
      expect(fn).toContain("claim_principal_id");
    }
    expect(claim).not.toContain("p_claim_owner text");
  });
});
