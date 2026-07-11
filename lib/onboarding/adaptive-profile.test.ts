import { describe, expect, it } from "vitest";
import { SPORT_FIELD_CONFIG, createEmptyAdaptiveOnboarding, firstInvalidSection, isOnboardingComplete, sanitizeAdaptiveOnboarding, shouldShowTargetWeight, validateOnboardingSection } from "@/lib/onboarding/adaptive-profile";
import { onboardingOptionLabel, onboardingPermissionCopy, translateValidationIssue } from "@/lib/i18n/onboarding";
import { buildOnboardingReviewSections, formatReviewHeight, formatReviewWeight } from "@/lib/onboarding/review-summary";
import { onboardingExitDecision, resolveOnboardingReturnRoute } from "@/lib/onboarding/navigation";
import { configToScopes, getDefaultAiPermissionConfig } from "@/services/database/ai-permissions";
import { buildAdaptiveConstraintPayload, buildAdaptiveNutritionPayload, buildAdaptiveOnboardingPayload, buildAdaptivePermissionPayload } from "@/services/database/adaptive-onboarding";

function validAnswers() {
  const answers = createEmptyAdaptiveOnboarding();
  answers.age = 25; answers.goals = ["improve_strength", "improve_health"]; answers.primary_goal = "improve_strength"; answers.primary_sport = "gym_strength";
  answers.training_level = "intermediate"; answers.training_place = "gym"; answers.activity_level = "moderate"; answers.training_days_per_week = 3;
  answers.available_days = ["monday", "wednesday", "friday"]; answers.workout_duration_minutes = 60; answers.preferred_workout_time = "evening";
  answers.sport_details = { available_equipment: ["barbell"], training_style: "strength" };
  answers.nutrition.nutrition_goal = "performance"; answers.nutrition.meals_per_day = 4; answers.nutrition.preferred_cuisines = ["no_preference"];
  return answers;
}

const reviewLabels = {
  text: {
    noValue: "Not provided", noneSelected: "None selected", yes: "Yes", no: "No", full: "Full", custom: "Custom", read: "View", readWrite: "View and create/update", primarySport: "Primary sport", secondarySports: "Secondary sports", primaryGoal: "Primary goal", goals: "Goals", targetWeight: "Target weight", age: "Age", sex: "Sex", height: "Height", currentWeight: "Weight", experienceLevel: "Experience", trainingLocation: "Location", activityLevel: "Activity", daysPerWeek: "Days", availableDays: "Available days", sessionDuration: "Duration", preferredTime: "Time", likedActivities: "Likes", dislikedActivities: "Dislikes", nutritionGoal: "Nutrition goal", mealsPerDay: "Meals", preferredCuisines: "Cuisines", foodsLiked: "Foods liked", foodsDisliked: "Foods disliked", allergies: "Allergies", restrictions: "Restrictions", cookingAbility: "Cooking", cookingTime: "Cooking time", mealPrep: "Meal prep", weeklyBudget: "Budget", eatingSchedule: "Schedule", supplements: "Supplements", tracksMacros: "Tracks macros", injuries: "Injuries", painAreas: "Pain areas", movementsAvoid: "Avoid", discomfortExercises: "Discomfort", mobilityLimits: "Mobility", professionalRestrictions: "Professional restrictions", retainedNotes: "Legacy notes", accessMode: "Access mode", basicSummary: "Basic", goalsSummary: "Goals", trainingSummary: "Training", nutritionSummary: "Nutrition", constraintsSummary: "Constraints", permissionsSummary: "Permissions"
  },
  goalLabel: (value: string) => value,
  sportLabel: (value: string) => value,
  optionLabel: (value: string) => value,
  fieldLabel: (_id: string, fallback: string) => fallback,
  dayLabel: (value: string) => value,
  permissionLabel: (value: string) => value
} as never;

