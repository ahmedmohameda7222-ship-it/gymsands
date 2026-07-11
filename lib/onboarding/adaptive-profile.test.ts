import { describe, expect, it } from "vitest";
import {
  SPORT_FIELD_CONFIG,
  createEmptyAdaptiveOnboarding,
  firstInvalidSection,
  isOnboardingComplete,
  sanitizeAdaptiveOnboarding,
  shouldShowTargetWeight,
  validateOnboardingSection
} from "@/lib/onboarding/adaptive-profile";
import { configToScopes, getDefaultAiPermissionConfig } from "@/services/database/ai-permissions";
import { buildAdaptiveConstraintPayload, buildAdaptiveNutritionPayload, buildAdaptiveOnboardingPayload, buildAdaptivePermissionPayload } from "@/services/database/adaptive-onboarding";

function validAnswers() {
  const answers = createEmptyAdaptiveOnboarding();
  answers.age = 25;
  answers.goals = ["improve_strength", "improve_health"];
  answers.primary_goal = "improve_strength";
  answers.primary_sport = "gym_strength";
  answers.training_level = "intermediate";
  answers.training_place = "gym";
  answers.activity_level = "moderate";
  answers.training_days_per_week = 3;
  answers.available_days = ["monday", "wednesday", "friday"];
  answers.workout_duration_minutes = 60;
  answers.preferred_workout_time = "evening";
  answers.sport_details = { available_equipment: ["barbell"], training_style: "strength" };
  answers.nutrition.nutrition_goal = "performance";
  answers.nutrition.meals_per_day = 4;
  answers.nutrition.preferred_cuisines = ["no_preference"];
  return answers;
}

