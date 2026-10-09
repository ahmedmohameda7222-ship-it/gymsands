import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const MIGRATION_FILE = "20261008202500_food_catalog_plan7_retirement_contract.sql";
const MIGRATION_PATH = `supabase/migrations/${MIGRATION_FILE}`;
const VERIFICATION_PATH = "supabase/verification/food-catalog-plan7-retirement-contract.sql";
const REGISTRY_PATH = "scripts/run-database-verification.mjs";

const read = (path: string) => (existsSync(path) ? readFileSync(path, "utf8") : "");
const migration = read(MIGRATION_PATH);
const lower = migration.toLowerCase();
const verifier = read(VERIFICATION_PATH).toLowerCase();
const registry = read(REGISTRY_PATH);

describe("Food Catalog Plan 7 retirement contract migration", () => {
  it("allocates one forward migration and registers its permanent verifier", () => {
    expect(migration).not.toBe("");
    expect(verifier).not.toBe("");
    expect(registry).toContain(VERIFICATION_PATH);
    expect(registry.indexOf(VERIFICATION_PATH))
      .toBeLessThan(registry.indexOf("supabase/verification/production-release-migration-preflight.sql"));
  });

  it("retires exactly the approved three-object set in dependency order", () => {
    const dropFunction = "drop function public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb);";
    const dropAliases = "drop table public.food_aliases;";
    const dropMarket = "drop table public.food_market_relevance;";

    expect(lower).toContain(dropFunction);
    expect(lower).toContain(dropAliases);
    expect(lower).toContain(dropMarket);
    expect(lower.indexOf(dropFunction)).toBeLessThan(lower.indexOf(dropAliases));
    expect(lower.indexOf(dropFunction)).toBeLessThan(lower.indexOf(dropMarket));

    const drops = lower.match(/\bdrop\s+(?:function|table|column)\b/g) ?? [];
    expect(drops).toHaveLength(3);
    expect(lower).not.toMatch(/\bcascade\b/);
  });

  it("fails closed on zero-row, execute-grant, and unexpected dependency drift", () => {
    expect(lower).toMatch(/count\(\*\)\s+from\s+public\.food_aliases/);
    expect(lower).toMatch(/count\(\*\)\s+from\s+public\.food_market_relevance/);
    expect(lower).toContain("aclexplode");
    expect(lower).toContain("anon");
    expect(lower).toContain("authenticated");
    expect(lower).toContain("service_role");
    expect(lower).toContain("unexpected public.food_aliases function dependencies");
    expect(lower).toContain("unexpected public.food_market_relevance function dependencies");
    expect(lower).toContain("unexpected public.food_aliases view dependencies");
    expect(lower).toContain("unexpected public.food_market_relevance view dependencies");
  });

  it("does not mutate data or retire any unapproved owner/root/current authority", () => {
    expect(lower).not.toMatch(/\b(?:insert\s+into|update\s+public\.|delete\s+from|truncate)\b/);
    expect(lower).not.toMatch(/drop\s+table\s+public\.food_personal_corrections/);
    expect(lower).not.toMatch(/drop\s+table\s+public\.user_food_favorites/);
    expect(lower).not.toMatch(/alter\s+table\s+public\.food_items/);
    expect(lower).not.toMatch(/drop\s+function\s+public\.search_food_catalog_v2/);
    expect(lower).not.toMatch(/drop\s+function\s+public\.rebuild_food_catalog_search_projection_v2/);
    expect(lower).not.toMatch(/drop\s+table\s+public\.food_barcodes/);
    expect(lower).not.toContain("release_schema_compatibility");
  });

  it("permanent verification proves retired absence and retained current authority", () => {
    for (const retired of [
      "public.search_nutrition_food_library",
      "public.food_aliases",
      "public.food_market_relevance",
    ]) {
      expect(verifier).toContain(retired);
    }

    for (const retained of [
      "public.food_personal_corrections",
      "public.user_food_favorites",
      "public.food_favorites",
      "public.food_barcodes",
      "public.food_catalog_search_documents",
      "public.food_catalog_current_generation",
      "public.food_personal_overrides",
      "public.food_personal_override_revisions",
      "public.food_personal_override_operations",
      "public.search_food_catalog_v2",
      "public.search_food_catalog_v2_for_mcp_v1",
      "public.rebuild_food_catalog_search_projection_v2",
      "20260724232734",
    ]) {
      expect(verifier).toContain(retained);
    }
    expect(verifier).toContain("begin read only;");
    expect(verifier).toContain("rollback;");
  });
});
