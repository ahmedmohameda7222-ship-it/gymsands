import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const base = execFileSync("git", ["merge-base", "origin/main", "HEAD"], { encoding: "utf8" }).trim();
const suffix = "_food_catalog_intelligence_core.sql";
const files = execFileSync(
  "git",
  ["diff", "--name-only", `${base}...HEAD`, "--", "supabase/migrations"],
  { encoding: "utf8" },
)
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter((value) => value.endsWith(suffix));
const migrationPath = files.length === 1 ? files[0] : null;
const sql = migrationPath ? readFileSync(migrationPath, "utf8").toLowerCase() : "";

const targetTables = [
  "food_nutrition_revisions",
  "food_serving_options",
  "food_names",
  "food_taxonomy_namespaces",
  "food_taxonomy_nodes",
  "food_taxonomy_assignments",
  "market_scopes",
  "market_scope_memberships",
  "food_market_assignments",
  "food_verification_assertions",
  "food_merge_events",
] as const;

describe("Food Catalog Intelligence core migration", () => {
  it("creates exactly one forward core migration", () => {
    expect(files).toHaveLength(1);
    expect(migrationPath).toMatch(/^supabase\/migrations\/\d{14}_food_catalog_intelligence_core\.sql$/);
  });

  it("creates the approved additive V2 core relations", () => {
    for (const table of targetTables) {
      expect(sql).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}\\b`));
    }
    expect(sql).not.toMatch(/drop\s+table\s+public\.food_items/);
    expect(sql).not.toMatch(/drop\s+column\s+(food_name|serving_size|calories|protein_g|carbs_g|fat_g|is_verified)/);
    expect(sql).not.toMatch(/insert\s+into\s+public\.food_items/);
    expect(sql).not.toMatch(/update\s+public\.release_schema_compatibility/);
  });

  it("enforces immutable fact and same-Food provenance contracts", () => {
    for (const trigger of [
      "food_nutrition_revisions_immutable",
      "food_serving_options_immutable",
      "food_names_immutable",
      "food_taxonomy_assignments_immutable",
      "food_market_assignments_immutable",
      "food_verification_assertions_immutable",
      "food_merge_events_immutable",
    ]) {
      expect(sql).toContain(trigger);
    }
    expect(sql).toContain("foreign key (source_record_id, food_id)");
    expect(sql).toContain("references public.food_source_records(id, food_id)");
    expect(sql).not.toMatch(/language_tag\s+in\s*\(\s*'en'\s*,\s*'de'\s*,\s*'ar'/);
  });

  it("uses controlled taxonomy and market registries", () => {
    expect(sql).toMatch(/namespace_code\s+text\s+primary\s+key/);
    expect(sql).toMatch(/scope_code\s+text\s+primary\s+key/);
    expect(sql).not.toMatch(/add\s+column\s+is_(german|egyptian|saudi|gcc)/);
  });

  it("uses assertion-based verification rather than a new mutable boolean", () => {
    expect(sql).toMatch(/assertion_scope\s+text[\s\S]*identity[\s\S]*nutrition[\s\S]*serving[\s\S]*barcode/);
    expect(sql).toMatch(/assertion_state\s+text[\s\S]*verified[\s\S]*revoked/);
    expect(sql).not.toMatch(/add\s+column\s+is_verified\s+boolean/);
  });

  it("locks every new core relation behind RLS and internal authority", () => {
    for (const table of targetTables) {
      expect(sql).toContain(`alter table public.${table} enable row level security;`);
      expect(sql).toContain(`revoke all on public.${table} from anon, authenticated;`);
      expect(sql).toContain(`grant all privileges on public.${table} to service_role;`);
    }
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all(?:\s+privileges)?)\s+on\s+public\.[a-z0-9_]+\s+to\s+authenticated/);
  });
});
