import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentCatalogTrustStates } from "@/services/nutrition-v1/server/current-food-trust";

const generation = vi.hoisted(() => ({
  resolve: vi.fn(),
  batch: vi.fn(),
}));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return {
    ...actual,
    resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve,
    resolveCurrentGenerationTrustForNewUseBatchFromSupabase: generation.batch,
  };
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const OLD = "33333333-3333-4333-8333-333333333333";
const SURVIVOR = "44444444-4444-4444-8444-444444444444";

describe("Task 10 current-generation Recipe trust", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generation.batch.mockResolvedValue(new Map());
  });

  it("uses one batch trust resolution for 20 unique Recipe Foods instead of one full resolver per Food", async () => {
    const ids = Array.from({ length: 20 }, (_, index) => `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
    generation.resolve.mockImplementation(async (_supabase: SupabaseClient, id: string) => ({
      requestedFoodId: id,
      resolvedFoodId: id,
      trust: { verified: true },
    }));
    generation.batch.mockResolvedValue(new Map(ids.map((id) => [id, {
      requestedFoodId: id,
      resolvedFoodId: id,
      trust: { verified: true },
    }])));

    const supabase = {} as SupabaseClient;
    const states = await getCurrentCatalogTrustStates(supabase, [...ids, ids[0]!, ids[1]!]);

    expect(states.size).toBe(20);
    expect(Array.from(states.values()).every(Boolean)).toBe(true);
    expect(generation.batch).toHaveBeenCalledTimes(1);
    expect(generation.batch).toHaveBeenCalledWith(supabase, ids);
    expect(generation.resolve).not.toHaveBeenCalled();
  });

  it("deduplicates canonical ingredient IDs before one batch trust resolution", async () => {
    const supabase = {} as SupabaseClient;
    generation.batch.mockResolvedValueOnce(new Map([
      [A, { requestedFoodId: A, resolvedFoodId: A, trust: { verified: true } }],
      [B, { requestedFoodId: B, resolvedFoodId: B, trust: { verified: false } }],
    ]));

    const states = await getCurrentCatalogTrustStates(supabase, [A, A, B, A, B]);

    expect(states).toEqual(new Map([[A, true], [B, false]]));
    expect(generation.batch).toHaveBeenCalledOnce();
    expect(generation.batch).toHaveBeenCalledWith(supabase, [A, B]);
    expect(generation.resolve).not.toHaveBeenCalled();
  });

  it("uses the redirected survivor CurrentGenerationFoodView trust without reconstructing verification semantics", async () => {
    generation.batch.mockResolvedValueOnce(new Map([[OLD, {
      requestedFoodId: OLD,
      resolvedFoodId: SURVIVOR,
      trust: { verified: true, verification: { identity: "verified", nutrition: "verified" } },
    }]]));

    const supabase = {} as SupabaseClient;
    const states = await getCurrentCatalogTrustStates(supabase, [OLD]);

    expect(states.get(OLD)).toBe(true);
    expect(generation.batch).toHaveBeenCalledWith(supabase, [OLD]);
    expect(generation.resolve).not.toHaveBeenCalled();
  });

  it.each([
    ["selected revoked assertion", { trust: { verified: false, verification: { identity: "revoked" } } }],
    ["missing selected verification", { trust: { verified: false, verification: { identity: "missing" } } }],
  ])("returns false for %s even if legacy flat state could claim verified", async (_label, partial) => {
    generation.batch.mockResolvedValueOnce(new Map([[A, {
      requestedFoodId: A,
      resolvedFoodId: A,
      ...partial,
    }]]));

    const states = await getCurrentCatalogTrustStates({} as SupabaseClient, [A]);

    expect(states.get(A)).toBe(false);
  });

  it.each(["deprecated", "withdrawn", "missing", "no current generation"])(
    "fails closed to not verified for %s current-generation resolution",
    async (reason) => {
      generation.batch.mockResolvedValueOnce(new Map([[A, {
        requestedFoodId: A,
        resolvedFoodId: reason === "missing" || reason === "no current generation" ? null : A,
        trust: null,
      }]]));

      const states = await getCurrentCatalogTrustStates({} as SupabaseClient, [A]);

      expect(states.get(A)).toBe(false);
    },
  );

  it("never queries flat food_items verification state", async () => {
    generation.batch.mockResolvedValueOnce(new Map([[A, {
      requestedFoodId: A,
      resolvedFoodId: A,
      trust: { verified: true },
    }]]));
    const from = vi.fn(() => {
      throw new Error("flat Food verification must not be queried");
    });

    const states = await getCurrentCatalogTrustStates({ from } as unknown as SupabaseClient, [A]);

    expect(states.get(A)).toBe(true);
    expect(from).not.toHaveBeenCalled();
  });
});
