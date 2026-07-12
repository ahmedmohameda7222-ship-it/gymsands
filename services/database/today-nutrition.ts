"use client";

import { resolveTodayNutritionSources, type TodayNutritionData, type TodayNutritionTargetData } from "@/lib/dashboard/today-nutrition";
import { getEatTargetForDate } from "@/services/database/eat-targets";
import { ACTIVE_NUTRITION_TARGET_EVENT } from "@/services/database/nutrition-target-assignments";
import { getTodayFoodLogs } from "@/services/database/nutrition";
import type { ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { FoodLog } from "@/types";

export type TodayNutritionDependencies = {
  loadLogs: (userId: string, date: string) => Promise<FoodLog[]>;
  loadTargetData: (userId: string, date: string) => Promise<TodayNutritionTargetData>;
};

export function todayTargetData(activeTarget: ActiveNutritionTarget): TodayNutritionTargetData {
  return {
    targets: activeTarget.hasTarget ? activeTarget.values : null,
    activeTarget
  };
}

export async function getTodayNutritionTargetData(userId: string, date: string): Promise<TodayNutritionTargetData> {
  return todayTargetData(await getEatTargetForDate(userId, date));
}

const defaultDependencies: TodayNutritionDependencies = {
  loadLogs: (userId, date) => getTodayFoodLogs(userId, date, { throwOnError: true }),
  loadTargetData: getTodayNutritionTargetData
};

export async function getTodayNutritionData(
  userId: string,
  date: string,
  dependencies: TodayNutritionDependencies = defaultDependencies
): Promise<TodayNutritionData> {
  const [logsResult, targetResult] = await Promise.allSettled([
    dependencies.loadLogs(userId, date),
    dependencies.loadTargetData(userId, date)
  ]);
  return resolveTodayNutritionSources(logsResult, targetResult);
}

export function shouldRefreshTodayNutritionTarget(eventDate: unknown, today: string) {
  return typeof eventDate !== "string" || !eventDate || eventDate === today;
}

export function subscribeToTodayNutritionTargetChanges(
  target: Pick<EventTarget, "addEventListener" | "removeEventListener">,
  today: string,
  onRefresh: () => void
) {
  const listener = (event: Event) => {
    const eventDate = (event as CustomEvent<{ date?: string }>).detail?.date;
    if (shouldRefreshTodayNutritionTarget(eventDate, today)) onRefresh();
  };
  target.addEventListener(ACTIVE_NUTRITION_TARGET_EVENT, listener);
  return () => target.removeEventListener(ACTIVE_NUTRITION_TARGET_EVENT, listener);
}
