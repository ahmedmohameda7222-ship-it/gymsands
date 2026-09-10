import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import {
  buildRestoredSearchSql,
  verifyRestoredSearchFixture,
} from "./verify-food-catalog-restored-search.mjs";

const fixture = JSON.parse(readFileSync(new URL("../test/fixtures/food-catalog/plan7-golden-search-v1.json", import.meta.url), "utf8"));
const workflow = readFileSync(new URL("../.github/workflows/food-catalog-portable-export-qa.yml", import.meta.url), "utf8");
const head = "a".repeat(40);

describe("Plan 7 restored search verification script", () => {
  it("builds SQL that checks the exact current pointer, rebuilds first, then calls only canonical V2 search", () => {
    const sql = buildRestoredSearchSql(fixture);
    assert.ok(sql.includes("public.food_catalog_current_generation"));
    const rebuildAt = sql.indexOf("public.rebuild_food_catalog_search_projection_v2");
    const searchAt = sql.indexOf("public.search_food_catalog_v2");
    assert.ok(rebuildAt > 0);
    assert.ok(searchAt > rebuildAt);
    assert.ok(!sql.includes("search_nutrition_food_library"));
    assert.doesNotMatch(sql, /https?:\/\//i);
  });

  it("publishes non-sensitive exact-head CORE evidence without claiming final DR readiness", () => {
    const evidence = verifyRestoredSearchFixture({ fixture, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: head });
    assert.equal(evidence.profile, "CORE_PORTABLE");
    assert.equal(evidence.exactHeadVerified, true);
    assert.equal(evidence.goldenSearchVerified, true);
    assert.equal(evidence.drReady, false);
    assert.equal(evidence.providerNetworkUsed, false);
    assert.ok(Object.hasOwn(evidence, "fixtureSha256"));
    assert.ok(Object.hasOwn(evidence, "goldenResultSha256"));
    assert.ok(!Object.hasOwn(evidence, "queryResults"));
    assert.ok(!JSON.stringify(evidence).includes("Chicken Breast"));
  });

  it("allows final DR-ready fixture evidence only for FULL_DR with protected fixture verification", () => {
    const evidence = verifyRestoredSearchFixture({ fixture, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head });
    assert.equal(evidence.profile, "FULL_DR");
    assert.equal(evidence.exactHeadVerified, true);
    assert.equal(evidence.protectedFixtureVerified, true);
    assert.equal(evidence.drReady, true);
    const withoutProtected = verifyRestoredSearchFixture({ fixture: { ...fixture, protectedFixtureVerified: false }, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head });
    assert.equal(withoutProtected.drReady, false);
  });

  it("fails closed on exact-head mismatch, provider network use, or corrupted golden output", () => {
    assert.throws(() => verifyRestoredSearchFixture({ fixture, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: "b".repeat(40) }), /head/i);
    assert.throws(() => verifyRestoredSearchFixture({ fixture: { ...fixture, providerNetworkUsed: true }, profile: "CORE_PORTABLE", expectedHeadSha: head, actualHeadSha: head }), /provider|network/i);
    const corrupted = structuredClone(fixture);
    corrupted.queryCases[0].actual = { items: [], nextCursor: null };
    assert.throws(() => verifyRestoredSearchFixture({ fixture: corrupted, profile: "FULL_DR", expectedHeadSha: head, actualHeadSha: head }), /exact|golden|mismatch/i);
  });

  it("runs canonical search runtime verification on an exact-head Git-migrated local PostgreSQL 17 target", () => {
    for (const fragment of [
      "restored-search-runtime:",
      "supabase/setup-cli@v2",
      "node scripts/replay-local-migration-chain.mjs",
      "current_setting('server_version_num')::int/10000=17",
      "supabase/verification/food-catalog-search-projection-v2.sql",
      "PLAIVRA_LOCAL_DATABASE_URL",
    ]) assert.ok(workflow.includes(fragment), `Expected workflow to contain ${fragment}`);
    assert.doesNotMatch(workflow, /supabase\s+db\s+push\s+--linked/i);
    assert.doesNotMatch(workflow, /supabase\s+link\b/i);
  });
});
