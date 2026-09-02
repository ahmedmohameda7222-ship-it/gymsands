import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = "supabase/migrations/20260902150000_food_catalog_generation_authority.sql";
const SUFFIX = "_food_catalog_generation_authority.sql";
const migrationFiles = readdirSync("supabase/migrations").filter((name) => name.endsWith(SUFFIX));
const sql = readFileSync(MIGRATION, "utf8").toLowerCase();
const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as {
  productionMigrationCount: number;
  pendingCount: number;
  unresolvedCount: number;
  historyRepair: { state: string; pendingCount: number; unresolvedCount: number };
  entries: Array<{
    localFile: string;
    state: string;
    note?: string;
    productionVersion?: string;
    productionName?: string;
  }>;
};

const tables = [
  "food_catalog_control_operations",
  "food_catalog_activation_sets",
  "food_catalog_activation_set_members",
  "food_catalog_activation_events",
  "food_catalog_generations",
  "food_catalog_generation_foods",
  "food_catalog_generation_servings",
  "food_catalog_generation_names",
  "food_catalog_generation_taxonomy",
  "food_catalog_generation_markets",
  "food_catalog_generation_verification",
  "food_catalog_generation_redirects",
  "food_catalog_generation_validation_reports",
  "food_catalog_generation_validation_findings",
  "food_catalog_generation_events",
  "food_catalog_current_generation",
] as const;

const immutableTables = tables.filter((table) => table !== "food_catalog_current_generation");

describe("Food Catalog Plan 3 generation-authority migration", () => {
  it("keeps exactly one forward Plan 3 generation-authority migration", () => {
    expect(migrationFiles).toEqual(["20260902150000_food_catalog_generation_authority.sql"]);
    expect(sql.trimStart().startsWith("begin;")).toBe(true);
    expect(sql.trimEnd().endsWith("commit;")).toBe(true);
  });

  it("creates every normalized Plan 3 authority relation with RLS and member-denied CRUD", () => {
    for (const table of tables) {
      expect(sql).toMatch(new RegExp(`create\\s+table\\s+public\\.${table}\\b`, "i"));
      expect(sql).toMatch(new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`, "i"));
      expect(sql).toMatch(new RegExp(`revoke\\s+all\\s+on\\s+public\\.${table}\\s+from\\s+anon\\s*,\\s*authenticated`, "i"));
      expect(sql).not.toMatch(new RegExp(`grant\\s+(insert|update|delete|all)[^;]*public\\.${table}[^;]*authenticated`, "i"));
    }
  });

  it("keeps all authority rows immutable except the singleton current pointer", () => {
    for (const table of immutableTables) {
      expect(sql).toMatch(new RegExp(`create\\s+trigger\\s+${table}_immutable[\\s\\S]*?on\\s+public\\.${table}`, "i"));
    }
    expect(sql).not.toMatch(/create\s+trigger\s+food_catalog_current_generation_immutable/i);
  });

  it("normalizes same-Food selections and strengthens verification history", () => {
    expect(sql).toMatch(/unique\s*\(\s*supersedes_assertion_id\s*\)/i);
    expect(sql).toContain("current_validation_report_id");
    expect(sql).toContain("food_catalog_generation_servings_same_food_fkey");
    expect(sql).toContain("food_catalog_generation_names_same_food_fkey");
    expect(sql).toContain("food_catalog_generation_taxonomy_same_food_fkey");
    expect(sql).toContain("food_catalog_generation_markets_same_food_fkey");
    expect(sql).toContain("food_catalog_generation_verification_same_food_fkey");
    expect(sql).toContain("food_catalog_generation_redirects_set_integrity");
  });

  it("seeds only the nullable singleton pointer and no Food or generation facts", () => {
    expect(sql).not.toMatch(/insert\s+into\s+public\.food_items/i);
    expect(sql).not.toMatch(/update\s+public\.release_schema_compatibility/i);
    expect(sql).not.toMatch(/insert\s+into\s+public\.food_catalog_generations/i);
    expect(sql).toMatch(/insert\s+into\s+public\.food_catalog_current_generation/i);
  });

  it("classifies the repository migration as pending without inventing Production identity", () => {
    expect(ledger.productionMigrationCount).toBe(63);
    expect(ledger.pendingCount).toBe(1);
    expect(ledger.unresolvedCount).toBe(1);
    expect(ledger.historyRepair.state).toBe("pending");
    expect(ledger.historyRepair.pendingCount).toBe(1);
    expect(ledger.historyRepair.unresolvedCount).toBe(1);

    const entry = ledger.entries.find((item) => item.localFile === "20260902150000_food_catalog_generation_authority.sql");
    expect(entry).toEqual({
      localFile: "20260902150000_food_catalog_generation_authority.sql",
      state: "pending",
      note: "Food Catalog Plan 3 additive generation-authority migration. Repository-only pending; Production apply requires separate exact Planner/user approval.",
    });
    expect(entry).not.toHaveProperty("productionVersion");
    expect(entry).not.toHaveProperty("productionName");
  });
});
