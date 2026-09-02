import { describe, expect, it } from "vitest";
import type {
  FoodCatalogRootRecord,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
} from "./contracts";
import {
  projectFoodCatalogCompatibility,
  type FoodCatalogCompatibilitySelection,
} from "./compatibility-projection";

const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_FOOD_ID = "22222222-2222-4222-8222-222222222222";
const SOURCE_ID = "33333333-3333-4333-8333-333333333333";

const root: FoodCatalogRootRecord = {
  id: FOOD_ID,
  lifecycleStatus: "active",
  mergedIntoFoodId: null,
};

const name: StoredFoodNameFact = {
  id: "44444444-4444-4444-8444-444444444444",
  createdAt: "2026-09-01T00:00:00.000Z",
  foodId: FOOD_ID,
  languageTag: "en",
  role: "preferred_display",
  text: "Test Food",
  normalizedText: "test food",
  scriptCode: "Latn",
  origin: "curated",
  sourceRecordId: null,
  policyVersion: "name-v1",
};

function nutrition(
  basisUnit: "g" | "ml",
  overrides: Partial<StoredFoodNutritionRevision> = {},
): StoredFoodNutritionRevision {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    createdAt: "2026-09-01T00:00:00.000Z",
    foodId: FOOD_ID,
    revisionNumber: 1,
    calories: 0,
    protein_g: 10,
    carbs_g: null,
    fat_g: 2,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    basisAmount: 100,
    basisUnit,
    nutrientMappingVersion: "map-v1",
    sourceRecordId: SOURCE_ID,
    ...overrides,
  };
}

function serving(
  unitCode: string,
  amount: number,
  overrides: Partial<StoredFoodServingOption> = {},
): StoredFoodServingOption {
  return {
    id: "66666666-6666-4666-8666-666666666666",
    createdAt: "2026-09-01T00:00:00.000Z",
    foodId: FOOD_ID,
    label: `${amount} ${unitCode}`,
    amount,
    unitCode,
    gramWeight: null,
    sourceRecordId: null,
    sourcePortionCode: null,
    evidenceClass: "exact_source",
    sourcePrimary: false,
    ...overrides,
  };
}

function selection(
  selectedNutrition: StoredFoodNutritionRevision,
  selectedServing: StoredFoodServingOption | null,
  overrides: Partial<FoodCatalogCompatibilitySelection> = {},
): FoodCatalogCompatibilitySelection {
  return {
    root,
    selectedName: name,
    selectedNutrition,
    selectedServing,
    trust: { verified: false },
    ...overrides,
  };
}

describe("Food Catalog V2 explicit compatibility projection", () => {
  it("preserves explicit zero and unknown null for an explicit 100 g nutrition selection", () => {
    const result = projectFoodCatalogCompatibility(selection(
      nutrition("g", { protein_g: null }),
      null,
      { trust: { verified: true } },
    ));

    expect(result).toEqual({
      id: FOOD_ID,
      name: "Test Food",
      servingLabel: "100 g",
      nutrition: {
        calories: 0,
        protein_g: null,
        carbs_g: null,
        fat_g: 2,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: 100,
        basis_unit: "g",
      },
      verified: true,
    });
  });

  it("scales g-based nutrition by a source-backed exact-Food household gram weight", () => {
    const cup = serving("cup", 1, {
      label: "1 cup",
      gramWeight: 240,
      sourceRecordId: SOURCE_ID,
      sourcePortionCode: "cup",
    });

    const result = projectFoodCatalogCompatibility(selection(nutrition("g"), cup));

    expect(result.servingLabel).toBe("1 cup");
    expect(result.nutrition.protein_g).toBe(24);
    expect(result.nutrition.calories).toBe(0);
    expect(result.nutrition.carbs_g).toBeNull();
    expect(result.nutrition.basis_amount).toBe(1);
    expect(result.nutrition.basis_unit).toBe("serving");
  });

  it("rejects g-based nutrition with an ml serving because density authority is absent", () => {
    expect(() => projectFoodCatalogCompatibility(selection(
      nutrition("g"),
      serving("ml", 250, { label: "250 ml" }),
    ))).toThrow(/density/i);
  });

  it("scales ml-based nutrition by an explicit ml serving volume", () => {
    const result = projectFoodCatalogCompatibility(selection(
      nutrition("ml", { protein_g: 4 }),
      serving("ml", 250, { label: "250 ml" }),
    ));

    expect(result.nutrition.protein_g).toBe(10);
    expect(result.nutrition.fat_g).toBe(5);
    expect(result.nutrition.basis_amount).toBe(250);
    expect(result.nutrition.basis_unit).toBe("ml");
  });

  it.each([
    serving("g", 50, { label: "50 g" }),
    serving("cup", 1, {
      label: "1 cup",
      gramWeight: 240,
      sourceRecordId: SOURCE_ID,
      sourcePortionCode: "cup",
    }),
  ])("rejects ml-based nutrition with non-ml serving conversion", (selectedServing) => {
    expect(() => projectFoodCatalogCompatibility(selection(
      nutrition("ml"),
      selectedServing,
    ))).toThrow(/density|mass/i);
  });

  it("requires source-backed evidence for household gram-weight scaling", () => {
    const cup = serving("cup", 1, {
      label: "1 cup",
      gramWeight: 240,
      sourceRecordId: null,
    });

    expect(() => projectFoodCatalogCompatibility(selection(nutrition("g"), cup))).toThrow(/source/i);
  });

  it.each(["name", "nutrition", "serving"] as const)(
    "rejects a selected %s fact belonging to another Food",
    (kind) => {
      const selectedName = kind === "name" ? { ...name, foodId: OTHER_FOOD_ID } : name;
      const selectedNutrition = kind === "nutrition"
        ? nutrition("g", { foodId: OTHER_FOOD_ID })
        : nutrition("g");
      const selectedServing = kind === "serving"
        ? serving("g", 100, { foodId: OTHER_FOOD_ID })
        : serving("g", 100);

      expect(() => projectFoodCatalogCompatibility({
        root,
        selectedName,
        selectedNutrition,
        selectedServing,
        trust: { verified: false },
      })).toThrow(/same Food|food ID|identity/i);
    },
  );
});
