import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWED_HEAD = "e3a49312338c4e2e4947e01c14c55c02aa4181c6";
const APPLIED_CORE_MIGRATION = "supabase/migrations/20260901153000_food_catalog_intelligence_core.sql";
const CORRECTION_SUFFIX = "_food_catalog_plan1_semantic_corrections.sql";
const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { encoding: "utf8" }).trim();
const correctiveMigrations = execFileSync(
  "git",
  ["diff", "--name-only", `${base}...HEAD`, "--", "supabase/migrations"],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter((value) => value.endsWith(CORRECTION_SUFFIX));
const correctiveMigrationPath = correctiveMigrations.length === 1 ? correctiveMigrations[0] : null;
const correctiveSql = correctiveMigrationPath
  ? readFileSync(correctiveMigrationPath, "utf8").toLowerCase()
  : "";

describe("Food Catalog Plan 1 semantic correction migration", () => {
  it("keeps the already-applied Plan 1 core migration byte-stable", () => {
    const reviewedBytes = execFileSync(
      "git",
      ["show", `${REVIEWED_HEAD}:${APPLIED_CORE_MIGRATION}`],
      { encoding: "utf8" },
    );
    expect(readFileSync(APPLIED_CORE_MIGRATION, "utf8")).toBe(reviewedBytes);
  });

  it("adds exactly one new forward semantic correction migration", () => {
    expect(correctiveMigrations).toHaveLength(1);
    expect(correctiveMigrationPath).toMatch(
      /^supabase\/migrations\/\d{14}_food_catalog_plan1_semantic_corrections\.sql$/,
    );
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
