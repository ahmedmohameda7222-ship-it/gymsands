import type { MealPlanItem } from "@/types";

export type MealValidationBadge = {
  label: "Looks valid" | "Needs review" | "Missing macros" | "Far from target" | "Very low calories";
  tone: "success" | "warning" | "destructive";
  detail: string;
};

export function validateMealItem(item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g" | "quantity">): MealValidationBadge {
  const calories = Number(item.calories);
  const protein = Number(item.protein_g);
  const carbs = Number(item.carbs_g);
  const fat = Number(item.fat_g);
  const quantity = Number(item.quantity);
  if (!Number.isFinite(calories) || calories <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
    return { label: "Needs review", tone: "destructive", detail: "Calories or quantity are missing or zero." };
  }
  if (![protein, carbs, fat].every(Number.isFinite) || protein + carbs + fat === 0) {
    return { label: "Missing macros", tone: "warning", detail: "Add protein, carbs, and fat before relying on this meal." };
  }
  const macroCalories = protein * 4 + carbs * 4 + fat * 9;
  const difference = Math.abs(macroCalories - calories);
  if (difference > Math.max(100, calories * 0.35)) {
    return { label: "Needs review", tone: "warning", detail: `Macro energy is about ${Math.round(macroCalories)} kcal versus ${Math.round(calories)} kcal saved.` };
  }
  return { label: "Looks valid", tone: "success", detail: "Saved calories and macro energy are reasonably aligned." };
}

export function validateMealPlanDay(items: Array<Pick<MealPlanItem, "calories">>, targetCalories?: number | null): MealValidationBadge | null {
  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + Number(item.calories || 0), 0);
  if (total > 0 && total < 800) return { label: "Very low calories", tone: "destructive", detail: `The full planned day totals ${Math.round(total)} kcal. Review before relying on it.` };
  if (targetCalories && Math.abs(total - targetCalories) > targetCalories * 0.3) {
    return { label: "Far from target", tone: "warning", detail: `The planned day is ${Math.round(total)} kcal versus the ${Math.round(targetCalories)} kcal target.` };
  }
  return null;
}
