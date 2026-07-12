import type { UserAppSettings } from "@/services/database/user-settings";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { NutritionTargetAssignment, NutritionTargetProfileType, UserNutritionTargetProfile } from "@/types";
import { eatEnergyDisplayValue, eatEnergyInputToKcal, eatLiquidDisplayValue, eatLiquidInputToMl } from "@/lib/eat/eat-units";

export type NutritionTargetDraft = {
  selectedDate: string;
  assignment: NutritionTargetAssignment;
  editorTargetType: NutritionTargetProfileType;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  water: string;
  notes: string;
};

export type PersistedNutritionTargetState = {
  selectedDate: string;
  assignment: NutritionTargetAssignment;
  resolvedTargetType: NutritionTargetProfileType;
  profiles: UserNutritionTargetProfile[];
  baseTarget: SavedTargets | null;
};

function display(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export function profileForEditor(
  targetType: NutritionTargetProfileType,
  profiles: UserNutritionTargetProfile[],
  baseTarget: SavedTargets | null
) {
  const exact = profiles.find((profile) => profile.target_type === targetType) ?? null;
  if (exact) return { profile: exact, source: "exact" as const };
  const fallback = profiles.find((profile) => profile.target_type === "default_day") ?? null;
  if (fallback) return { profile: fallback, source: "fallback-profile" as const };
  return { profile: null, source: baseTarget ? "legacy-base" as const : "empty" as const };
}

export function buildNutritionTargetDraft({
  persisted,
  settings
}: {
  persisted: PersistedNutritionTargetState;
  settings: Pick<UserAppSettings, "energyUnit" | "liquidUnit">;
}): NutritionTargetDraft {
  const editorTargetType = persisted.assignment === "auto" ? persisted.resolvedTargetType : persisted.assignment;
  const source = profileForEditor(editorTargetType, persisted.profiles, persisted.baseTarget);
  const profile = source.profile;
  const calories = profile?.calories ?? persisted.baseTarget?.daily_calories ?? null;
  const protein = profile?.protein_g ?? persisted.baseTarget?.protein_g ?? null;
  const carbs = profile?.carbs_g ?? persisted.baseTarget?.carbs_g ?? null;
  const fat = profile?.fat_g ?? persisted.baseTarget?.fat_g ?? null;
  const water = profile?.water_ml ?? persisted.baseTarget?.water_ml ?? null;
  return {
    selectedDate: persisted.selectedDate,
    assignment: persisted.assignment,
    editorTargetType,
    calories: calories === null ? "" : String(eatEnergyDisplayValue(Number(calories), settings.energyUnit)),
    protein: display(protein === null ? null : Number(protein)),
    carbs: display(carbs === null ? null : Number(carbs)),
    fat: display(fat === null ? null : Number(fat)),
    water: water === null ? "" : String(eatLiquidDisplayValue(Number(water), settings.liquidUnit)),
    notes: profile?.notes ?? ""
  };
}

function normalizedText(value: string) {
  return value.trim();
}

export function nutritionTargetDraftFingerprint(draft: NutritionTargetDraft) {
  return JSON.stringify({
    selectedDate: draft.selectedDate,
    assignment: draft.assignment,
    editorTargetType: draft.editorTargetType,
    calories: normalizedText(draft.calories),
    protein: normalizedText(draft.protein),
    carbs: normalizedText(draft.carbs),
    fat: normalizedText(draft.fat),
    water: normalizedText(draft.water),
    notes: normalizedText(draft.notes)
  });
}

export function isNutritionTargetDraftDirty(draft: NutritionTargetDraft, persistedDraft: NutritionTargetDraft) {
  return nutritionTargetDraftFingerprint(draft) !== nutritionTargetDraftFingerprint(persistedDraft);
}

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

export function canonicalNutritionTargetDraft(
  draft: NutritionTargetDraft,
  settings: Pick<UserAppSettings, "energyUnit" | "liquidUnit">
) {
  const energyDisplay = numberOrNull(draft.calories);
  const protein = numberOrNull(draft.protein);
  const carbs = numberOrNull(draft.carbs);
  const fat = numberOrNull(draft.fat);
  const waterDisplay = numberOrNull(draft.water);
  return {
    calories: energyDisplay === null ? null : eatEnergyInputToKcal(energyDisplay, settings.energyUnit),
    proteinG: protein,
    carbsG: carbs,
    fatG: fat,
    waterMl: waterDisplay === null ? null : eatLiquidInputToMl(waterDisplay, settings.liquidUnit),
    notes: draft.notes.trim() || null
  };
}

export function targetChoiceEditorType(
  assignment: NutritionTargetAssignment,
  automaticResolvedType: NutritionTargetProfileType
): NutritionTargetProfileType {
  return assignment === "auto" ? automaticResolvedType : assignment;
}
