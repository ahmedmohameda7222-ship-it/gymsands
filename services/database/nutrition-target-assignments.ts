"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import { getNutritionTargetProfiles } from "@/services/database/execution-layer";
import type {
  NutritionTargetApplyResult,
  NutritionTargetAssignment,
  NutritionTargetProfileType,
  UserNutritionTargetDateOverride,
  UserNutritionTargetProfile
} from "@/types";

export const ACTIVE_NUTRITION_TARGET_EVENT = "plaivra:active-nutrition-target-change";
export const NUTRITION_TARGET_APPLY_CRITICAL_CODE = "NUTRITION_TARGET_APPLY_CRITICAL";

const explicitAssignments = new Set<NutritionTargetProfileType>([
  "default_day",
  "training_day",
  "rest_day",
  "high_activity_day"
]);

export class NutritionTargetApplyConsistencyError extends Error {
  readonly code = NUTRITION_TARGET_APPLY_CRITICAL_CODE;
  readonly requiresReload = true;
  readonly debugDetail: string;

  constructor(debugDetail: string) {
    super("Nutrition target changes could not be verified.");
    this.name = "NutritionTargetApplyConsistencyError";
    this.debugDetail = debugDetail;
  }
}

export function isNutritionTargetApplyConsistencyError(error: unknown): error is NutritionTargetApplyConsistencyError {
  return error instanceof NutritionTargetApplyConsistencyError || (
    typeof error === "object" && error !== null && "code" in error && error.code === NUTRITION_TARGET_APPLY_CRITICAL_CODE
  );
}

export function isExplicitNutritionTargetAssignment(value: unknown): value is NutritionTargetProfileType {
  return typeof value === "string" && explicitAssignments.has(value as NutritionTargetProfileType);
}

export function legacyNutritionTargetOverrideKey(userId: string, date: string) {
  return `plaivra:nutrition-target:${userId}:${date}`;
}

function canUseUserData(userId: string | null | undefined): userId is string {
  return Boolean(supabase && userId && isUuid(userId));
}

function dispatchTargetRefresh(date: string, value: NutritionTargetAssignment) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ACTIVE_NUTRITION_TARGET_EVENT, { detail: { date, value } }));
}

export async function getNutritionTargetDateOverride(userId: string, date: string) {
  if (!canUseUserData(userId)) return null as UserNutritionTargetDateOverride | null;
  const { data, error } = await supabase!
    .from("user_nutrition_target_date_overrides")
    .select("id,user_id,target_date,target_type,created_at,updated_at")
    .eq("user_id", userId)
    .eq("target_date", date)
    .maybeSingle();
  if (error) throw new Error("Could not load the nutrition target assignment.");
  return data as UserNutritionTargetDateOverride | null;
}

export async function getNutritionTargetDateOverrides(userId: string, startDate: string, endDate: string) {
  if (!canUseUserData(userId)) return [] as UserNutritionTargetDateOverride[];
  const { data, error } = await supabase!
    .from("user_nutrition_target_date_overrides")
    .select("id,user_id,target_date,target_type,created_at,updated_at")
    .eq("user_id", userId)
    .gte("target_date", startDate)
    .lte("target_date", endDate)
    .order("target_date", { ascending: true });
  if (error) throw new Error("Could not load nutrition target assignments.");
  return (data ?? []) as UserNutritionTargetDateOverride[];
}

export async function migrateLegacyNutritionTargetOverride(userId: string, date: string) {
  const existing = await getNutritionTargetDateOverride(userId, date);
  if (existing || typeof window === "undefined" || !canUseUserData(userId)) return existing;

  const key = legacyNutritionTargetOverrideKey(userId, date);
  const legacyValue = window.localStorage.getItem(key);
  if (!isExplicitNutritionTargetAssignment(legacyValue)) return null;

  const { error } = await supabase!
    .from("user_nutrition_target_date_overrides")
    .insert({ user_id: userId, target_date: date, target_type: legacyValue });

  if (error && error.code !== "23505") {
    throw new Error("Could not migrate the saved nutrition target assignment.");
  }

  const verified = await getNutritionTargetDateOverride(userId, date);
  if (!verified) throw new Error("Could not verify the migrated nutrition target assignment.");

  window.localStorage.removeItem(key);
  dispatchTargetRefresh(date, verified.target_type);
  return verified;
}

