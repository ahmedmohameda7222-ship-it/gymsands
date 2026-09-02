import { describe, expect, it, vi } from "vitest";
import type { FoodCatalogRootRecord } from "./contracts";
import type { FoodCatalogReadStore } from "./store";
import { getFoodCatalogDomainBundle, resolveCanonicalRootForNewUse } from "./read-service";

const ACTIVE_ID = "11111111-1111-4111-8111-111111111111";
const MERGED_ID = "22222222-2222-4222-8222-222222222222";
const CHAIN_MIDDLE_ID = "33333333-3333-4333-8333-333333333333";
const CHAIN_TARGET_ID = "44444444-4444-4444-8444-444444444444";

function root(id: string, lifecycleStatus: FoodCatalogRootRecord["lifecycleStatus"], mergedIntoFoodId: string | null): FoodCatalogRootRecord {
  return { id, lifecycleStatus, mergedIntoFoodId };
}

function makeStore(roots: Record<string, FoodCatalogRootRecord | null>): FoodCatalogReadStore & Record<string, ReturnType<typeof vi.fn>> {
  return {
    readRoot: vi.fn(async (foodId: string) => roots[foodId] ?? null),
    readNutritionRevisions: vi.fn(async () => []),
    readServingOptions: vi.fn(async () => []),
    readNames: vi.fn(async () => []),
    readTaxonomyAssignments: vi.fn(async () => []),
    readMarketAssignments: vi.fn(async () => []),
    readVerificationAssertions: vi.fn(async () => []),
    readMergeEvents: vi.fn(async () => []),
  } as FoodCatalogReadStore & Record<string, ReturnType<typeof vi.fn>>;
}

describe("Food Catalog V2 canonical read service", () => {
  it("returns an active canonical root without redirect traversal", async () => {
    const store = makeStore({ [ACTIVE_ID]: root(ACTIVE_ID, "active", null) });

    await expect(resolveCanonicalRootForNewUse(store, ACTIVE_ID)).resolves.toEqual(root(ACTIVE_ID, "active", null));
    expect(store.readRoot).toHaveBeenCalledTimes(1);
  });

  it("resolves exactly one flattened merged redirect to an active survivor", async () => {
    const store = makeStore({
      [MERGED_ID]: root(MERGED_ID, "merged", ACTIVE_ID),
      [ACTIVE_ID]: root(ACTIVE_ID, "active", null),
    });

    await expect(resolveCanonicalRootForNewUse(store, MERGED_ID)).resolves.toEqual(root(ACTIVE_ID, "active", null));
    expect(store.readRoot).toHaveBeenNthCalledWith(1, MERGED_ID);
    expect(store.readRoot).toHaveBeenNthCalledWith(2, ACTIVE_ID);
  });

  it("rejects a non-flattened A to B to C merge chain", async () => {
    const store = makeStore({
      [MERGED_ID]: root(MERGED_ID, "merged", CHAIN_MIDDLE_ID),
      [CHAIN_MIDDLE_ID]: root(CHAIN_MIDDLE_ID, "merged", CHAIN_TARGET_ID),
      [CHAIN_TARGET_ID]: root(CHAIN_TARGET_ID, "active", null),
    });

    await expect(resolveCanonicalRootForNewUse(store, MERGED_ID)).rejects.toThrow(/flattened/i);
    expect(store.readRoot).toHaveBeenCalledTimes(2);
  });

  it("rejects a missing merge target", async () => {
    const store = makeStore({ [MERGED_ID]: root(MERGED_ID, "merged", ACTIVE_ID) });

    await expect(resolveCanonicalRootForNewUse(store, MERGED_ID)).rejects.toThrow(/flattened/i);
  });

  it.each(["draft", "deprecated", "withdrawn"] as const)(
    "rejects %s roots for new Nutrition use",
    async (status) => {
      const store = makeStore({ [ACTIVE_ID]: root(ACTIVE_ID, status, null) });
      await expect(resolveCanonicalRootForNewUse(store, ACTIVE_ID)).rejects.toThrow(/unavailable for new Nutrition writes/i);
    },
  );

  it("rejects malformed Food IDs before persistence reads", async () => {
    const store = makeStore({});

    await expect(resolveCanonicalRootForNewUse(store, "not-a-uuid")).rejects.toThrow(/unavailable/i);
    expect(store.readRoot).not.toHaveBeenCalled();
  });

  it("reads every raw fact collection for the resolved survivor and preserves the requested ID", async () => {
    const store = makeStore({
      [MERGED_ID]: root(MERGED_ID, "merged", ACTIVE_ID),
      [ACTIVE_ID]: root(ACTIVE_ID, "active", null),
    });

    const bundle = await getFoodCatalogDomainBundle(store, MERGED_ID);

    expect(bundle).toEqual({
      requestedFoodId: MERGED_ID,
      root: root(ACTIVE_ID, "active", null),
      nutritionRevisions: [],
      servingOptions: [],
      names: [],
      taxonomyAssignments: [],
      marketAssignments: [],
      verificationAssertions: [],
      mergeEvents: [],
    });
    for (const reader of [
      store.readNutritionRevisions,
      store.readServingOptions,
      store.readNames,
      store.readTaxonomyAssignments,
      store.readMarketAssignments,
      store.readVerificationAssertions,
      store.readMergeEvents,
    ]) {
      expect(reader).toHaveBeenCalledTimes(1);
      expect(reader).toHaveBeenCalledWith(ACTIVE_ID);
    }
  });
});
