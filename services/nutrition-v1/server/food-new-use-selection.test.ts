import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CurrentGenerationFoodView } from "@/services/food-catalog/server/current-generation-service";

const generation = vi.hoisted(() => ({ resolve: vi.fn() }));
const personal = vi.hoisted(() => ({ read: vi.fn() }));

vi.mock("@/services/food-catalog/server/current-generation-service", async () => {
  const actual = await vi.importActual<typeof import("@/services/food-catalog/server/current-generation-service")>(
    "@/services/food-catalog/server/current-generation-service",
  );
  return { ...actual, resolveCurrentGenerationFoodForNewUseFromSupabase: generation.resolve };
});
vi.mock("@/services/nutrition-v1/server/personal-overrides", async () => {
  const actual = await vi.importActual<typeof import("@/services/nutrition-v1/server/personal-overrides")>(
    "@/services/nutrition-v1/server/personal-overrides",
  );
  return { ...actual, readCurrentPersonalOverride: personal.read };
});

import * as handoff from "@/services/nutrition-v1/server/food-handoff";

const resolveSelection = (handoff as unknown as {
  resolveCatalogNewUseSelectionWithAuthorities?: (
    owner: SupabaseClient,
    catalog: SupabaseClient,
    userId: string,
    input: { foodId: string; displayName: string; languageTag: string | null },
  ) => Promise<{
    foodId: string;
    name: string;
    languageTag: string;
    servingChoices: Array<{ servingOptionId: string | null; label: string; source: "generation" | "owner_override" }>;
  }>;
}).resolveCatalogNewUseSelectionWithAuthorities;

const userId = "11111111-1111-4111-8111-111111111111";
const foodId = "22222222-2222-4222-8222-222222222222";
const servingA = "33333333-3333-4333-8333-333333333333";
const servingB = "44444444-4444-4444-8444-444444444444";
const nameId = "55555555-5555-4555-8555-555555555555";
const owner = { authority: "owner" } as unknown as SupabaseClient;
const catalog = { authority: "catalog" } as unknown as SupabaseClient;

function view(servings: Array<{ id: string; label: string; foodId?: string }> = []): CurrentGenerationFoodView {
  return {
    requestedFoodId: foodId,
    resolvedFoodId: foodId,
    selections: {
      servingOptionIds: servings.map((item) => item.id),
      nameFactIds: [nameId],
      taxonomyAssignmentIds: [],
      marketAssignmentIds: [],
      verification: [],
    },
    servingOptions: servings.map((item) => ({
      id: item.id,
      createdAt: "2026-09-21T00:00:00.000Z",
      foodId: item.foodId ?? foodId,
      label: item.label,
      amount: 1,
      unitCode: "serving",
      gramWeight: null,
      sourceRecordId: null,
      sourcePortionCode: null,
      evidenceClass: "exact_source",
      sourcePrimary: false,
    })),
    names: [{
      id: nameId,
      createdAt: "2026-09-21T00:00:00.000Z",
      foodId,
      languageTag: "en",
      role: "preferred_display",
      text: "Selected food",
      normalizedText: "selected food",
      scriptCode: "Latn",
      origin: "curated",
      sourceRecordId: null,
      policyVersion: "name-v1",
    }],
  } as unknown as CurrentGenerationFoodView;
}

function noOverride() {
  return {
    foodId,
    hasOverride: false,
    revisionId: null,
    pointerRevision: 0,
    isDeleted: false,
    nutritionOverride: null,
    servingLabel: null,
    note: null,
  };
}

async function run(
  servings: Array<{ id: string; label: string; foodId?: string }>,
  override: Awaited<ReturnType<typeof personal.read>> | ReturnType<typeof noOverride> = noOverride(),
) {
  if (!resolveSelection) throw new Error("Catalog new-use serving selection boundary is not implemented.");
  generation.resolve.mockResolvedValueOnce(view(servings));
  personal.read.mockResolvedValueOnce(override);
  return resolveSelection(owner, catalog, userId, {
    foodId,
    displayName: "Selected food",
    languageTag: "en",
  });
}

describe("Catalog new-use serving authority", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a searchable Food usable as an identified Food even when zero authoritative servings exist", async () => {
    const result = await run([]);
    expect(result).toMatchObject({ foodId, name: "Selected food", languageTag: "en", servingChoices: [] });
  });

  it("returns the single generation-selected serving with its exact identity", async () => {
    const result = await run([{ id: servingA, label: "170 g" }]);
    expect(result.servingChoices).toEqual([{ servingOptionId: servingA, label: "170 g", source: "generation" }]);
  });

  it("returns every selected generation serving without inventing a preferred choice", async () => {
    const result = await run([
      { id: servingA, label: "170 g" },
      { id: servingB, label: "1 cup" },
    ]);
    expect(result.servingChoices).toEqual([
      { servingOptionId: servingA, label: "170 g", source: "generation" },
      { servingOptionId: servingB, label: "1 cup", source: "generation" },
    ]);
  });

  it("lets the active owner serving override replace generation choices only for that owner and carries no generation ID", async () => {
    const result = await run(
      [{ id: servingA, label: "170 g" }, { id: servingB, label: "1 cup" }],
      {
        foodId,
        hasOverride: true,
        revisionId: "66666666-6666-4666-8666-666666666666",
        pointerRevision: 2,
        isDeleted: false,
        nutritionOverride: null,
        servingLabel: "My bowl",
        note: null,
      },
    );
    expect(result.servingChoices).toEqual([{ servingOptionId: null, label: "My bowl", source: "owner_override" }]);
    expect(personal.read).toHaveBeenCalledWith(owner, foodId);
    expect(generation.resolve).toHaveBeenCalledWith(catalog, foodId);
  });
});
