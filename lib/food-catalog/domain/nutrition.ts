export type FoodNutritionRevision = {
  foodId: string;
  revisionNumber: number;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basisAmount: number;
  basisUnit: "g" | "ml";
  nutrientMappingVersion: string;
  sourceRecordId: string | null;
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
] as const;

export function validateFoodNutritionRevision(value: FoodNutritionRevision): FoodNutritionRevision {
  if (!Number.isInteger(value.revisionNumber) || value.revisionNumber <= 0) {
    throw new Error("Food nutrition revision number must be a positive integer.");
  }
  if (!Number.isFinite(value.basisAmount) || value.basisAmount <= 0) {
    throw new Error("Food nutrition basis amount must be finite and positive.");
  }
  if (value.basisUnit !== "g" && value.basisUnit !== "ml") {
    throw new Error("Food nutrition basis unit must be g or ml.");
  }
  if (!value.nutrientMappingVersion.trim()) {
    throw new Error("Food nutrition mapping version must be nonblank.");
  }

  for (const key of NUTRIENT_KEYS) {
    const nutrient = value[key];
    if (nutrient === null) continue;
    if (!Number.isFinite(nutrient)) {
      throw new Error(`Food nutrition ${key} must be finite when known.`);
    }
    if (nutrient < 0) {
      throw new Error(`Food nutrition ${key} must be non-negative when known.`);
    }
  }

  return value;
}
