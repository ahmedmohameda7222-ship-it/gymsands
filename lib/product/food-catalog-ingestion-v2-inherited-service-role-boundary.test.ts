import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260904100000_food_catalog_ingestion_v2_authority.sql",
  "utf8",
).toLowerCase();
const verification = readFileSync(
  "supabase/verification/food-catalog-ingestion-v2-inherited-service-role-boundary.sql",
  "utf8",
).toLowerCase();

describe("Food Catalog Plan 4 inherited service-role boundary", () => {
  it("guards legacy Batch 0 tables whenever they carry Plan 4 semantic authority", () => {
    expect(migration).toContain("food_catalog_ingestion_plan4_service_role_direct_guard_v2");
    expect(migration).toMatch(
      /create\s+trigger\s+food_ingestion_batches_plan4_service_role_direct_guard_v2[\s\S]*?on\s+public\.food_ingestion_batches/i,
    );
    expect(migration).toMatch(
      /create\s+trigger\s+food_ingestion_runs_plan4_service_role_direct_guard_v2[\s\S]*?on\s+public\.food_ingestion_runs/i,
    );
    expect(migration).toMatch(
      /create\s+trigger\s+food_ingestion_batch_records_plan4_service_role_direct_guard_v2[\s\S]*?on\s+public\.food_ingestion_batch_records/i,
    );
  });

  it("executes real service_role direct-write rejection proof", () => {
    expect(verification).toContain("set local role service_role");
    expect(verification).toContain("cannot directly mutate prepared plan 4 semantic batch authority");
    expect(verification).toContain("cannot directly create a plan 4 semantic run");
    expect(verification.trimEnd()).toMatch(/rollback;$/);
  });
});
