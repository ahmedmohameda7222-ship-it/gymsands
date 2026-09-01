import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWED_HEAD = "e3a49312338c4e2e4947e01c14c55c02aa4181c6";
const REVIEWED_CORRECTION_HEAD = "51b380019db205dff61505a0fdee54a409ce9657";
const APPLIED_CORE_MIGRATION = "supabase/migrations/20260901153000_food_catalog_intelligence_core.sql";
const CORRECTIVE_MIGRATION = "supabase/migrations/20260901174500_food_catalog_plan1_semantic_corrections.sql";
const CORRECTION_SUFFIX = "_food_catalog_plan1_semantic_corrections.sql";
const correctiveMigrations = readdirSync("supabase/migrations")
  .filter((value) => value.endsWith(CORRECTION_SUFFIX));
const correctiveSql = readFileSync(CORRECTIVE_MIGRATION, "utf8").toLowerCase();

describe("Food Catalog Plan 1 semantic correction migration", () => {
  it("keeps the already-applied Plan 1 core migration byte-stable", () => {
    const reviewedBytes = execFileSync(
      "git",
      ["show", `${REVIEWED_HEAD}:${APPLIED_CORE_MIGRATION}`],
      { encoding: "utf8" },
    );
    expect(readFileSync(APPLIED_CORE_MIGRATION, "utf8")).toBe(reviewedBytes);
  });

  it("keeps exactly the approved forward semantic correction migration", () => {
    expect(correctiveMigrations).toEqual([
      "20260901174500_food_catalog_plan1_semantic_corrections.sql",
    ]);
    const reviewedBytes = execFileSync(
      "git",
      ["show", `${REVIEWED_CORRECTION_HEAD}:${CORRECTIVE_MIGRATION}`],
      { encoding: "utf8" },
    );
    expect(readFileSync(CORRECTIVE_MIGRATION, "utf8")).toBe(reviewedBytes);
  });

  it("requires source-backed evidence for non-direct serving conversions", () => {
    expect(correctiveSql).toContain("food_serving_options_source_backed_weight_check");
    expect(correctiveSql).toMatch(
      /alter\s+table\s+public\.food_serving_options[\s\S]*check\s*\([\s\S]*unit_code\s+in\s*\(\s*'g'\s*,\s*'ml'\s*\)[\s\S]*source_record_id\s+is\s+not\s+null[\s\S]*\)/,
    );
  });

  it("requires provenance for source-origin or source-name facts", () => {
    expect(correctiveSql).toContain("food_names_source_provenance_check");
    expect(correctiveSql).toMatch(
      /alter\s+table\s+public\.food_names[\s\S]*check\s*\([\s\S]*origin\s*<>\s*'source'[\s\S]*name_role\s*<>\s*'source_name'[\s\S]*source_record_id\s+is\s+not\s+null[\s\S]*\)/,
    );
  });

  it("does not populate Food or promote release compatibility", () => {
    expect(correctiveSql).not.toMatch(/insert\s+into\s+public\.food_items\b/);
    expect(correctiveSql).not.toMatch(/update\s+public\.release_schema_compatibility\b/);
  });
});