describe("adaptive onboarding behavior", () => {
  it("starts without fabricated personal values", () => {
    const answers = createEmptyAdaptiveOnboarding();
    expect(answers.age).toBeNull();
    expect(answers.goals).toEqual([]);
    expect(answers.primary_sport).toBeNull();
    expect(answers.training_level).toBe("");
    expect(answers.training_place).toBe("");
    expect(answers.nutrition.preferred_cuisines).toEqual([]);
    expect(getDefaultAiPermissionConfig()).toMatchObject({ accessMode: "custom" });
    expect(configToScopes(getDefaultAiPermissionConfig())).toEqual([]);
  });

  it("requires age and enforces the existing 16+ launch rule without clamping", () => {
    const answers = createEmptyAdaptiveOnboarding();
    expect(validateOnboardingSection(0, answers).age).toBeTruthy();
    answers.age = 15;
    expect(validateOnboardingSection(0, answers).age).toContain("16");
    answers.age = 16;
    expect(validateOnboardingSection(0, answers).age).toBeUndefined();
    answers.age = 101;
    expect(validateOnboardingSection(0, answers).age).toBeTruthy();
  });

  it("keeps optional height and weight clearable and rejects unsupported values", () => {
    const answers = validAnswers();
    answers.height_cm = null;
    answers.weight_kg = null;
    expect(validateOnboardingSection(0, answers)).toEqual({});
    answers.height_cm = 80;
    answers.weight_kg = 600;
    expect(validateOnboardingSection(0, answers)).toMatchObject({ height_cm: expect.any(String), weight_kg: expect.any(String) });
  });

  it("supports multiple goals while requiring the primary goal to be selected", () => {
    const answers = validAnswers();
    expect(validateOnboardingSection(1, answers)).toEqual({});
    answers.primary_goal = "lose_fat";
    expect(validateOnboardingSection(1, answers).primary_goal).toBeTruthy();
  });

  it("shows target weight only for the three approved goals and clears hidden values", () => {
    expect(shouldShowTargetWeight(["lose_fat"])).toBe(true);
    expect(shouldShowTargetWeight(["build_muscle"])).toBe(true);
    expect(shouldShowTargetWeight(["body_recomposition"])).toBe(true);
    expect(shouldShowTargetWeight(["improve_health"])).toBe(false);
    const answers = validAnswers();
    answers.goal_weight_kg = 77;
    answers.goals = ["improve_health"];
    answers.primary_goal = "improve_health";
    expect(sanitizeAdaptiveOnboarding(answers).goal_weight_kg).toBeNull();
  });

  it("adapts sport fields and drops irrelevant stale answers at final save", () => {
    expect(SPORT_FIELD_CONFIG.gym_strength.some((field) => field.id === "preferred_split")).toBe(true);
    expect(SPORT_FIELD_CONFIG.pilates.some((field) => field.id === "pilates_format")).toBe(true);
    expect(SPORT_FIELD_CONFIG.pilates.some((field) => field.id === "preferred_split")).toBe(false);
    expect(SPORT_FIELD_CONFIG.running.some((field) => field.id === "weekly_distance")).toBe(true);
    const answers = validAnswers();
    answers.sport_details.hidden_running_value = "fabricated";
    const sanitized = sanitizeAdaptiveOnboarding(answers);
    expect(sanitized.sport_details.hidden_running_value).toBeUndefined();
    expect(sanitized.sport_details.available_equipment).toEqual(["barbell"]);
  });

  it("requires a custom value for Other and never stores a hidden primary default", () => {
    const answers = validAnswers();
    answers.primary_sport = "other";
    answers.primary_sport_other = "";
    expect(validateOnboardingSection(2, answers).primary_sport_other).toBeTruthy();
    answers.primary_sport_other = "Climbing";
    expect(validateOnboardingSection(2, answers).primary_sport_other).toBeUndefined();
  });

  it("keeps allergies and dietary restrictions separate and clears optional nutrition values", () => {
    const answers = validAnswers();
    answers.nutrition.allergies = ["peanuts"];
    answers.nutrition.dietary_restrictions = ["vegetarian"];
    answers.nutrition.weekly_food_budget = null;
    answers.nutrition.budget_currency = "EUR";
    const payload = buildAdaptiveNutritionPayload("00000000-0000-4000-8000-000000000000", answers);
    expect(payload.allergy_items).toEqual(["peanuts"]);
    expect(payload.dietary_restrictions).toEqual(["vegetarian"]);
    expect(payload.weekly_food_budget).toBeNull();
    expect(payload.budget_currency).toBeNull();
  });

  it("stores non-medical constraints in the canonical constraint payload", () => {
    const answers = validAnswers();
    answers.constraints.injury_or_limitation_labels = ["left ankle limitation"];
    answers.constraints.pain_sensitive_areas = ["lower back"];
    answers.constraints.movements_to_avoid = "Deep loaded flexion";
    const payload = buildAdaptiveConstraintPayload("00000000-0000-4000-8000-000000000000", answers.constraints);
    expect(payload.areas_to_protect).toEqual(["lower back"]);
    expect(payload.movements_to_avoid).toBe("Deep loaded flexion");
    expect(payload).not.toHaveProperty("diagnosis");
  });

  it("requires explicit permission confirmation and maps custom choices to real scopes", () => {
    const answers = validAnswers();
    const config = getDefaultAiPermissionConfig();
    expect(validateOnboardingSection(5, answers, { permissionStatus: "none", permissionConfirmed: false, permissions: config }).permission_confirmation).toBeTruthy();
    config.sections.workouts = { read: true, write: true };
    const payload = buildAdaptivePermissionPayload(config);
    expect(payload.scopes).toEqual(["plaivra.workouts.read", "plaivra.workouts.write"]);
    expect(payload.scopes).not.toContain("plaivra.admin");
  });

  it("full access contains only supported fitness and app-setting scopes", () => {
    const config = getDefaultAiPermissionConfig();
    config.accessMode = "full";
    const scopes = configToScopes(config);
    expect(scopes).toContain("plaivra.full_access");
    expect(scopes).not.toContain("plaivra.admin");
    expect(scopes.some((scope) => /billing|password|privacy|deletion|security/.test(scope))).toBe(false);
  });

  it("uses completed_at as the authoritative completion contract", () => {
    expect(isOnboardingComplete({ completed_at: null })).toBe(false);
    expect(isOnboardingComplete({ completed_at: "not-a-date" })).toBe(false);
    expect(isOnboardingComplete({ completed_at: "2026-07-11T12:00:00.000Z" })).toBe(true);
  });

  it("finds the first invalid required section and allows the optional constraints section", () => {
    const answers = validAnswers();
    const permissions = getDefaultAiPermissionConfig();
    expect(firstInvalidSection(answers, { permissionStatus: "none", permissionConfirmed: true, permissions })).toBeNull();
    answers.primary_sport = null;
    expect(firstInvalidSection(answers, { permissionStatus: "none", permissionConfirmed: true, permissions })).toBe(2);
  });

  it("builds draft payloads without legacy personal defaults", () => {
    const answers = validAnswers();
    const payload = buildAdaptiveOnboardingPayload("00000000-0000-4000-8000-000000000000", answers, 3, null);
    expect(payload.primary_sport).toBe("gym_strength");
    expect(payload.setup_stage).toBe(3);
    expect(payload.completed_at).toBeNull();
    expect(JSON.stringify(payload)).not.toContain("Egyptian food preferred");
    expect(JSON.stringify(payload)).not.toContain("Full Body");
  });
});
