import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
} from "@/services/food-catalog/server/contracts";
import type {
  StoredCatalogGeneration,
  StoredGenerationFood,
  StoredGenerationSelections,
} from "@/services/food-catalog/server/generation-contracts";
import type { FoodCatalogGenerationReadStore } from "@/services/food-catalog/server/generation-store";
import {
  resolveFoodHandoff,
  type FoodHandoffInput,
  type ResolvedFoodHandoff,
} from "@/services/nutrition-v1/server/food-handoff";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const REQUESTED_FOOD_ID = "22222222-2222-4222-8222-222222222222";
const SURVIVOR_FOOD_ID = "33333333-3333-4333-8333-333333333333";
const GENERATION_G1 = "44444444-4444-4444-8444-444444444441";
const GENERATION_G2 = "44444444-4444-4444-8444-444444444442";
const EVENT_ID = "55555555-5555-4555-8555-555555555555";
const REPORT_ID = "66666666-6666-4666-8666-666666666666";
const NUTRITION_SELECTED_ID = "77777777-7777-4777-8777-777777777771";
const NUTRITION_NEWER_ID = "77777777-7777-4777-8777-777777777772";
const NAME_SELECTED_ID = "88888888-8888-4888-8888-888888888881";
const NAME_ALT_ID = "88888888-8888-4888-8888-888888888882";
const NAME_UNSELECTED_NEWER_ID = "88888888-8888-4888-8888-888888888883";
const SERVING_SELECTED_ID = "99999999-9999-4999-8999-999999999991";
const SERVING_ALT_ID = "99999999-9999-4999-8999-999999999992";
const SERVING_UNSELECTED_NEWER_ID = "99999999-9999-4999-8999-999999999993";
const ACTIVATION_SET_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ACTIVATION_MEMBER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const ACTIVATION_GRANT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const SHA = "a".repeat(64);

type CatalogHandoffInput = Extract<FoodHandoffInput, { source: "catalog" }>;

type ResolveWithDependencies = (
  supabase: SupabaseClient,
  userId: string,
  input: FoodHandoffInput,
  dependencies: { generationStore: FoodCatalogGenerationReadStore },
) => Promise<ResolvedFoodHandoff>;

const resolveWithDependencies = resolveFoodHandoff as unknown as ResolveWithDependencies;

const generationG1: StoredCatalogGeneration = {
  id: GENERATION_G1,
  baseGenerationId: null,
  generationOrdinal: 1,
  compositionSchemaVersion: "composition-v1",
  generationPolicyVersion: "generation-v1",
  activationPolicyVersion: "activation-v1",
  trustPolicyVersion: "trust-v1",
  projectionVersion: "projection-v1",
  changeManifestChecksumSha256: "b".repeat(64),
  compositionChecksumSha256: "c".repeat(64),
  authorityReference: "g1",
  createdAt: "2026-09-20T08:00:00.000Z",
  sealedAt: "2026-09-20T09:00:00.000Z",
};

const generationG2: StoredCatalogGeneration = {
  ...generationG1,
  id: GENERATION_G2,
  baseGenerationId: GENERATION_G1,
  generationOrdinal: 2,
  compositionChecksumSha256: SHA,
  authorityReference: "g2-current",
  createdAt: "2026-09-21T08:00:00.000Z",
  sealedAt: "2026-09-21T09:00:00.000Z",
};

const selectedNutrition: StoredFoodNutritionRevision = {
  id: NUTRITION_SELECTED_ID,
  createdAt: "2026-09-21T07:00:00.000Z",
  foodId: SURVIVOR_FOOD_ID,
  revisionNumber: 3,
  calories: 100,
  protein_g: null,
  carbs_g: 8,
  fat_g: 2,
  saturated_fat_g: null,
  fiber_g: null,
  sugars_g: 7,
  sodium_mg: 60,
  basisAmount: 100,
  basisUnit: "g",
  nutrientMappingVersion: "map-v1",
  sourceRecordId: null,
};

