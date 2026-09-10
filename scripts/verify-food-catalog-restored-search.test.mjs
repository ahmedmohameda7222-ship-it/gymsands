import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildRestoredSearchSql,
  verifyRestoredSearchFixture,
} from "./verify-food-catalog-restored-search.mjs";

const fixture = JSON.parse(readFileSync(new URL("../test/fixtures/food-catalog/plan7-golden-search-v1.json", import.meta.url), "utf8"));
const head = "a".repeat(40);

describe("Plan 7 restored search verification script", () => {
  it("builds SQL that checks the exact current pointer, rebuilds first, then calls only canonical V2 search", () => {
    const sql = buildRestoredSearchSql(fixture);
    expect(sql).toContain("public.food_catalog_current_generation");
    const rebuildAt = sql.indexOf("public.rebuild_food_catalog_search_projection_v2");
    const searchAt = sql.indexOf("public.search_food_catalog_v2");
    expect(rebuildAt).toBeGreaterThan(0);
    expect(searchAt).toBeGreaterThan(rebuildAt);
    expect(sql).not.toContain("search_nutrition_food_library");
    expect(sql).not.toMatch(/https?:\/\//i);
  });

  it("publishes non-sensitive exact-head CORE evidence without claiming final DR readiness", () => {
    const evidence = verifyRestoredSearchFixture({ fixture, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: head });
    expect(evidence).toMatchObject({ profile: "CORE_PORTABLE", exactHeadVerified: true, goldenSearchVerified: true, drReady: false, providerNetworkUsed: false });
    expect(evidence).toHaveProperty("fixtureSha256");
    expect(evidence).toHaveProperty("goldenResultSha256");
    expect(evidence).not.toHaveProperty("queryResults");
    expect(JSON.stringify(evidence)).not.toContain("Chicken Breast");
  });

  it("allows final DR-ready fixture evidence only for FULL_DR with protected fixture verification", () => {
    const evidence = verifyRestoredSearchFixture({ fixture, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head });
    expect(evidence).toMatchObject({ profile: "FULL_DR", exactHeadVerified: true, protectedFixtureVerified: true, drReady: true });
    expect(verifyRestoredSearchFixture({ fixture: { ...fixture, protectedFixtureVerified: false }, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head }).drReady).toBe(false);
  });

  it("fails closed on exact-head mismatch, provider network use, or corrupted golden output", () => {
    expect(() => verifyRestoredSearchFixture({ fixture, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: "b".repeat(40) })).toThrow(/head/i);
    expect(() => verifyRestoredSearchFixture({ fixture: { ...fixture, providerNetworkUsed: true }, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: head })).toThrow(/provider|network/i);
    const corrupted = structuredClone(fixture);
    corrupted.queryCases[0].actual = { items: [], nextCursor: null };
    expect(() => verifyRestoredSearchFixture({ fixture: corrupted, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head })).toThrow(/exact|golden|mismatch/i);
  });
});
