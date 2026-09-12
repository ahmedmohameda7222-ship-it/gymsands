import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REQUIRED_GOLDEN_SEARCH_CASE_IDS } from "../lib/food-catalog/portability/search-restore-verifier.ts";
import {
  buildAuthenticatedSearchSql,
  buildSearchRuntimeEvidence,
  inferSearchRuntimeMode,
} from "./capture-food-catalog-restored-search-runtime.mjs";

const head = "a".repeat(40);
const currentGenerationId = "71000000-0000-4000-8000-000000000901";
const currentFoodId = "71000000-0000-4000-8000-000000000101";
const ownerId = "71000000-0000-4000-8000-000000000001";

function passing(mode = "restored-authoritative") {
  return {
    mode,
    headSha: head,
    currentGenerationId,
    currentResult: { items: [{ id: currentFoodId, name: "Plan7 Portable Chicken" }], nextCursor: null },
    staleResult: { items: [], nextCursor: null },
    currentRebuild: { documentCount: 1, projectionChecksumSha256: "b".repeat(64) },
    staleRebuild: mode === "source-adversarial" ? { documentCount: 1, projectionChecksumSha256: "c".repeat(64) } : null,
    documentCounts: { current: 1, stale: mode === "source-adversarial" ? 1 : 0 },
    goldenMatrix: {
      passed: true,
      caseCount: REQUIRED_GOLDEN_SEARCH_CASE_IDS.length,
      caseIds: [...REQUIRED_GOLDEN_SEARCH_CASE_IDS],
      resultSha256: "d".repeat(64),
    },
  };
}

describe("Plan 7 same-restored-target search evidence", () => {
  it("binds canonical search execution to the deterministic authenticated fixture owner", () => {
    const sql = buildAuthenticatedSearchSql("public.search_food_catalog_v2('Chicken')", ownerId);
    assert.match(sql, /WITH plan7_auth_context AS MATERIALIZED/i);
    assert.match(sql, new RegExp(`set_config\\('request\\.jwt\\.claim\\.sub','${ownerId}',true\\)`));
    assert.match(sql, /SELECT \(public\.search_food_catalog_v2\('Chicken'\)\)::text\s+FROM plan7_auth_context;/i);
    assert.throws(() => buildAuthenticatedSearchSql("public.search_food_catalog_v2('Chicken')", "not-a-uuid"), /UUID/i);
  });

  it("infers stale adversarial mode only for the distinct source database URL", () => {
    const env = { PLAN7_DATABASE_URL: "postgres://source", PLAN7_RESTORE_DATABASE_URL: "postgres://target" };
    assert.equal(inferSearchRuntimeMode("postgres://source", "auto", env), "source-adversarial");
    assert.equal(inferSearchRuntimeMode("postgres://target", "auto", env), "restored-authoritative");
    assert.equal(inferSearchRuntimeMode("postgres://other", "auto", env), "restored-authoritative");
    assert.equal(inferSearchRuntimeMode("postgres://source", "restored-authoritative", env), "restored-authoritative");
  });

  it("requires authoritative restored evidence to rebuild current only with zero stale SearchDocuments", () => {
    const evidence = buildSearchRuntimeEvidence(passing());
    assert.equal(evidence.mode, "restored-authoritative");
    assert.equal(evidence.currentGenerationId, currentGenerationId);
    assert.equal(evidence.rebuildVerified, true);
    assert.equal(evidence.authoritativeCurrentOnlyRebuildVerified, true);
    assert.equal(evidence.staleAdversarialFixtureVerified, false);
    assert.equal(evidence.documentCounts.stale, 0);
    assert.equal(evidence.staleProjectionChecksumSha256, null);
    assert.equal(evidence.goldenSearchVerified, true);
    assert.equal(evidence.staleGenerationIsolationVerified, true);
    assert.equal(evidence.goldenCaseCount, REQUIRED_GOLDEN_SEARCH_CASE_IDS.length);
    assert.match(evidence.goldenResultSha256, /^[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(evidence, "drReady"), false);
  });

  it("keeps stale-generation adversarial rebuild in source-only evidence", () => {
    const evidence = buildSearchRuntimeEvidence(passing("source-adversarial"));
    assert.equal(evidence.authoritativeCurrentOnlyRebuildVerified, false);
    assert.equal(evidence.staleAdversarialFixtureVerified, true);
    assert.equal(evidence.documentCounts.stale, 1);
    assert.match(evidence.staleProjectionChecksumSha256, /^[0-9a-f]{64}$/);
  });

  it("fails closed when restored authoritative evidence contains stale projection documents", () => {
    const contaminated = passing();
    contaminated.documentCounts.stale = 1;
    assert.throws(() => buildSearchRuntimeEvidence(contaminated), /current-only|rebuild|projection/i);
  });

  it("fails closed when current search misses the current Food or stale-generation data leaks", () => {
    const missing = passing();
    missing.currentResult = { items: [], nextCursor: null };
    assert.throws(() => buildSearchRuntimeEvidence(missing), /current|canonical|search/i);

    const leaked = passing();
    leaked.staleResult = { items: [{ id: "71000000-0000-4000-8000-000000000103" }], nextCursor: null };
    assert.throws(() => buildSearchRuntimeEvidence(leaked), /stale|generation/i);
  });

  it("fails closed when projection rebuild or any required runtime golden case is absent", () => {
    const incomplete = passing();
    incomplete.documentCounts.current = 0;
    assert.throws(() => buildSearchRuntimeEvidence(incomplete), /rebuild|projection/i);

    const missingCase = passing();
    missingCase.goldenMatrix.caseCount -= 1;
    missingCase.goldenMatrix.caseIds = missingCase.goldenMatrix.caseIds.slice(0, -1);
    assert.throws(() => buildSearchRuntimeEvidence(missingCase), /golden|matrix|required/i);
  });
});