export type ApplyNutritionTargetChangesInput = {
  userId: string;
  targetDate: string;
  assignment: NutritionTargetAssignment;
  editorTargetType: NutritionTargetProfileType;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  waterMl: number | null;
  notes: string | null;
};

function normalizedProfileValues(profile: UserNutritionTargetProfile) {
  return {
    calories: profile.calories === null ? null : Number(profile.calories),
    proteinG: profile.protein_g === null ? null : Number(profile.protein_g),
    carbsG: profile.carbs_g === null ? null : Number(profile.carbs_g),
    fatG: profile.fat_g === null ? null : Number(profile.fat_g),
    waterMl: profile.water_ml === null ? null : Number(profile.water_ml),
    notes: profile.notes?.trim() || null
  };
}

function sameNullableNumber(left: number | null, right: number | null) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) < 0.011;
}

function profileMatches(profile: UserNutritionTargetProfile, input: ApplyNutritionTargetChangesInput) {
  const values = normalizedProfileValues(profile);
  return profile.target_type === input.editorTargetType
    && sameNullableNumber(values.calories, input.calories)
    && sameNullableNumber(values.proteinG, input.proteinG)
    && sameNullableNumber(values.carbsG, input.carbsG)
    && sameNullableNumber(values.fatG, input.fatG)
    && sameNullableNumber(values.waterMl, input.waterMl)
    && values.notes === (input.notes?.trim() || null);
}

export async function applyNutritionTargetChanges(input: ApplyNutritionTargetChangesInput): Promise<NutritionTargetApplyResult> {
  if (!canUseUserData(input.userId)) {
    const now = new Date().toISOString();
    return {
      assignment: input.assignment,
      profile: {
        id: "mock-nutrition-target-profile",
        user_id: input.userId,
        target_type: input.editorTargetType,
        calories: input.calories,
        protein_g: input.proteinG,
        carbs_g: input.carbsG,
        fat_g: input.fatG,
        water_ml: input.waterMl,
        notes: input.notes?.trim() || null,
        created_at: now,
        updated_at: now
      },
      override: input.assignment === "auto" ? null : {
        id: "mock-nutrition-target-override",
        user_id: input.userId,
        target_date: input.targetDate,
        target_type: input.assignment,
        created_at: now,
        updated_at: now
      }
    };
  }

  const { error } = await supabase!.rpc("apply_nutrition_target_changes", {
    p_target_date: input.targetDate,
    p_assignment: input.assignment,
    p_editor_target_type: input.editorTargetType,
    p_calories: input.calories,
    p_protein_g: input.proteinG,
    p_carbs_g: input.carbsG,
    p_fat_g: input.fatG,
    p_water_ml: input.waterMl,
    p_notes: input.notes?.trim() || null
  });
  if (error) throw new Error("Could not apply the nutrition target changes.");

  const [profiles, override] = await Promise.all([
    getNutritionTargetProfiles(input.userId),
    getNutritionTargetDateOverride(input.userId, input.targetDate)
  ]);
  const profile = profiles.find((item) => item.target_type === input.editorTargetType) ?? null;
  const persistedAssignment: NutritionTargetAssignment = override?.target_type ?? "auto";

  if (!profile || !profileMatches(profile, input) || persistedAssignment !== input.assignment) {
    throw new NutritionTargetApplyConsistencyError(
      `Verification mismatch for ${input.targetDate}: assignment=${persistedAssignment}, profile=${profile?.target_type ?? "missing"}.`
    );
  }

  dispatchTargetRefresh(input.targetDate, persistedAssignment);
  return { assignment: persistedAssignment, profile, override };
}
