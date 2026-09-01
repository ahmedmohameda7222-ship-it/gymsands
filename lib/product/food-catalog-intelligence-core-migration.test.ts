import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWED_HEAD = "e3a49312338c4e2e4947e01c14c55c02aa4181c6";
const MIGRATION_FILE = "20260901153000_food_catalog_intelligence_core.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_FILE}`;
const suffix = "_food_catalog_intelligence_core.sql";
const files = readdirSync("supabase/migrations").filter((value) => value.endsWith(suffix));
const sql = readFileSync(MIGRATION_PATH, "utf8").toLowerCase();

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
  it("keeps exactly the approved forward core migration byte-stable", () => {
    expect(files).toEqual([MIGRATION_FILE]);
    const reviewedBytes = execFileSync(
      "git",
      ["show", `${REVIEWED_HEAD}:${MIGRATION_PATH}`],
      { encoding: "utf8" },
    );
    expect(readFileSync(MIGRATION_PATH, "utf8")).toBe(reviewedBytes);
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
