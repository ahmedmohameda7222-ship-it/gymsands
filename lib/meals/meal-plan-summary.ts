import type { MealPlanItem, MealPlanItemStatus, MealType } from "@/types";

export type MealMacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};
export type MealPlanCounts = Record<MealPlanItemStatus, number>;
export type MealPlanSummary = {
  scheduled: MealMacroTotals;
  consumed: MealMacroTotals;
  skipped: MealMacroTotals;
  counts: MealPlanCounts;
  remainingCalories: number | null;
  overTargetCalories: number;
  alignmentPercent: number | null;
};

const zeroTotals = (): MealMacroTotals => ({
  calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
});

function finite(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid persisted meal value: ${field}.`);
  }
  return parsed;
}

export function addMealTotals(
  total: MealMacroTotals,
  item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">,
): MealMacroTotals {
  return {
    calories: total.calories + finite(item.calories, "calories"),
    protein_g: total.protein_g + finite(item.protein_g, "protein_g"),
    carbs_g: total.carbs_g + finite(item.carbs_g, "carbs_g"),
    fat_g: total.fat_g + finite(item.fat_g, "fat_g"),
  };
}

export function mealItemsForStatus(items: MealPlanItem[], status: MealPlanItemStatus) {
  return items.filter((item) => item.status === status);
}

export function activeScheduledItems(items: MealPlanItem[]) {
  return items.filter((item) => item.status === "planned" || item.status === "done");
}

export function consumedItems(items: MealPlanItem[]) {
  return mealItemsForStatus(items, "done");
}

export function skippedItems(items: MealPlanItem[]) {
  return mealItemsForStatus(items, "skipped");
}

export function totalsForItems(items: MealPlanItem[]) {
  return items.reduce(addMealTotals, zeroTotals());
}

export function summarizeMealPlanDay(
  items: MealPlanItem[],
  effectiveTargetCalories: number | null,
): MealPlanSummary {
  const scheduled = totalsForItems(activeScheduledItems(items));
  const consumed = totalsForItems(consumedItems(items));
  const skipped = totalsForItems(skippedItems(items));
  const target =
    effectiveTargetCalories !== null &&
    Number.isFinite(effectiveTargetCalories) &&
    effectiveTargetCalories > 0
      ? effectiveTargetCalories
      : null;
  const remainingCalories = target === null ? null : target - consumed.calories;
  return {
    scheduled,
    consumed,
    skipped,
    counts: {
      planned: mealItemsForStatus(items, "planned").length,
      done: mealItemsForStatus(items, "done").length,
      skipped: mealItemsForStatus(items, "skipped").length,
    },
    remainingCalories,
    overTargetCalories:
      remainingCalories !== null && remainingCalories < 0 ? Math.abs(remainingCalories) : 0,
    alignmentPercent:
      target === null ? null : Math.round((scheduled.calories / target) * 1000) / 10,
  };
}

export function summarizeMealSection(items: MealPlanItem[], mealType: MealType) {
  const sectionItems = items.filter((item) => item.meal_type === mealType);
  return {
    items: sectionItems,
    activeCount: activeScheduledItems(sectionItems).length,
    totals: totalsForItems(activeScheduledItems(sectionItems)),
  };
}
