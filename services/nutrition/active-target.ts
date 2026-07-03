import type { NutritionTargetProfileType, UserNutritionTargetProfile } from "@/types";
import type { SavedTargets } from "@/services/nutrition/targets";

export const ACTIVE_NUTRITION_TARGET_EVENT = "plaivra:active-nutrition-target-change";

export type ActiveNutritionTarget = {
  values: SavedTargets;
  profile: UserNutritionTargetProfile | null;
  requestedType: NutritionTargetProfileType;
  sourceType: NutritionTargetProfileType | "base" | "none";
  label: string;
  reason: string;
  hasTarget: boolean;
};

const labels: Record<NutritionTargetProfileType, string> = {
  default_day: "Default day",
  training_day: "Training day",
  rest_day: "Rest day",
  high_activity_day: "High activity day"
};

const emptyTargets: SavedTargets = {
  daily_calories: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  water_ml: 0
};

export function resolveActiveNutritionTarget({
  profiles,
  baseTarget,
  requestedType
}: {
  profiles: UserNutritionTargetProfile[];
  baseTarget: SavedTargets | null;
  requestedType: NutritionTargetProfileType;
}): ActiveNutritionTarget {
  const exact = profiles.find((profile) => profile.target_type === requestedType) ?? null;
  const fallback = profiles.find((profile) => profile.target_type === "default_day") ?? null;
  const profile = exact ?? fallback;
  const sourceType = exact?.target_type ?? fallback?.target_type ?? (baseTarget ? "base" : "none");
  const base = baseTarget ?? emptyTargets;
  const values: SavedTargets = profile ? {
    daily_calories: profile.calories ?? base.daily_calories,
    protein_g: profile.protein_g ?? base.protein_g,
    carbs_g: profile.carbs_g ?? base.carbs_g,
    fat_g: profile.fat_g ?? base.fat_g,
    water_ml: profile.water_ml ?? base.water_ml
  } : base;
  const hasTarget = Object.values(values).some((value) => Number(value) > 0);

  if (exact) {
    return {
      values,
      profile,
      requestedType,
      sourceType,
      label: labels[requestedType],
      reason: requestedType === "training_day"
        ? "A workout is planned for today."
        : requestedType === "rest_day"
          ? "No workout is scheduled for today."
          : requestedType === "high_activity_day"
            ? "You selected a high-movement day for today."
            : "Your normal-day target is selected.",
      hasTarget
    };
  }

  if (fallback) {
    return {
      values,
      profile,
      requestedType,
      sourceType,
      label: "Default day",
      reason: `${labels[requestedType]} has no saved profile, so your default target is active.`,
      hasTarget
    };
  }

  return {
    values,
    profile: null,
    requestedType,
    sourceType,
    label: baseTarget ? "Base fallback" : labels[requestedType],
    reason: baseTarget
      ? "No day-type profile is saved, so Plaivra is using your base target."
      : "No target is saved yet. Add a base or day-type target to start tracking against it.",
    hasTarget
  };
}

export function getActiveTargetOverride(userId: string, date: string): NutritionTargetProfileType | "auto" {
  if (typeof window === "undefined") return "auto";
  const value = window.localStorage.getItem(targetOverrideKey(userId, date));
  return value === "default_day" || value === "training_day" || value === "rest_day" || value === "high_activity_day"
    ? value
    : "auto";
}

export function setActiveTargetOverride(userId: string, date: string, value: NutritionTargetProfileType | "auto") {
  if (typeof window === "undefined") return;
  const key = targetOverrideKey(userId, date);
  if (value === "auto") window.localStorage.removeItem(key);
  else window.localStorage.setItem(key, value);
  window.dispatchEvent(new CustomEvent(ACTIVE_NUTRITION_TARGET_EVENT, { detail: { date, value } }));
}

function targetOverrideKey(userId: string, date: string) {
  return `plaivra:nutrition-target:${userId}:${date}`;
}
