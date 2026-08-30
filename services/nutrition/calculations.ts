import type { CoreNutrition, NullableCoreNutrition } from "@/types";

export type MacroTotals = CoreNutrition;
export type NullableMacroTotals = NullableCoreNutrition;

export type MacroTargets = MacroTotals & {
  water_ml: number;
};

type NullableNutritionInput = {
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
};

export function scaleFoodMacros(food: CoreNutrition, quantity: number): MacroTotals;
export function scaleFoodMacros(food: NullableNutritionInput, quantity: number): NullableMacroTotals;
export function scaleFoodMacros(food: NullableNutritionInput, quantity: number): NullableMacroTotals {
  const safeQuantity = Math.max(0, quantity);
  return {
    calories: scaleNullableNutrition(food.calories, safeQuantity, "Calories", Math.round),
    protein_g: scaleNullableNutrition(food.protein_g, safeQuantity, "Protein", roundMacro),
    carbs_g: scaleNullableNutrition(food.carbs_g, safeQuantity, "Carbs", roundMacro),
    fat_g: scaleNullableNutrition(food.fat_g, safeQuantity, "Fat", roundMacro)
  };
}

export function sumFoodLogs(logs: NullableNutritionInput[]): NullableMacroTotals {
  return {
    calories: sumNullableNutrition(logs.map((log) => log.calories), "Calories", Math.round),
    protein_g: sumNullableNutrition(logs.map((log) => log.protein_g), "Protein", roundMacro),
    carbs_g: sumNullableNutrition(logs.map((log) => log.carbs_g), "Carbs", roundMacro),
    fat_g: sumNullableNutrition(logs.map((log) => log.fat_g), "Fat", roundMacro)
  };
}

export function remainingMacros(targets: MacroTargets, totals: NullableMacroTotals): NullableMacroTotals {
  return {
    calories: remainingNullable(targets.calories, totals.calories, Math.round),
    protein_g: remainingNullable(targets.protein_g, totals.protein_g, roundMacro),
    carbs_g: remainingNullable(targets.carbs_g, totals.carbs_g, roundMacro),
    fat_g: remainingNullable(targets.fat_g, totals.fat_g, roundMacro)
  };
}

export function percent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

export function nullablePercent(value: number | null, target: number) {
  if (value === null) return null;
  return target > 0 ? Math.round((value / target) * 100) : null;
}

export function validateFoodLogInput(name: string, quantity: number, macros: MacroTotals) {
  if (!name.trim()) return "Meal name cannot be empty.";
  if (quantity <= 0) return "Quantity must be greater than zero.";
  if (macros.calories < 0 || macros.protein_g < 0 || macros.carbs_g < 0 || macros.fat_g < 0) {
    return "Calories and macros cannot be negative.";
  }
  return null;
}

function scaleNullableNutrition(
  value: number | null | undefined,
  quantity: number,
  label: string,
  round: (value: number) => number
) {
  const parsed = nullableNutritionNumber(value, label);
  return parsed === null ? null : round(parsed * quantity);
}

function sumNullableNutrition(
  values: Array<number | null | undefined>,
  label: string,
  round: (value: number) => number
) {
  if (!values.length) return 0;
  const parsed = values.map((value) => nullableNutritionNumber(value, label));
  if (parsed.some((value) => value === null)) return null;
  return round(parsed.reduce((sum, value) => sum + (value as number), 0));
}

function remainingNullable(target: number, actual: number | null, round: (value: number) => number) {
  return actual === null ? null : Math.max(0, round(target - actual));
}

function nullableNutritionNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative number or unknown.`);
  }
  return parsed;
}

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}
