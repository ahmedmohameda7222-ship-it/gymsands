import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildSearchRuntimeEvidence } from "./capture-food-catalog-restored-search-runtime.mjs";

const head = "a".repeat(40);
const currentGenerationId = "71000000-0000-4000-8000-000000000901";
const currentFoodId = "71000000-0000-4000-8000-000000000101";

function passing() {
  return {
    headSha: head,
    currentGenerationId,
    currentResult: { items: [{ id: currentFoodId, name: "Plan7 Portable Chicken" }], nextCursor: null },
    staleResult: { items: [], nextCursor: null },
    currentRebuild: { documentCount: 1, projectionChecksumSha256: "b".repeat(64) },
    staleRebuild: { documentCount: 1, projectionChecksumSha256: "c".repeat(64) },
    documentCounts: { current: 1, stale: 1 },
  };
}

describe("Plan 7 same-restored-target search evidence", () => {
  it("binds deterministic search proof to the exact current generation without owning DR readiness", () => {
    const evidence = buildSearchRuntimeEvidence(passing());
    assert.equal(evidence.headSha, head);
    assert.equal(evidence.currentGenerationId, currentGenerationId);
    assert.equal(evidence.rebuildVerified, true);
    assert.equal(evidence.goldenSearchVerified, true);
    assert.equal(evidence.staleGenerationIsolationVerified, true);
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

  it("fails closed when projection rebuild evidence is absent", () => {
    const incomplete = passing();
    incomplete.documentCounts.current = 0;
    assert.throws(() => buildSearchRuntimeEvidence(incomplete), /rebuild|projection/i);
  });
});