const newerUnselectedNutrition: StoredFoodNutritionRevision = {
  ...selectedNutrition,
  id: NUTRITION_NEWER_ID,
  createdAt: "2026-09-22T07:00:00.000Z",
  revisionNumber: 4,
  calories: 999,
  protein_g: 999,
};

const selectedName: StoredFoodNameFact = {
  id: NAME_SELECTED_ID,
  createdAt: "2026-09-21T07:00:00.000Z",
  foodId: SURVIVOR_FOOD_ID,
  languageTag: "en",
  role: "preferred_display",
  text: "Generation yogurt",
  normalizedText: "generation yogurt",
  scriptCode: "Latn",
  origin: "curated",
  sourceRecordId: null,
  policyVersion: "name-v1",
};

const altSelectedName: StoredFoodNameFact = {
  ...selectedName,
  id: NAME_ALT_ID,
  role: "synonym",
  text: "Generation yoghurt",
  normalizedText: "generation yoghurt",
};

const newerUnselectedName: StoredFoodNameFact = {
  ...selectedName,
  id: NAME_UNSELECTED_NEWER_ID,
  createdAt: "2026-09-22T07:00:00.000Z",
  text: "Flat-looking newer yogurt",
  normalizedText: "flat-looking newer yogurt",
};

const selectedServing: StoredFoodServingOption = {
  id: SERVING_SELECTED_ID,
  createdAt: "2026-09-21T07:00:00.000Z",
  foodId: SURVIVOR_FOOD_ID,
  label: "170 g",
  amount: 170,
  unitCode: "g",
  gramWeight: null,
  sourceRecordId: null,
  sourcePortionCode: null,
  evidenceClass: "exact_source",
  sourcePrimary: true,
};

const altSelectedServing: StoredFoodServingOption = {
  ...selectedServing,
  id: SERVING_ALT_ID,
  label: "1 tub",
  amount: 1,
  unitCode: "g",
};

const newerUnselectedServing: StoredFoodServingOption = {
  ...selectedServing,
  id: SERVING_UNSELECTED_NEWER_ID,
  createdAt: "2026-09-22T07:00:00.000Z",
  label: "200 g",
  amount: 200,
};

const allNames = [selectedName, altSelectedName, newerUnselectedName];
const allServings = [selectedServing, altSelectedServing, newerUnselectedServing];
const allNutrition = [selectedNutrition, newerUnselectedNutrition];

function activeGenerationFood(lifecycle: StoredGenerationFood["lifecycle"] = "active"): StoredGenerationFood {
  return {
    generationId: GENERATION_G2,
    foodId: SURVIVOR_FOOD_ID,
    lifecycle,
    nutritionRevisionId: NUTRITION_SELECTED_ID,
    activationSetId: lifecycle === "active" ? ACTIVATION_SET_ID : null,
    activationSetMemberId: lifecycle === "active" ? ACTIVATION_MEMBER_ID : null,
    activationGrantEventId: lifecycle === "active" ? ACTIVATION_GRANT_ID : null,
  };
}

type StoreOptions = {
  current?: boolean;
  redirected?: boolean;
  lifecycle?: StoredGenerationFood["lifecycle"];
  nameFactIds?: string[];
  servingOptionIds?: string[];
  names?: StoredFoodNameFact[];
  servings?: StoredFoodServingOption[];
};

