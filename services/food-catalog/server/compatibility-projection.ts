import "server-only";

import type {
  CatalogFoodNutrition,
  FoodCatalogRootRecord,
  ResolvedCatalogFood,
  StoredFoodNameFact,
  StoredFoodNutritionRevision,
  StoredFoodServingOption,
} from "./contracts";

export type FoodCatalogCompatibilitySelection = {
  root: FoodCatalogRootRecord;
  selectedName: StoredFoodNameFact;
  selectedNutrition: StoredFoodNutritionRevision;
  selectedServing: StoredFoodServingOption | null;
  trust: { verified: boolean };
};

type ProjectionBasis = {
  factor: number;
  servingLabel: string;
  basisAmount: number;
  basisUnit: CatalogFoodNutrition["basis_unit"];
};

const NUTRIENT_KEYS = [
  "calories",
  "protein_g",
  "carbs_g",
  "fat_g",
  "saturated_fat_g",
  "fiber_g",
  "sugars_g",
  "sodium_mg",
] as const satisfies readonly (keyof CatalogFoodNutrition)[];

function assertSameFood(input: FoodCatalogCompatibilitySelection): void {
  const expectedFoodId = input.root.id;
  if (
    input.selectedName.foodId !== expectedFoodId
    || input.selectedNutrition.foodId !== expectedFoodId
    || (input.selectedServing !== null && input.selectedServing.foodId !== expectedFoodId)
  ) {
    throw new Error("Food Catalog compatibility selections must belong to the same Food identity.");
  }
}

function resolveProjectionBasis(input: FoodCatalogCompatibilitySelection): ProjectionBasis {
  const nutrition = input.selectedNutrition;
  const serving = input.selectedServing;

  if (serving === null) {
    return {
      factor: 1,
      servingLabel: `${nutrition.basisAmount} ${nutrition.basisUnit}`,
      basisAmount: nutrition.basisAmount,
      basisUnit: nutrition.basisUnit,
    };
  }

  if (nutrition.basisUnit === "ml") {
    if (serving.unitCode !== "ml") {
      throw new Error(
        "Food Catalog compatibility cannot convert ml nutrition to mass or household servings without density authority.",
      );
    }
    return {
      factor: serving.amount / nutrition.basisAmount,
      servingLabel: serving.label,
      basisAmount: serving.amount,
      basisUnit: "ml",
    };
  }

  if (serving.unitCode === "ml") {
    throw new Error(
      "Food Catalog compatibility cannot convert g nutrition to ml servings without density authority.",
    );
  }

  if (serving.unitCode === "g") {
    return {
      factor: serving.amount / nutrition.basisAmount,
      servingLabel: serving.label,
      basisAmount: serving.amount,
      basisUnit: "g",
    };
  }

  if (
    serving.gramWeight === null
    || serving.sourceRecordId === null
    || !serving.sourceRecordId.trim()
  ) {
    throw new Error(
      "Food Catalog compatibility household serving conversion requires source-backed gram-weight evidence.",
    );
  }

  return {
    factor: serving.gramWeight / nutrition.basisAmount,
    servingLabel: serving.label,
    basisAmount: 1,
    basisUnit: "serving",
  };
}

function scaleKnown(value: number | null, factor: number): number | null {
  if (value === null) return null;
  return Math.round(value * factor * 1000) / 1000;
}

export function projectFoodCatalogCompatibility(
  input: FoodCatalogCompatibilitySelection,
): ResolvedCatalogFood {
  assertSameFood(input);
  const basis = resolveProjectionBasis(input);

  const nutrition = {} as CatalogFoodNutrition;
  for (const key of NUTRIENT_KEYS) {
    nutrition[key] = scaleKnown(input.selectedNutrition[key], basis.factor);
  }
  nutrition.basis_amount = basis.basisAmount;
  nutrition.basis_unit = basis.basisUnit;

  return {
    id: input.root.id,
    name: input.selectedName.text,
    servingLabel: basis.servingLabel,
    nutrition,
    verified: input.trust.verified,
  };
}
