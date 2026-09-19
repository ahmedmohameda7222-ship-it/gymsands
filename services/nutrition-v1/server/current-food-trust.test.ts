import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentCatalogTrustStates } from "@/services/nutrition-v1/server/current-food-trust";

const generation = vi.hoisted(() => ({
  createStore: vi.fn(() => ({ kind: "generation-store" })),
  resolve: vi.fn(),
}));

vi.mock("@/services/food-catalog/server/supabase-generation-read-store", () => ({
  createSupabaseFoodCatalogGenerationReadStore: generation.createStore,
}));

vi.mock("@/services/food-catalog/server/current-generation-service", () => ({
  resolveCurrentGenerationFoodForNewUse: generation.resolve,
}));

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";
const SURVIVOR = "44444444-4444-4444-8444-444444444444";

describe("Task 10 current-generation Recipe trust", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deduplicates canonical ingredient IDs and resolves trust once per unique Food", async () => {
    generation.resolve.mockImplementation(async (_store: unknown, id: string) => ({
      requestedFoodId: id,
      resolvedFoodId: id,
      trust: { verified: id === A },
    }));
    const supabase = {} as SupabaseClient;

    const states = await getCurrentCatalogTrustStates(supabase, [A, A, B, A, B]);

    expect(states).toEqual(new Map([[A, true], [B, false]]));
    expect(generation.createStore).toHaveBeenCalledTimes(1);
    expect(generation.resolve).toHaveBeenCalledTimes(2);
    expect(generation.resolve).toHaveBeenCalledWith(expect.anything(), A);
    expect(generation.resolve).toHaveBeenCalledWith(expect.anything(), B);
  });

  it("uses the redirected survivor CurrentGenerationFoodView trust without reconstructing verification semantics", async () => {
    generation.resolve.mockResolvedValueOnce({
      requestedFoodId: OLD,
      resolvedFoodId: SURVIVOR,
      trust: { verified: true, verification: { identity: "verified", nutrition: "verified" } },
    });

    const states = await getCurrentCatalogTrustStates({} as SupabaseClient, [OLD]);

    expect(states.get(OLD)).toBe(true);
    expect(generation.resolve).toHaveBeenCalledWith(expect.anything(), OLD);
  });

  it.each([
    ["selected revoked assertion", { trust: { verified: false, verification: { identity: "revoked" } } }],
    ["missing selected verification", { trust: { verified: false, verification: { identity: "missing" } } }],
  ])("returns false for %s even if legacy flat state could claim verified", async (_label, partial) => {
    generation.resolve.mockResolvedValueOnce({
      requestedFoodId: A,
      resolvedFoodId: A,
      ...partial,
    });

    const states = await getCurrentCatalogTrustStates({} as SupabaseClient, [A]);

    expect(states.get(A)).toBe(false);
  });

  it.each(["deprecated", "withdrawn", "missing", "no current generation"])(
    "fails closed to not verified for %s current-generation resolution",
    async (reason) => {
      generation.resolve.mockRejectedValueOnce(new Error(reason));

      const states = await getCurrentCatalogTrustStates({} as SupabaseClient, [A]);

      expect(states.get(A)).toBe(false);
    },
  );

  it("never queries flat food_items verification state", async () => {
    generation.resolve.mockResolvedValueOnce({
      requestedFoodId: A,
      resolvedFoodId: A,
      trust: { verified: true },
    });
    const from = vi.fn(() => {
      throw new Error("flat Food verification must not be queried");
    });

    const states = await getCurrentCatalogTrustStates({ from } as unknown as SupabaseClient, [A]);

    expect(states.get(A)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});