function makeGenerationStore(options: StoreOptions = {}): FoodCatalogGenerationReadStore {
  const current = options.current ?? true;
  const redirected = options.redirected ?? false;
  const lifecycle = options.lifecycle ?? "active";
  const nameFactIds = options.nameFactIds ?? [NAME_SELECTED_ID];
  const servingOptionIds = options.servingOptionIds ?? [SERVING_SELECTED_ID];
  const names = options.names ?? allNames;
  const servings = options.servings ?? allServings;
  const selections: StoredGenerationSelections = {
    nameFactIds,
    servingOptionIds,
    taxonomyAssignmentIds: [],
    marketAssignmentIds: [],
    verification: [],
  };

  return {
    readCurrentPointer: vi.fn(async () => current
      ? {
          currentGenerationId: GENERATION_G2,
          currentEventId: EVENT_ID,
          currentValidationReportId: REPORT_ID,
          pointerRevision: 2,
        }
      : {
          currentGenerationId: null,
          currentEventId: null,
          currentValidationReportId: null,
          pointerRevision: 0,
        }),
    readGeneration: vi.fn(async (generationId: string) => {
      if (generationId === GENERATION_G2) return generationG2;
      if (generationId === GENERATION_G1) return generationG1;
      return null;
    }),
    readGenerationFood: vi.fn(async (generationId: string, foodId: string) => {
      if (generationId !== GENERATION_G2) return null;
      if (foodId === SURVIVOR_FOOD_ID) return activeGenerationFood(lifecycle);
      if (!redirected && foodId === REQUESTED_FOOD_ID) {
        return { ...activeGenerationFood(lifecycle), foodId: REQUESTED_FOOD_ID };
      }
      return null;
    }),
    readGenerationRedirect: vi.fn(async (generationId: string, sourceFoodId: string) => {
      if (generationId === GENERATION_G2 && redirected && sourceFoodId === REQUESTED_FOOD_ID) {
        return { generationId: GENERATION_G2, sourceFoodId: REQUESTED_FOOD_ID, targetFoodId: SURVIVOR_FOOD_ID };
      }
      return null;
    }),
    readGenerationSelections: vi.fn(async (_generationId: string, foodId: string) => ({
      ...selections,
      verification: selections.verification.map((selection) => ({ ...selection, foodId })),
    })),
    readNutritionRevision: vi.fn(async (foodId: string, revisionId: string) => {
      const found = allNutrition.find((item) => item.id === revisionId);
      return found ? { ...found, foodId } : null;
    }),
    readServingOptions: vi.fn(async (foodId: string, ids: readonly string[]) =>
      servings.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, foodId }))),
    readNames: vi.fn(async (foodId: string, ids: readonly string[]) =>
      names.filter((item) => ids.includes(item.id)).map((item) => ({ ...item, foodId }))),
    readTaxonomyAssignments: vi.fn(async () => []),
    readMarketAssignments: vi.fn(async () => []),
    readVerificationAssertions: vi.fn(async () => []),
    readActivationAuthority: vi.fn(async () => lifecycle === "active"
      ? {
          activationSetId: ACTIVATION_SET_ID,
          activationSetMemberId: ACTIVATION_MEMBER_ID,
          foodId: redirected ? SURVIVOR_FOOD_ID : REQUESTED_FOOD_ID,
          activationPolicyVersion: "activation-v1",
          eligibility: "eligible" as const,
          sourceLegalAccepted: true,
          grantEventId: ACTIVATION_GRANT_ID,
          grantCreatedAt: "2026-09-21T08:30:00.000Z",
          invalidatedAt: null,
        }
      : null),
    readGenerationEvent: vi.fn(async (eventId: string) => eventId === EVENT_ID
      ? {
          id: EVENT_ID,
          operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          eventType: "promote" as const,
          fromGenerationId: GENERATION_G1,
          toGenerationId: GENERATION_G2,
          revokedGenerationId: null,
          generationChecksumSha256: SHA,
          validationReportId: REPORT_ID,
          actor: {
            principalId: "catalog-service",
            principalType: "service" as const,
            authorityReference: "promotion",
            reasonCode: "promote",
            policyVersion: "control-v1",
          },
          reasonCode: "promote",
          authorityReference: "promotion",
          policyVersion: "control-v1",
          createdAt: "2026-09-21T09:05:00.000Z",
        }
      : null),
    readValidationReport: vi.fn(async (reportId: string) => reportId === REPORT_ID
      ? {
          id: REPORT_ID,
          generationId: GENERATION_G2,
          generationChecksumSha256: SHA,
          validatorSetVersion: "validator-v1",
          policyVersion: "validation-v1",
          reportChecksumSha256: "d".repeat(64),
          blockerCount: 0,
          errorCount: 0,
          warningCount: 0,
          infoCount: 0,
          createdAt: "2026-09-21T09:02:00.000Z",
        }
      : null),
    readValidationFindings: vi.fn(async () => []),
  };
}

