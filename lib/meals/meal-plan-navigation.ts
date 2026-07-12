export const MEAL_PLAN_TABS = ["day", "week", "shopping"] as const;
export type MealPlanTab = (typeof MEAL_PLAN_TABS)[number];

export function resolveMealPlanTab(value: string | null | undefined): MealPlanTab {
  return MEAL_PLAN_TABS.includes(value as MealPlanTab) ? (value as MealPlanTab) : "day";
}

export function mealPlanUrl(pathname: string, tab: MealPlanTab, date: string) {
  const params = new URLSearchParams({ tab, date });
  return `${pathname}?${params.toString()}`;
}
