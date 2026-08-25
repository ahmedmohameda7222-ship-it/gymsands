"use client";

import { isIsoDate, todayIso } from "@/lib/date-utils";
import { addIsoDays, startOfEatWeek, type EatWeekTargetDay } from "@/lib/eat/eat-model";
import {
  buildLegacyCutoverTargetPeriod,
  normalizeNutritionTargetPeriod,
  resolveEffectiveNutritionTarget,
  targetPeriodInsertPayload,
  type NutritionTargetPeriod,
} from "@/lib/nutrition-v1/targets";
import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { getCalorieTargets } from "@/services/database/nutrition";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import { getDefaultUserWorkoutPlan } from "@/services/database/workout-plans";
import { migrateLegacyNutritionTargetOverridesForDates } from "@/services/database/nutrition-target-assignments";
import {
  activeNutritionTargetFromEffectiveTarget,
  canonicalValuesFromLegacyTarget,
  resolveEatTargetForDate,
  type ActiveNutritionTarget,
} from "@/services/nutrition/active-target";
import type { NutritionTargetAssignment } from "@/types";

const TARGET_COLUMNS = "id,effective_from,effective_to,calories,protein_g,carbs_g,fat_g,water_ml,source,source_evidence";

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

function validatedDates(inputDates: string[]) {
  const dates = [...new Set(inputDates)];
  if (dates.some((date) => !isIsoDate(date))) throw new Error("Nutrition target dates must use YYYY-MM-DD.");
  return dates.sort();
}

async function readTargetPeriods(userId: string, dates: string[]): Promise<NutritionTargetPeriod[]> {
  if (!supabase || !isUuid(userId) || !dates.length) return [];
  const sorted = validatedDates(dates);
  const start = sorted[0];
  const end = sorted[sorted.length - 1];
  const { data, error } = await supabase
    .from("nutrition_target_periods")
    .select(TARGET_COLUMNS)
    .eq("user_id", userId)
    .lte("effective_from", end)
    .or(`effective_to.is.null,effective_to.gt.${start}`)
    .order("effective_from", { ascending: true })
    .limit(64);
  if (error) throw new Error(`Could not load effective Nutrition targets. ${error.message}`);
  return (data ?? []).map((row) => normalizeNutritionTargetPeriod(row as Record<string, unknown>));
}

async function legacyTargetsForDates(userId: string, dates: string[]) {
  const [sources, overrides] = await Promise.all([
    loadTargetSources(userId),
    migrateLegacyNutritionTargetOverridesForDates(userId, dates),
  ]);
  const byDate = new Map(overrides.map((override) => [override.target_date, override.target_type]));
  return Object.fromEntries(dates.map((date) => [
    date,
    resolveEatTargetForDate({ date, ...sources, override: byDate.get(date) ?? "auto" }),
  ]));
}

async function ensureLegacyCutoverPeriod(userId: string, cutoverDate: string) {
  let periods = await readTargetPeriods(userId, [cutoverDate]);
  if (resolveEffectiveNutritionTarget(periods, cutoverDate).available) return periods;

  const [sources, overrides] = await Promise.all([
    loadTargetSources(userId),
    migrateLegacyNutritionTargetOverridesForDates(userId, [cutoverDate]),
  ]);
  const override = overrides.find((row) => row.target_date === cutoverDate) ?? null;
  const activeTarget = resolveEatTargetForDate({
    date: cutoverDate,
    ...sources,
    override: override?.target_type ?? "auto",
  });
  const values = canonicalValuesFromLegacyTarget(activeTarget, sources.baseTarget);
  if (!values) return periods;

  const period = buildLegacyCutoverTargetPeriod({
    effectiveFrom: cutoverDate,
    values,
    evidence: {
      requested_type: activeTarget.requestedType,
      legacy_source_type: activeTarget.sourceType,
      legacy_profile_id: activeTarget.profile?.id ?? null,
      legacy_profile_updated_at: activeTarget.profile?.updated_at ?? null,
      date_assignment: override?.target_type ?? "auto",
      date_assignment_updated_at: override?.updated_at ?? null,
    },
  });

  const { error } = await supabase!
    .from("nutrition_target_periods")
    .insert(targetPeriodInsertPayload(userId, period));
  if (error) {
    periods = await readTargetPeriods(userId, [cutoverDate]);
    if (!resolveEffectiveNutritionTarget(periods, cutoverDate).available) {
      throw new Error(`Could not persist the effective Nutrition target cutover. ${error.message}`);
    }
    return periods;
  }
  return readTargetPeriods(userId, [cutoverDate]);
}

export async function getEatTargetsForDates(userId: string, inputDates: string[]): Promise<Record<string, ActiveNutritionTarget>> {
  const dates = validatedDates(inputDates);
  if (!dates.length) return {};

  if (!supabase || !isUuid(userId)) {
    return legacyTargetsForDates(userId, dates);
  }

  const cutoverDate = todayIso();
  if (dates.some((date) => date >= cutoverDate)) {
    await ensureLegacyCutoverPeriod(userId, cutoverDate);
  }
  const periods = await readTargetPeriods(userId, [...dates, cutoverDate]);
  return Object.fromEntries(dates.map((date) => [
    date,
    activeNutritionTargetFromEffectiveTarget(resolveEffectiveNutritionTarget(periods, date)),
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
