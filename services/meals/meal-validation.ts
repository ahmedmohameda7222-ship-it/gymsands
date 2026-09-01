import type { MealPlanItem } from "@/types";

export type MealValidationBadge = {
  label: "Looks valid" | "Needs review" | "Missing macros" | "Far from target" | "Very low calories";
  tone: "success" | "warning" | "destructive";
  detail: string;
};

function finiteKnown(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(value) ? value : null;
}

export function validateMealItem(item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g" | "quantity">): MealValidationBadge {
  const calories = finiteKnown(item.calories);
  const quantity = finiteKnown(item.quantity);
  if (calories === null) {
    return { label: "Needs review", tone: "warning", detail: "Calories are unknown. Review this meal before relying on its nutrition." };
  }
  if (calories <= 0 || quantity === null || quantity <= 0) {
    return { label: "Needs review", tone: "destructive", detail: "Calories or quantity are missing or zero." };
  }

  const protein = finiteKnown(item.protein_g);
  const carbs = finiteKnown(item.carbs_g);
  const fat = finiteKnown(item.fat_g);
  if (protein === null || carbs === null || fat === null || protein + carbs + fat === 0) {
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

  let total = 0;
  for (const item of items) {
    const calories = finiteKnown(item.calories);
    if (calories === null) {
      return {
        label: "Needs review",
        tone: "warning",
        detail: "One or more planned items have unknown calories. Whole-day calorie comparisons are unavailable until they are known."
      };
    }
    total += calories;
  }

  if (total > 0 && total < 800) return { label: "Very low calories", tone: "destructive", detail: `The full planned day totals ${Math.round(total)} kcal. Review before relying on it.` };
  if (targetCalories && Math.abs(total - targetCalories) > targetCalories * 0.3) {
    return { label: "Far from target", tone: "warning", detail: `The planned day is ${Math.round(total)} kcal versus the ${Math.round(targetCalories)} kcal target.` };
  }
  return null;
}
