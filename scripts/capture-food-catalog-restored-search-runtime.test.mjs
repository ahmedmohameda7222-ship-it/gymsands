import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REQUIRED_GOLDEN_SEARCH_CASE_IDS } from "../lib/food-catalog/portability/search-restore-verifier.ts";
import {
  buildAuthenticatedSearchSql,
  buildSearchRuntimeEvidence,
} from "./capture-food-catalog-restored-search-runtime.mjs";

const head = "a".repeat(40);
const currentGenerationId = "71000000-0000-4000-8000-000000000901";
const currentFoodId = "71000000-0000-4000-8000-000000000101";
const ownerId = "71000000-0000-4000-8000-000000000001";

function passing() {
  return {
    headSha: head,
    currentGenerationId,
    currentResult: { items: [{ id: currentFoodId, name: "Plan7 Portable Chicken" }], nextCursor: null },
    staleResult: { items: [], nextCursor: null },
    currentRebuild: { documentCount: 1, projectionChecksumSha256: "b".repeat(64) },
    staleRebuild: { documentCount: 1, projectionChecksumSha256: "c".repeat(64) },
    documentCounts: { current: 1, stale: 1 },
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

  it("binds deterministic search proof to the exact current generation and the executed full golden matrix without owning DR readiness", () => {
    const evidence = buildSearchRuntimeEvidence(passing());
    assert.equal(evidence.headSha, head);
    assert.equal(evidence.currentGenerationId, currentGenerationId);
    assert.equal(evidence.rebuildVerified, true);
    assert.equal(evidence.goldenSearchVerified, true);
    assert.equal(evidence.staleGenerationIsolationVerified, true);
    assert.equal(evidence.goldenCaseCount, REQUIRED_GOLDEN_SEARCH_CASE_IDS.length);
    assert.deepEqual(evidence.goldenCaseIds, [...REQUIRED_GOLDEN_SEARCH_CASE_IDS]);
    assert.equal(evidence.goldenMatrixResultSha256, "d".repeat(64));
    assert.match(evidence.goldenResultSha256, /^[0-9a-f]{64}$/);
    assert.equal(Object.hasOwn(evidence, "drReady"), false);
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