describe("adaptive onboarding behavior", () => {
  it("starts without fabricated personal values", () => {
    const answers = createEmptyAdaptiveOnboarding();
    expect(answers).toMatchObject({ age: null, goals: [], primary_sport: null, training_level: "", training_place: "" });
    expect(answers.nutrition.preferred_cuisines).toEqual([]);
    expect(configToScopes(getDefaultAiPermissionConfig())).toEqual([]);
  });

  it("returns stable validation codes and localizes them in all supported languages", () => {
    const issue = validateOnboardingSection(0, createEmptyAdaptiveOnboarding()).age;
    expect(issue).toEqual({ code: "age_required" });
    expect(translateValidationIssue("en", issue)).toBe("Age is required.");
    expect(translateValidationIssue("de", issue)).toBe("Das Alter ist erforderlich.");
    expect(translateValidationIssue("ar", issue)).toBe("العمر مطلوب.");
  });

  it("keeps common experience and location out of every sport-specific configuration", () => {
    const forbidden = new Set(["running_experience", "swimming_experience", "pilates_experience", "pilates_location", "yoga_experience", "yoga_location", "combat_experience"]);
    for (const fields of Object.values(SPORT_FIELD_CONFIG)) expect(fields.some((field) => forbidden.has(field.id))).toBe(false);
  });

  it("uses correct additional fields for running, walking, Pilates, swimming, and combat sports", () => {
    expect(SPORT_FIELD_CONFIG.running.map((field) => field.id)).toEqual(["weekly_distance", "event_goal", "current_pace", "running_surface", "cardio_preferences"]);
    expect(SPORT_FIELD_CONFIG.walking_hiking.map((field) => field.id)).toEqual(["walking_weekly_volume", "walking_terrain", "elevation_preference", "walking_environment", "walking_goal"]);
    expect(SPORT_FIELD_CONFIG.pilates.map((field) => field.id)).toEqual(["pilates_format", "reformer_availability", "pilates_focus"]);
    expect(SPORT_FIELD_CONFIG.swimming.map((field) => field.id)).not.toContain("swimming_experience");
    expect(SPORT_FIELD_CONFIG.boxing_martial_arts.map((field) => field.id)).not.toContain("combat_experience");
  });

  it("drops irrelevant sport answers when the primary sport changes", () => {
    const answers = validAnswers();
    answers.primary_sport = "running";
    answers.sport_details = { available_equipment: ["barbell"], weekly_distance: 20, running_surface: "road" };
    expect(sanitizeAdaptiveOnboarding(answers).sport_details).toEqual({ weekly_distance: 20, running_surface: "road" });
  });

  it("preserves target-weight and atomic payload behavior", () => {
    expect(shouldShowTargetWeight(["lose_fat"])).toBe(true);
    expect(shouldShowTargetWeight(["improve_health"])).toBe(false);
    const answers = validAnswers(); answers.goal_weight_kg = 77; answers.goals = ["improve_health"]; answers.primary_goal = "improve_health";
    expect(sanitizeAdaptiveOnboarding(answers).goal_weight_kg).toBeNull();
    const payload = buildAdaptiveOnboardingPayload("00000000-0000-4000-8000-000000000000", validAnswers(), 3, null);
    expect(payload).toMatchObject({ primary_sport: "gym_strength", setup_stage: 3, completed_at: null });
  });

  it("keeps allergies, dietary restrictions, and non-medical constraints separate", () => {
    const answers = validAnswers(); answers.nutrition.allergies = ["peanuts"]; answers.nutrition.dietary_restrictions = ["vegetarian"];
    const nutrition = buildAdaptiveNutritionPayload("00000000-0000-4000-8000-000000000000", answers);
    expect(nutrition.allergy_items).toEqual(["peanuts"]); expect(nutrition.dietary_restrictions).toEqual(["vegetarian"]);
    answers.constraints.professional_restrictions = "Avoid impact";
    expect(buildAdaptiveConstraintPayload("00000000-0000-4000-8000-000000000000", answers.constraints)).not.toHaveProperty("diagnosis");
  });

  it("keeps permission identifiers stable while labels are localized", () => {
    const config = getDefaultAiPermissionConfig(); config.sections.workouts = { read: true, write: true };
    expect(buildAdaptivePermissionPayload(config).scopes).toEqual(["plaivra.workouts.read", "plaivra.workouts.write"]);
    expect(onboardingPermissionCopy("de", "workouts").label).toBe("Training");
    expect(onboardingPermissionCopy("ar", "workouts").label).toBe("التمارين");
    expect(onboardingOptionLabel("de", "morning")).toBe("Morgens");
  });

  it("builds a complete review, omits empty optional rows, and uses display units", () => {
    const answers = validAnswers(); answers.height_cm = 175; answers.weight_kg = 85; answers.goal_weight_kg = 80; answers.liked_activities = ["squats"];
    answers.nutrition.allergies = ["peanuts"]; answers.constraints.movements_to_avoid = "deep flexion";
    const permissions = getDefaultAiPermissionConfig(); permissions.sections.workouts = { read: true, write: true };
    const sections = buildOnboardingReviewSections({ answers, permissions, weightUnit: "lb", heightUnit: "ft-in", labels: reviewLabels });
    expect(sections.find((section) => section.id === "basic")?.rows.some((item) => item.value.includes("lb"))).toBe(true);
    expect(sections.find((section) => section.id === "basic")?.rows.some((item) => item.value.includes("′"))).toBe(true);
    expect(JSON.stringify(sections.find((section) => section.id === "training"))).toContain("barbell");
    expect(JSON.stringify(sections.find((section) => section.id === "nutrition"))).toContain("peanuts");
    expect(JSON.stringify(sections.find((section) => section.id === "constraints"))).toContain("deep flexion");
    expect(JSON.stringify(sections.find((section) => section.id === "permissions"))).toContain("View and create/update");
    expect(formatReviewWeight(85, "kg")).toBe("85 kg");
    expect(formatReviewHeight(175, "cm")).toBe("175 cm");
  });

  it("resolves edit return routes without creating an open redirect", () => {
    expect(resolveOnboardingReturnRoute("/profile")).toBe("/profile");
    expect(resolveOnboardingReturnRoute("/settings/account")).toBe("/settings/account");
    expect(resolveOnboardingReturnRoute("https://evil.example")).toBe("/settings");
    expect(resolveOnboardingReturnRoute("//evil.example")).toBe("/settings");
    expect(resolveOnboardingReturnRoute(null)).toBe("/settings");
    expect(onboardingExitDecision(false)).toBe("exit");
    expect(onboardingExitDecision(true)).toBe("confirm");
  });

  it("keeps completed_at authoritative and finds the first invalid section", () => {
    expect(isOnboardingComplete({ completed_at: null })).toBe(false);
    expect(isOnboardingComplete({ completed_at: "2026-07-11T12:00:00.000Z" })).toBe(true);
    const answers = validAnswers(); const permissions = getDefaultAiPermissionConfig();
    expect(firstInvalidSection(answers, { permissionStatus: "none", permissionConfirmed: true, permissions })).toBeNull();
    answers.primary_sport = null;
    expect(firstInvalidSection(answers, { permissionStatus: "none", permissionConfirmed: true, permissions })).toBe(2);
  });
});
