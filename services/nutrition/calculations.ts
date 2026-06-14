import type { FoodItem, FoodLog } from "@/types";

export type MacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export type MacroTargets = MacroTotals & {
  water_ml: number;
};

export function scaleFoodMacros(food: Pick<FoodItem, "calories" | "protein_g" | "carbs_g" | "fat_g">, quantity: number) {
  const safeQuantity = Math.max(0, quantity);
  return {
    calories: Math.round(toNumber(food.calories) * safeQuantity),
    protein_g: roundMacro(toNumber(food.protein_g) * safeQuantity),
    carbs_g: roundMacro(toNumber(food.carbs_g) * safeQuantity),
    fat_g: roundMacro(toNumber(food.fat_g) * safeQuantity)
  };
}

export function sumFoodLogs(logs: Pick<FoodLog, "calories" | "protein_g" | "carbs_g" | "fat_g">[]): MacroTotals {
  return logs.reduce(
    (total, log) => ({
      calories: total.calories + toNumber(log.calories),
      protein_g: roundMacro(total.protein_g + toNumber(log.protein_g)),
      carbs_g: roundMacro(total.carbs_g + toNumber(log.carbs_g)),
      fat_g: roundMacro(total.fat_g + toNumber(log.fat_g))
    }),
    { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
  );
}

export function remainingMacros(targets: MacroTargets, totals: MacroTotals) {
  return {
    calories: Math.max(0, targets.calories - totals.calories),
    protein_g: Math.max(0, roundMacro(targets.protein_g - totals.protein_g)),
    carbs_g: Math.max(0, roundMacro(targets.carbs_g - totals.carbs_g)),
    fat_g: Math.max(0, roundMacro(targets.fat_g - totals.fat_g))
  };
}

export function percent(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.round((value / target) * 100));
}

export function validateFoodLogInput(name: string, quantity: number, macros: MacroTotals) {
  if (!name.trim()) return "Meal name cannot be empty.";
  if (quantity <= 0) return "Quantity must be greater than zero.";
  if (macros.calories < 0 || macros.protein_g < 0 || macros.carbs_g < 0 || macros.fat_g < 0) {
    return "Calories and macros cannot be negative.";
  }
  return null;
}

function roundMacro(value: number) {
  return Math.round(value * 10) / 10;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
