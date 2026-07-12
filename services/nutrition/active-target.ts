import type { NutritionTargetAssignment, NutritionTargetProfileType, UserNutritionTargetProfile, UserWorkoutPlan } from "@/types";
import type { SavedTargets } from "@/services/nutrition/targets";

export type NutritionTargetOverride = NutritionTargetAssignment;

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
        ? "A workout is planned for this date."
        : requestedType === "rest_day"
          ? "No workout is scheduled for this date."
          : requestedType === "high_activity_day"
            ? "A high-activity override is active for this date."
            : "The fallback target is active.",
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
      reason: `${labels[requestedType]} has no saved profile, so the fallback target is active.`,
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
      ? "No reusable target profile is saved, so the legacy base target is used as a backend fallback."
      : "No target is saved for this date.",
    hasTarget
  };
}

export function detectNutritionTargetTypeForDate(plan: UserWorkoutPlan | null | undefined, date: string): NutritionTargetProfileType {
  const weekday = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return plan?.days.some((day) => day.weekday === weekday && day.exercises.length > 0) ? "training_day" : "rest_day";
}

export function resolveEatTargetForDate({
  date,
  profiles,
  baseTarget,
  plan,
  override = "auto"
}: {
  userId?: string;
  date: string;
  profiles: UserNutritionTargetProfile[];
  baseTarget: SavedTargets | null;
  plan: UserWorkoutPlan | null | undefined;
  override?: NutritionTargetOverride;
}) {
  const requestedType = override === "auto" ? detectNutritionTargetTypeForDate(plan, date) : override;
  return resolveActiveNutritionTarget({ profiles, baseTarget, requestedType });
}
