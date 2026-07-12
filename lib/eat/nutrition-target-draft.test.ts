import { describe, expect, it } from "vitest";
import {
  buildNutritionTargetDraft,
  canonicalNutritionTargetDraft,
  isNutritionTargetDraftDirty,
  profileForEditor,
  targetChoiceEditorType,
  type PersistedNutritionTargetState
} from "@/lib/eat/nutrition-target-draft";
import type { UserNutritionTargetProfile } from "@/types";

const profile = (target_type: UserNutritionTargetProfile["target_type"], calories = 2000): UserNutritionTargetProfile => ({
  id: `profile-${target_type}`,
  user_id: "user",
  target_type,
  calories,
  protein_g: 150,
  carbs_g: 220,
  fat_g: 65,
  water_ml: 3000,
  notes: `${target_type} notes`,
  created_at: "2026-07-12T00:00:00Z",
  updated_at: "2026-07-12T00:00:00Z"
});

const persisted = (patch: Partial<PersistedNutritionTargetState> = {}): PersistedNutritionTargetState => ({
  selectedDate: "2026-07-12",
  assignment: "auto",
  resolvedTargetType: "rest_day",
  profiles: [profile("default_day", 1900), profile("rest_day", 1800)],
  baseTarget: { daily_calories: 2100, protein_g: 140, carbs_g: 240, fat_g: 70, water_ml: 2800 },
  ...patch
});

const metricSettings = { energyUnit: "kcal" as const, liquidUnit: "ml" as const };

it("keeps date assignment separate from the reusable editor profile", () => {
  const draft = buildNutritionTargetDraft({ persisted: persisted(), settings: metricSettings });
  expect(draft.assignment).toBe("auto");
  expect(draft.editorTargetType).toBe("rest_day");
  expect(draft.calories).toBe("1800");
  expect(targetChoiceEditorType("training_day", "rest_day")).toBe("training_day");
});

it("uses the single default-day profile as the visible fallback", () => {
  const result = profileForEditor("training_day", [profile("default_day", 1950)], persisted().baseTarget);
  expect(result.source).toBe("fallback-profile");
  expect(result.profile?.target_type).toBe("default_day");
});

it("initializes the fallback editor from the legacy base only when default_day is missing", () => {
  const draft = buildNutritionTargetDraft({ persisted: persisted({ assignment: "default_day", profiles: [] }), settings: metricSettings });
  expect(draft.editorTargetType).toBe("default_day");
  expect(draft.calories).toBe("2100");
  expect(profileForEditor("default_day", [], persisted().baseTarget).source).toBe("legacy-base");
});

it("tracks assignment, profile values, and notes as unapplied changes", () => {
  const saved = buildNutritionTargetDraft({ persisted: persisted(), settings: metricSettings });
  expect(isNutritionTargetDraftDirty(saved, saved)).toBe(false);
  expect(isNutritionTargetDraftDirty({ ...saved, assignment: "rest_day" }, saved)).toBe(true);
  expect(isNutritionTargetDraftDirty({ ...saved, protein: "151" }, saved)).toBe(true);
  expect(isNutritionTargetDraftDirty({ ...saved, notes: "changed" }, saved)).toBe(true);
});

it("converts display kJ and oz back to canonical kcal and ml", () => {
  const draft = buildNutritionTargetDraft({ persisted: persisted(), settings: { energyUnit: "kJ", liquidUnit: "oz" } });
  const canonical = canonicalNutritionTargetDraft(draft, { energyUnit: "kJ", liquidUnit: "oz" });
  expect(canonical.calories).toBeCloseTo(1800, 0);
  expect(canonical.waterMl).toBeCloseTo(3000, 0);
});
