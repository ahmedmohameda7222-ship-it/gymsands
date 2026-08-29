import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildLegacyCutoverTargetPeriod,
  normalizeNutritionTargetPeriod,
  resolveEffectiveNutritionTarget,
  targetPeriodInsertPayload,
  type EffectiveNutritionTarget,
  type NutritionTargetValues,
} from "@/lib/nutrition-v1/targets";

const TARGET_COLUMNS = "id,effective_from,effective_to,calories,protein_g,carbs_g,fat_g,water_ml,source,source_evidence";

async function readCandidatePeriod(
  supabase: SupabaseClient,
  userId: string,
  date: string,
) {
  const { data, error } = await supabase
    .from("nutrition_target_periods")
    .select(TARGET_COLUMNS)
    .eq("user_id", userId)
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not load the Nutrition target for ${date}. ${error.message}`);
  return (data ?? []).map((row) => normalizeNutritionTargetPeriod(row as Record<string, unknown>));
}

export async function getEffectiveNutritionTarget(
  supabase: SupabaseClient,
  userId: string,
  date: string,
): Promise<EffectiveNutritionTarget> {
  return resolveEffectiveNutritionTarget(await readCandidatePeriod(supabase, userId, date), date);
}

export async function persistLegacyCutoverNutritionTarget(
  supabase: SupabaseClient,
  userId: string,
  input: {
    effectiveFrom: string;
    values: NutritionTargetValues;
    evidence?: Record<string, unknown>;
  },
): Promise<EffectiveNutritionTarget> {
  const existing = await getEffectiveNutritionTarget(supabase, userId, input.effectiveFrom);
  if (existing.available) return existing;

  const period = buildLegacyCutoverTargetPeriod(input);
  const { data, error } = await supabase
    .from("nutrition_target_periods")
    .insert(targetPeriodInsertPayload(userId, period))
    .select(TARGET_COLUMNS)
    .single();

  if (error) {
    // Another same-owner request may have won the non-overlap race. Re-read before
    // surfacing failure; never broaden or rewrite an already-persisted target period.
    const raced = await getEffectiveNutritionTarget(supabase, userId, input.effectiveFrom);
    if (raced.available) return raced;
    throw new Error(`Could not persist the Nutrition target cutover. ${error.message}`);
  }

  return resolveEffectiveNutritionTarget([
    normalizeNutritionTargetPeriod(data as Record<string, unknown>),
  ], input.effectiveFrom);
}
