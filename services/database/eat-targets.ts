"use client";

import { addIsoDays, startOfEatWeek, type EatWeekTargetDay } from "@/lib/eat/eat-model";
import { getCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { migrateLegacyNutritionTargetOverridesForDates } from "@/services/database/nutrition-target-assignments";
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

export async function getEatTargetsForDates(userId: string, dates: string[]): Promise<Record<string, ActiveNutritionTarget>> {
  const uniqueDates = [...new Set(dates)];
  if (!uniqueDates.length) return {};
  const [sources, overrides] = await Promise.all([
    loadTargetSources(userId),
    migrateLegacyNutritionTargetOverridesForDates(userId, uniqueDates)
  ]);
  const byDate = new Map(overrides.map((override) => [override.target_date, override.target_type]));
  return Object.fromEntries(uniqueDates.map((date) => [
    date,
    resolveEatTargetForDate({ date, ...sources, override: byDate.get(date) ?? "auto" })
  ]));
}

export async function getEatTargetForDate(userId: string, date: string): Promise<ActiveNutritionTarget> {
  const targets = await getEatTargetsForDates(userId, [date]);
  const target = targets[date];
  if (!target) throw new Error("Nutrition target could not be resolved.");
  return target;
}

export async function getEatTargetAssignmentForDate(userId: string, date: string): Promise<NutritionTargetAssignment> {
  const overrides = await migrateLegacyNutritionTargetOverridesForDates(userId, [date]);
  return overrides.find((row) => row.target_date === date)?.target_type ?? "auto";
}

export async function getEatWeekTargets(userId: string, selectedDate: string): Promise<EatWeekTargetDay[]> {
  const weekStart = startOfEatWeek(selectedDate);
  const dates = Array.from({ length: 7 }, (_, index) => addIsoDays(weekStart, index));
  const targets = await getEatTargetsForDates(userId, dates);
  return dates.map((date) => {
    const active = targets[date];
    const plannedCalories = number(active?.values.daily_calories);
    return {
      date,
      planned_calories: active?.hasTarget && plannedCalories > 0 ? plannedCalories : 0,
      has_targets: Boolean(active?.hasTarget && plannedCalories > 0)
    };
  });
}
