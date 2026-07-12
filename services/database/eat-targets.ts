"use client";

import { addIsoDays, startOfEatWeek, type EatWeekTargetDay } from "@/lib/eat/eat-model";
import { getCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import {
  getNutritionTargetDateOverride,
  getNutritionTargetDateOverrides,
  migrateLegacyNutritionTargetOverride
} from "@/services/database/nutrition-target-assignments";
import { resolveEatTargetForDate, type ActiveNutritionTarget } from "@/services/nutrition/active-target";
import type { NutritionTargetAssignment } from "@/types";

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function loadTargetSources(userId: string) {
  const [baseTarget, profiles, plan] = await Promise.all([
    getCalorieTargets(userId, { throwOnError: true }),
    getNutritionTargetProfiles(userId),
    getDefaultUserWorkoutPlan(userId)
  ]);
  return { baseTarget, profiles, plan };
}

export async function getEatTargetForDate(userId: string, date: string): Promise<ActiveNutritionTarget> {
  const sources = await loadTargetSources(userId);
  const migrated = await migrateLegacyNutritionTargetOverride(userId, date);
  const override = migrated ?? await getNutritionTargetDateOverride(userId, date);
  return resolveEatTargetForDate({
    date,
    ...sources,
    override: override?.target_type ?? "auto"
  });
}

export async function getEatTargetAssignmentForDate(userId: string, date: string): Promise<NutritionTargetAssignment> {
  const migrated = await migrateLegacyNutritionTargetOverride(userId, date);
  const override = migrated ?? await getNutritionTargetDateOverride(userId, date);
  return override?.target_type ?? "auto";
}

export async function getEatWeekTargets(userId: string, selectedDate: string): Promise<EatWeekTargetDay[]> {
  const weekStart = startOfEatWeek(selectedDate);
  const weekEnd = addIsoDays(weekStart, 6);
  const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index));
  const [sources, overrides] = await Promise.all([
    loadTargetSources(userId),
    getNutritionTargetDateOverrides(userId, weekStart, weekEnd)
  ]);
  const byDate = new Map(overrides.map((override) => [override.target_date, override.target_type]));
  return dates.map((date) => {
    const active = resolveEatTargetForDate({ date, ...sources, override: byDate.get(date) ?? "auto" });
    const plannedCalories = number(active.values.daily_calories);
    return {
      date,
      planned_calories: active.hasTarget && plannedCalories > 0 ? plannedCalories : 0,
      has_targets: active.hasTarget && plannedCalories > 0
    };
  });
}
