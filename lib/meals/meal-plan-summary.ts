import { sumFoodLogs } from "@/services/nutrition/calculations";
import type { MealPlanItem, MealPlanItemStatus, MealType } from "@/types";

export type MealMacroTotals = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
};
export type MealPlanCounts = Record<MealPlanItemStatus, number>;
export type MealPlanSummary = {
  scheduled: MealMacroTotals;
  consumed: MealMacroTotals;
  skipped: MealMacroTotals;
  counts: MealPlanCounts;
  remainingCalories: number | null;
  overTargetCalories: number | null;
  alignmentPercent: number | null;
};

export function addMealTotals(
  total: MealMacroTotals,
  item: Pick<MealPlanItem, "calories" | "protein_g" | "carbs_g" | "fat_g">,
): MealMacroTotals {
  return sumFoodLogs([total, item]);
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

export function totalsForItems(items: MealPlanItem[]): MealMacroTotals {
  return sumFoodLogs(items);
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
  const remainingCalories =
    target === null || consumed.calories === null ? null : target - consumed.calories;
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
      remainingCalories === null ? null : remainingCalories < 0 ? Math.abs(remainingCalories) : 0,
    alignmentPercent:
      target === null || scheduled.calories === null
        ? null
        : Math.round((scheduled.calories / target) * 1000) / 10,
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