type OwnerOverridePayload = {
  foodId: string;
  hasOverride: boolean;
  revisionId: string | null;
  pointerRevision: number;
  isDeleted: boolean;
  nutritionOverride: Record<string, number | null> | null;
  servingLabel: string | null;
  note: string | null;
};

function noOverride(foodId = REQUESTED_FOOD_ID): OwnerOverridePayload {
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

function catalogClient(ownerPayload: OwnerOverridePayload = noOverride()) {
  const rpc = vi.fn(async (): Promise<{ data: OwnerOverridePayload | null; error: null | { message: string } }> => ({ data: ownerPayload, error: null }));
  const from = vi.fn((table: string) => {
    throw new Error("Catalog handoff must not query flat table " + table + ".");
  });
  return { client: { rpc, from } as unknown as SupabaseClient, rpc, from };
}

function myFoodQuery(result: { data: unknown; error: null | { message: string } }) {
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => result);
  return q;
}

function myFoodClient(row: Record<string, unknown>) {
  const query = myFoodQuery({ data: row, error: null });
  const from = vi.fn((table: string) => {
    if (table !== "user_food_items") throw new Error("Unexpected My Food table " + table + ".");
    return query;
  });
  return { client: { from } as unknown as SupabaseClient, from, query };
}

function catalogInput(overrides: Partial<CatalogHandoffInput> = {}): CatalogHandoffInput {
  return {
    foodId: REQUESTED_FOOD_ID,
    source: "catalog",
    quantity: 1,
    serving: "170 g",
    selectedName: "Generation yogurt",
    languageTag: "en",
    ...overrides,
  };
}

