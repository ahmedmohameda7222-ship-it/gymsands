import { describe, expect, it } from "vitest";
import {
  REQUIRED_GOLDEN_SEARCH_CASE_IDS,
  buildRestoredSearchVerificationPlan,
  verifyGoldenSearchMatrix,
  verifySearchRestorePreconditions,
} from "./search-restore-verifier";

const generationId = "a5700000-0000-4000-8000-000000000001";

function goldenCases() {
  return REQUIRED_GOLDEN_SEARCH_CASE_IDS.map((id) => ({
    id,
    expected: { items: [{ foodId: `${id}-food`, servingLabel: null }], nextCursor: null },
    actual: { items: [{ foodId: `${id}-food`, servingLabel: null }], nextCursor: null },
  }));
}

describe("Plan 7 restored search verification", () => {
  it("plans the canonical rebuild before every golden query against the exact restored generation", () => {
    const plan = buildRestoredSearchVerificationPlan({
      profile: "FULL_DR",
      currentGenerationId: generationId,
      restoredGenerationId: generationId,
      projectionVersion: "search-projection-v2",
      nutritionPolicyVersion: null,
      queryCases: [
        { id: "exact", query: "Bench Food 01", languageTag: "en", scriptCode: "Latn", marketScopeCode: "DE", limit: 20, category: null, cuisine: null, scope: "all", filters: {} },
      ],
    });
    expect(plan[0]).toMatchObject({ kind: "REBUILD", generationId, functionName: "public.rebuild_food_catalog_search_projection_v2" });
    expect(plan[1]).toMatchObject({ kind: "SEARCH", caseId: "exact", generationId, functionName: "public.search_food_catalog_v2" });
  });

  it("rejects a stale or unavailable current-generation pointer before rebuild/search", () => {
    expect(() => buildRestoredSearchVerificationPlan({
      profile: "CORE_PORTABLE",
      currentGenerationId: null,
      restoredGenerationId: generationId,
      projectionVersion: "search-projection-v2",
      nutritionPolicyVersion: null,
      queryCases: [],
    })).toThrow(/current.*generation|pointer/i);
    expect(() => buildRestoredSearchVerificationPlan({
      profile: "CORE_PORTABLE",
      currentGenerationId: "b5700000-0000-4000-8000-000000000002",
      restoredGenerationId: generationId,
      projectionVersion: "search-projection-v2",
      nutritionPolicyVersion: null,
      queryCases: [],
    })).toThrow(/stale|generation|pointer/i);
  });

  it("requires the complete golden matrix and exact deterministic result equality", () => {
    expect(verifyGoldenSearchMatrix(goldenCases())).toMatchObject({ passed: true, caseCount: REQUIRED_GOLDEN_SEARCH_CASE_IDS.length });
    expect(REQUIRED_GOLDEN_SEARCH_CASE_IDS).toEqual(expect.arrayContaining([
      "exact", "alias", "prefix", "contains", "locale_script", "market_direct", "market_parent", "market_global",
      "category", "current_cuisine", "nullable_numerics", "presets", "favorites", "recent", "my_food",
      "cursor_continuation", "cursor_context_mismatch", "redirect", "stale_generation_isolation", "zero_row",
    ]));
    const incomplete = goldenCases().filter((entry) => entry.id !== "redirect");
    expect(() => verifyGoldenSearchMatrix(incomplete)).toThrow(/redirect|golden.*matrix/i);
    const mismatched = goldenCases().map((entry) => entry.id === "exact" ? { ...entry, actual: { items: [], nextCursor: null } } : entry);
    expect(() => verifyGoldenSearchMatrix(mismatched)).toThrow(/exact|golden|mismatch/i);
  });

  it("fails before trust on corruption, precision loss, torn export, wrong owner, nonce reuse, or preseed mismatch", () => {
    const clean = {
      artifactCorruption: false,
      precisionLoss: false,
      tornExport: false,
      wrongOwner: false,
      nonceReuse: false,
      preseedMismatch: false,
      globalServingDisplayAuthorityPresent: false,
      observedGlobalServingLabels: [null, null],
    };
    expect(verifySearchRestorePreconditions(clean)).toBe(true);
    for (const key of ["artifactCorruption", "precisionLoss", "tornExport", "wrongOwner", "nonceReuse", "preseedMismatch"] as const) {
      expect(() => verifySearchRestorePreconditions({ ...clean, [key]: true })).toThrow(new RegExp(key.replace(/[A-Z]/g, (m) => `.*${m.toLowerCase()}`), "i"));
    }
  });

  it("keeps global serving display NULL until an explicit serving display authority exists", () => {
    expect(verifySearchRestorePreconditions({
      artifactCorruption: false,
      precisionLoss: false,
      tornExport: false,
      wrongOwner: false,
      nonceReuse: false,
      preseedMismatch: false,
      globalServingDisplayAuthorityPresent: false,
      observedGlobalServingLabels: [null],
    })).toBe(true);
    expect(() => verifySearchRestorePreconditions({
      artifactCorruption: false,
      precisionLoss: false,
      tornExport: false,
      wrongOwner: false,
      nonceReuse: false,
      preseedMismatch: false,
      globalServingDisplayAuthorityPresent: false,
      observedGlobalServingLabels: ["100 g"],
    })).toThrow(/serving.*null|authority/i);
  });
});