describe("Nutrition V1 Food handoff current-generation authority", () => {
  it("uses only current G2 selected facts and ignores newer unselected facts", async () => {
    const store = makeGenerationStore();
    const db = catalogClient(noOverride(REQUESTED_FOOD_ID));

    const handoff = await resolveWithDependencies(db.client, USER_ID, catalogInput(), { generationStore: store });

    expect(handoff).toMatchObject({
      foodId: REQUESTED_FOOD_ID,
      name: "Generation yogurt",
      serving: "170 g",
      frozenNutrition: {
        calories: 170,
        protein_g: null,
        carbs_g: 13.6,
        fat_g: 3.4,
        fiber_g: null,
      },
    });
    expect(store.readGeneration).toHaveBeenCalledWith(GENERATION_G2);
    expect(store.readGeneration).not.toHaveBeenCalledWith(GENERATION_G1);
    expect(store.readNutritionRevision).toHaveBeenCalledWith(REQUESTED_FOOD_ID, NUTRITION_SELECTED_ID);
    expect(store.readNutritionRevision).not.toHaveBeenCalledWith(REQUESTED_FOOD_ID, NUTRITION_NEWER_ID);
    expect(store.readNames).toHaveBeenCalledWith(REQUESTED_FOOD_ID, [NAME_SELECTED_ID]);
    expect(store.readServingOptions).toHaveBeenCalledWith(REQUESTED_FOOD_ID, [SERVING_SELECTED_ID]);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("rejects when there is no current generation and never falls back to flat food_items", async () => {
    const store = makeGenerationStore({ current: false });
    const db = catalogClient();

    await expect(resolveWithDependencies(db.client, USER_ID, catalogInput(), { generationStore: store }))
      .rejects.toThrow(/no current promoted generation/i);

    expect(db.from).not.toHaveBeenCalled();
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("resolves a generation redirect to the survivor before owner override lookup and snapshots", async () => {
    const store = makeGenerationStore({ redirected: true });
    const db = catalogClient(noOverride(SURVIVOR_FOOD_ID));

    const handoff = await resolveWithDependencies(db.client, USER_ID, catalogInput(), { generationStore: store });

    expect(handoff.foodId).toBe(SURVIVOR_FOOD_ID);
    expect(handoff.savedMealItem.food_id).toBe(SURVIVOR_FOOD_ID);
    expect(handoff.recipeIngredient.food_id).toBe(SURVIVOR_FOOD_ID);
    expect(db.rpc).toHaveBeenCalledWith("food_catalog_get_current_personal_override_v1", {
      p_food_id: SURVIVOR_FOOD_ID,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it.each(["deprecated", "withdrawn"] as const)(
    "rejects generation-selected %s Food before reading Personal Override",
    async (lifecycle) => {
      const store = makeGenerationStore({ lifecycle });
      const db = catalogClient();

      await expect(resolveWithDependencies(db.client, USER_ID, catalogInput(), { generationStore: store }))
        .rejects.toThrow(/only active current-generation foods/i);

      expect(db.rpc).not.toHaveBeenCalled();
      expect(db.from).not.toHaveBeenCalled();
    },
  );

  it("requires exactly one selected Name fact matching selectedName and languageTag", async () => {
    const noMatchStore = makeGenerationStore();
    const noMatchDb = catalogClient();
    await expect(resolveWithDependencies(
      noMatchDb.client,
      USER_ID,
      catalogInput({ selectedName: "Flat compatibility name" }),
      { generationStore: noMatchStore },
    )).rejects.toThrow(/name/i);
    expect(noMatchDb.from).not.toHaveBeenCalled();

    const ambiguousStore = makeGenerationStore({
      nameFactIds: [NAME_SELECTED_ID, NAME_ALT_ID],
      names: [
        selectedName,
        { ...altSelectedName, text: "Generation yogurt", normalizedText: "generation yogurt", languageTag: "en" },
      ],
    });
    const ambiguousDb = catalogClient();
    await expect(resolveWithDependencies(
      ambiguousDb.client,
      USER_ID,
      catalogInput(),
      { generationStore: ambiguousStore },
    )).rejects.toThrow(/name/i);
    expect(ambiguousDb.from).not.toHaveBeenCalled();

    const languageDb = catalogClient();
    await expect(resolveWithDependencies(
      languageDb.client,
      USER_ID,
      catalogInput({ languageTag: "ar" }),
      { generationStore: makeGenerationStore() },
    )).rejects.toThrow(/name/i);
  });

  it("requires exactly one selected Serving and never fabricates nutrition basis into serving authority", async () => {
    const unselectedDb = catalogClient();
    await expect(resolveWithDependencies(
      unselectedDb.client,
      USER_ID,
      catalogInput({ serving: "200 g" }),
      { generationStore: makeGenerationStore() },
    )).rejects.toThrow(/serving/i);

    const ambiguousDb = catalogClient();
    await expect(resolveWithDependencies(
      ambiguousDb.client,
      USER_ID,
      catalogInput(),
      {
        generationStore: makeGenerationStore({
          servingOptionIds: [SERVING_SELECTED_ID, SERVING_ALT_ID],
          servings: [selectedServing, { ...altSelectedServing, label: "170 g", amount: 170 }],
        }),
      },
    )).rejects.toThrow(/serving/i);

    const basisOnlyDb = catalogClient();
    await expect(resolveWithDependencies(
      basisOnlyDb.client,
      USER_ID,
      catalogInput({ serving: "100 g" }),
      { generationStore: makeGenerationStore({ servingOptionIds: [], servings: [] }) },
    )).rejects.toThrow(/serving/i);

    expect(unselectedDb.from).not.toHaveBeenCalled();
    expect(ambiguousDb.from).not.toHaveBeenCalled();
    expect(basisOnlyDb.from).not.toHaveBeenCalled();
  });

  it("applies the exact active owner revision after canonical resolution, preserving zero and JSON null semantics", async () => {
    const revisionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const db = catalogClient({
      foodId: REQUESTED_FOOD_ID,
      hasOverride: true,
      revisionId,
      pointerRevision: 4,
      isDeleted: false,
      nutritionOverride: {
        calories: 0,
        protein_g: 12,
        carbs_g: null,
      },
      servingLabel: null,
      note: "mine",
    });

    const handoff = await resolveWithDependencies(
      db.client,
      USER_ID,
      catalogInput({ quantity: 2 }),
      { generationStore: makeGenerationStore() },
    );

    expect(handoff.frozenNutrition).toMatchObject({
      calories: 0,
      protein_g: 40.8,
      carbs_g: 27.2,
      fat_g: 6.8,
      fiber_g: null,
    });
    expect(db.from).not.toHaveBeenCalled();
  });

  it("uses an active owner serving label without inventing a generation serving row", async () => {
    const db = catalogClient({
      foodId: REQUESTED_FOOD_ID,
      hasOverride: true,
      revisionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      pointerRevision: 2,
      isDeleted: false,
      nutritionOverride: null,
      servingLabel: "My bowl",
      note: null,
    });

    const handoff = await resolveWithDependencies(
      db.client,
      USER_ID,
      catalogInput({ serving: "My bowl" }),
      { generationStore: makeGenerationStore({ servingOptionIds: [], servings: [] }) },
    );

    expect(handoff.serving).toBe("My bowl");
    expect(handoff.frozenNutrition.calories).toBe(100);
    expect(db.from).not.toHaveBeenCalled();
  });

  it("treats a tombstoned owner override as absent and fails closed on owner-read errors", async () => {
    const tombstoneDb = catalogClient({
      foodId: REQUESTED_FOOD_ID,
      hasOverride: true,
      revisionId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      pointerRevision: 3,
      isDeleted: true,
      nutritionOverride: { calories: 999 },
      servingLabel: "Wrong owner serving",
      note: null,
    });

    const handoff = await resolveWithDependencies(
      tombstoneDb.client,
      USER_ID,
      catalogInput(),
      { generationStore: makeGenerationStore() },
    );
    expect(handoff.serving).toBe("170 g");
    expect(handoff.frozenNutrition.calories).toBe(170);

    const db = catalogClient();
    db.rpc.mockResolvedValueOnce({ data: null, error: { message: "pointer integrity violation" } });
    await expect(resolveWithDependencies(db.client, USER_ID, catalogInput(), { generationStore: makeGenerationStore() }))
      .rejects.toThrow(/personal override/i);
  });

  it("keeps My Food owner-scoped and generation-independent", async () => {
    const db = myFoodClient({
      id: REQUESTED_FOOD_ID,
      user_id: USER_ID,
      food_name: "My oats",
      serving_size: "40 g",
      calories: 150,
      protein_g: null,
      carbs_g: 25,
      fat_g: 3,
      nutrition_basis_amount: 40,
      nutrition_basis_unit: "g",
      deleted_at: null,
    });
    const store = makeGenerationStore();

    const handoff = await resolveWithDependencies(
      db.client,
      USER_ID,
      {
        foodId: REQUESTED_FOOD_ID,
        source: "my_food",
        quantity: 1,
        serving: "40 g",
      },
      { generationStore: store },
    );

    expect(handoff.name).toBe("My oats");
    expect(store.readCurrentPointer).not.toHaveBeenCalled();
    expect(db.query.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(db.query.is).toHaveBeenCalledWith("deleted_at", null);
  });
});
