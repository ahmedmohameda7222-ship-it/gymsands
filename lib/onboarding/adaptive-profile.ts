import type { AiPermissionConfig, AiPermissionSettingsStatus } from "@/services/database/ai-permissions";

export const ONBOARDING_SECTIONS = [
  "Basic Profile",
  "Main Goals",
  "Training Profile",
  "Nutrition Profile",
  "Health and Physical Constraints",
  "ChatGPT Access",
  "Review & Finish"
] as const;

export type OnboardingSectionIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const GOAL_OPTIONS = [
  "lose_fat",
  "build_muscle",
  "improve_strength",
  "improve_endurance",
  "body_recomposition",
  "improve_health",
  "reduce_stress",
  "improve_mobility"
] as const;
export type GoalId = (typeof GOAL_OPTIONS)[number];

export const TARGET_WEIGHT_GOALS = new Set<GoalId>(["lose_fat", "build_muscle", "body_recomposition"]);

export const SPORT_OPTIONS = [
  "general_fitness",
  "gym_strength",
  "pilates",
  "yoga_mobility",
  "running",
  "walking_hiking",
  "cycling",
  "swimming",
  "football",
  "basketball",
  "tennis_racket",
  "boxing_martial_arts",
  "crossfit_functional",
  "home_workouts",
  "other"
] as const;
export type SportId = (typeof SPORT_OPTIONS)[number];

export type SportFieldType = "text" | "number" | "tags" | "choice";
export type SportFieldDefinition = {
  id: string;
  label: string;
  type: SportFieldType;
  options?: string[];
  min?: number;
  max?: number;
  unit?: string;
  optional?: boolean;
};

const strengthFields: SportFieldDefinition[] = [
  { id: "available_equipment", label: "Available equipment", type: "tags" },
  { id: "training_style", label: "Preferred training style", type: "choice", options: ["strength", "hypertrophy", "functional", "mixed"] },
  { id: "preferred_split", label: "Preferred split", type: "choice", options: ["full_body", "upper_lower", "push_pull_legs", "sport_support", "no_preference"], optional: true },
  { id: "strength_level", label: "Strength level or recent training level", type: "choice", options: ["beginner", "intermediate", "advanced"], optional: true },
  { id: "recent_lifts", label: "Recent lifts", type: "text", optional: true },
  { id: "cardio_preferences", label: "Cardio preferences", type: "tags", optional: true }
];

const runningFields: SportFieldDefinition[] = [
  { id: "weekly_distance", label: "Current weekly distance", type: "number", min: 0, max: 500, unit: "km", optional: true },
  { id: "event_goal", label: "Preferred distance or event goal", type: "text", optional: true },
  { id: "current_pace", label: "Current pace", type: "text", optional: true },
  { id: "running_surface", label: "Usual surface", type: "choice", options: ["road", "trail", "treadmill", "mixed"] },
  { id: "cardio_preferences", label: "Cardio preferences", type: "tags", optional: true }
];

const walkingFields: SportFieldDefinition[] = [
  { id: "walking_weekly_volume", label: "Current weekly walking or hiking duration or distance", type: "text", optional: true },
  { id: "walking_terrain", label: "Preferred terrain", type: "choice", options: ["flat", "hilly", "mountain", "urban", "mixed"] },
  { id: "elevation_preference", label: "Elevation preference or hill tolerance", type: "text", optional: true },
  { id: "walking_environment", label: "Indoor, outdoor or mixed", type: "choice", options: ["indoor", "outdoor", "mixed"] },
  { id: "walking_goal", label: "Distance or event goal", type: "text", optional: true }
];

const cyclingFields: SportFieldDefinition[] = [
  { id: "cycling_type", label: "Cycling type", type: "choice", options: ["road", "mountain", "commuting", "indoor", "mixed"] },
  { id: "weekly_cycling", label: "Current weekly distance or duration", type: "text", optional: true },
  { id: "cycling_environment", label: "Indoor, outdoor or both", type: "choice", options: ["indoor", "outdoor", "both"] },
  { id: "cycling_equipment", label: "Equipment availability", type: "tags", optional: true },
  { id: "cycling_goal", label: "Event or endurance goal", type: "text", optional: true }
];

const swimmingFields: SportFieldDefinition[] = [
  { id: "pool_availability", label: "Pool availability", type: "choice", options: ["regular", "limited", "seasonal"] },
  { id: "preferred_strokes", label: "Preferred strokes", type: "tags", optional: true },
  { id: "swim_session", label: "Current session distance or duration", type: "text", optional: true },
  { id: "swimming_goal", label: "Competition or fitness goal", type: "text", optional: true }
];

const pilatesFields: SportFieldDefinition[] = [
  { id: "pilates_format", label: "Mat, reformer or both", type: "choice", options: ["mat", "reformer", "both"] },
  { id: "reformer_availability", label: "Reformer availability", type: "choice", options: ["regular", "limited", "none"], optional: true },
  { id: "pilates_focus", label: "Mobility, strength or balanced focus", type: "choice", options: ["mobility", "strength", "balanced"] }
];

const yogaFields: SportFieldDefinition[] = [
  { id: "yoga_style", label: "Preferred style", type: "tags", optional: true },
  { id: "mobility_focus", label: "Mobility focus", type: "tags", optional: true },
  { id: "session_focus_intensity", label: "Session focus or intensity preference", type: "choice", options: ["gentle", "moderate", "challenging", "restorative", "mixed"], optional: true }
];

const teamFields: SportFieldDefinition[] = [
  { id: "sport_role", label: "Position or role", type: "text", optional: true },
  { id: "practice_frequency", label: "Practice frequency", type: "number", min: 0, max: 14, unit: "sessions/week" },
  { id: "match_frequency", label: "Match frequency", type: "number", min: 0, max: 7, unit: "matches/week", optional: true },
  { id: "conditioning_needs", label: "Conditioning needs", type: "tags", optional: true },
  { id: "strength_support_needs", label: "Strength-support needs", type: "tags", optional: true }
];

const combatFields: SportFieldDefinition[] = [
  { id: "discipline", label: "Discipline", type: "text" },
  { id: "technical_sessions", label: "Technical sessions per week", type: "number", min: 0, max: 14, unit: "sessions/week" },
  { id: "conditioning_preference", label: "Conditioning preference", type: "tags", optional: true },
  { id: "combat_equipment", label: "Equipment availability", type: "tags", optional: true }
];

const generalFields: SportFieldDefinition[] = [
  { id: "available_equipment", label: "Available equipment", type: "tags", optional: true },
  { id: "training_style", label: "Preferred training style", type: "tags", optional: true },
  { id: "cardio_preferences", label: "Cardio preferences", type: "tags", optional: true }
];

export const SPORT_FIELD_CONFIG: Record<SportId, SportFieldDefinition[]> = {
  general_fitness: generalFields,
  gym_strength: strengthFields,
  pilates: pilatesFields,
  yoga_mobility: yogaFields,
  running: runningFields,
  walking_hiking: walkingFields,
  cycling: cyclingFields,
  swimming: swimmingFields,
  football: teamFields,
  basketball: teamFields,
  tennis_racket: teamFields,
  boxing_martial_arts: combatFields,
  crossfit_functional: strengthFields,
  home_workouts: generalFields,
  other: generalFields
};

export type AdaptiveOnboardingRow = {
  id?: string;
  user_id: string;
  age?: number | null;
  age_range?: string | null;
  gender?: string | null;
  height_cm?: number | null;
  weight_kg?: number | null;
  goal_weight_kg?: number | null;
  goal?: string | null;
  goals?: string[] | null;
  primary_goal?: string | null;
  primary_sport?: string | null;
  primary_sport_other?: string | null;
  secondary_sports?: string[] | null;
  training_level?: string | null;
  training_place?: string | null;
  activity_level?: string | null;
  training_days_per_week?: number | null;
  available_days?: string[] | null;
  workout_duration_minutes?: number | null;
  preferred_workout_time?: string | null;
  liked_activities?: string[] | null;
  disliked_activities?: string[] | null;
  sport_details?: Record<string, string | number | string[] | null> | null;
  setup_stage?: number | null;
  completed_at?: string | null;
};

export type AdaptiveNutritionRow = {
  id?: string;
  user_id: string;
  nutrition_goal?: string | null;
  meals_per_day?: number | null;
  preferred_cuisines?: string[] | null;
  liked_foods?: string[] | null;
  disliked_foods?: string[] | null;
  allergy_items?: string[] | null;
  dietary_restrictions?: string[] | null;
  cooking_skill?: string | null;
  max_cooking_time_minutes?: number | null;
  meal_prep_preference?: string | null;
  weekly_food_budget?: number | null;
  budget_currency?: string | null;
  eating_schedule?: string | null;
  supplements?: string[] | null;
  tracks_calories_or_macros?: boolean | null;
};

export type AdaptiveNutritionProfile = {
  nutrition_goal: string;
  meals_per_day: number | null;
  preferred_cuisines: string[];
  liked_foods: string[];
  disliked_foods: string[];
  allergies: string[];
  dietary_restrictions: string[];
  cooking_skill: string;
  max_cooking_time_minutes: number | null;
  meal_prep_preference: string;
  weekly_food_budget: number | null;
  budget_currency: string;
  eating_schedule: string;
  supplements: string[];
  tracks_calories_or_macros: boolean | null;
};

export type AdaptiveFitnessConstraints = {
  injury_or_limitation_labels: string[];
  pain_sensitive_areas: string[];
  movements_to_avoid: string | null;
  discomfort_exercises: string[];
  mobility_limitations: string | null;
  professional_restrictions: string | null;
  legacy_context_notes: string | null;
};

export type AdaptiveOnboardingAnswers = {
  age: number | null;
  gender: string;
  height_cm: number | null;
  weight_kg: number | null;
  goals: GoalId[];
  primary_goal: GoalId | null;
  goal_weight_kg: number | null;
  primary_sport: SportId | null;
  primary_sport_other: string;
  secondary_sports: SportId[];
  training_level: string;
  training_place: string;
  activity_level: string;
  training_days_per_week: number | null;
  available_days: string[];
  workout_duration_minutes: number | null;
  preferred_workout_time: string;
  liked_activities: string[];
  disliked_activities: string[];
  sport_details: Record<string, string | number | string[] | null>;
  nutrition: AdaptiveNutritionProfile;
  constraints: AdaptiveFitnessConstraints;
};

export type OnboardingLoadState = {
  onboarding: "loading" | "loaded" | "none" | "failed";
  nutrition: "loading" | "loaded" | "none" | "failed";
  constraints: "loading" | "loaded" | "none" | "failed";
  permissions: AiPermissionSettingsStatus["state"] | "loading";
};

export type ValidationErrorCode =
  | "age_required"
  | "age_range"
  | "height_range"
  | "weight_range"
  | "goals_required"
  | "primary_goal_required"
  | "primary_goal_invalid"
  | "target_weight_range"
  | "primary_sport_required"
  | "custom_sport_required"
  | "experience_required"
  | "location_required"
  | "activity_required"
  | "training_days_range"
  | "available_days_required"
  | "session_duration_range"
  | "preferred_time_required"
  | "sport_field_required"
  | "nutrition_goal_required"
  | "meal_count_range"
  | "cuisine_required"
  | "cooking_time_range"
  | "budget_range"
  | "budget_currency_required"
  | "permission_load_failed"
  | "permission_loading"
  | "permission_confirmation_required"
  | "permission_settings_required";

export type ValidationIssue = { code: ValidationErrorCode; fieldId?: string };
export type FieldErrors = Record<string, ValidationIssue>;

export function createEmptyAdaptiveOnboarding(): AdaptiveOnboardingAnswers {
  return {
    age: null,
    gender: "",
    height_cm: null,
    weight_kg: null,
    goals: [],
    primary_goal: null,
    goal_weight_kg: null,
    primary_sport: null,
    primary_sport_other: "",
    secondary_sports: [],
    training_level: "",
    training_place: "",
    activity_level: "",
    training_days_per_week: null,
    available_days: [],
    workout_duration_minutes: null,
    preferred_workout_time: "",
    liked_activities: [],
    disliked_activities: [],
    sport_details: {},
    nutrition: {
      nutrition_goal: "",
      meals_per_day: null,
      preferred_cuisines: [],
      liked_foods: [],
      disliked_foods: [],
      allergies: [],
      dietary_restrictions: [],
      cooking_skill: "",
      max_cooking_time_minutes: null,
      meal_prep_preference: "",
      weekly_food_budget: null,
      budget_currency: "",
      eating_schedule: "",
      supplements: [],
      tracks_calories_or_macros: null
    },
    constraints: {
      injury_or_limitation_labels: [],
      pain_sensitive_areas: [],
      movements_to_avoid: null,
      discomfort_exercises: [],
      mobility_limitations: null,
      professional_restrictions: null,
      legacy_context_notes: null
    }
  };
}

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanStringArray(value: unknown) {
  return Array.isArray(value) ? Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean))) : [];
}

function cleanNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function goalIds(value: unknown): GoalId[] {
  return cleanStringArray(value).filter((goal): goal is GoalId => GOAL_OPTIONS.includes(goal as GoalId));
}

function sportIds(value: unknown): SportId[] {
  return cleanStringArray(value).filter((sport): sport is SportId => SPORT_OPTIONS.includes(sport as SportId));
}

export function mergeLoadedAdaptiveOnboarding(input: {
  onboarding: AdaptiveOnboardingRow | null;
  nutrition: AdaptiveNutritionRow | null;
  constraints: Partial<AdaptiveFitnessConstraints> | null;
}): AdaptiveOnboardingAnswers {
  const empty = createEmptyAdaptiveOnboarding();
  const saved = input.onboarding;
  const nutrition = input.nutrition;
  const constraints = input.constraints;
  if (!saved && !nutrition && !constraints) return empty;

  const savedGoals = goalIds(saved?.goals);
  const primaryGoal = GOAL_OPTIONS.includes(saved?.primary_goal as GoalId)
    ? (saved?.primary_goal as GoalId)
    : savedGoals.length === 1
      ? savedGoals[0]
      : null;
  const primarySport = SPORT_OPTIONS.includes(saved?.primary_sport as SportId)
    ? (saved?.primary_sport as SportId)
    : null;

  return {
    ...empty,
    age: cleanNumber(saved?.age),
    gender: cleanString(saved?.gender),
    height_cm: cleanNumber(saved?.height_cm),
    weight_kg: cleanNumber(saved?.weight_kg),
    goals: savedGoals,
    primary_goal: primaryGoal && savedGoals.includes(primaryGoal) ? primaryGoal : null,
    goal_weight_kg: cleanNumber(saved?.goal_weight_kg),
    primary_sport: primarySport,
    primary_sport_other: cleanString(saved?.primary_sport_other),
    secondary_sports: sportIds(saved?.secondary_sports).filter((sport) => sport !== primarySport),
    training_level: cleanString(saved?.training_level),
    training_place: cleanString(saved?.training_place),
    activity_level: cleanString(saved?.activity_level),
    training_days_per_week: cleanNumber(saved?.training_days_per_week),
    available_days: cleanStringArray(saved?.available_days),
    workout_duration_minutes: cleanNumber(saved?.workout_duration_minutes),
    preferred_workout_time: cleanString(saved?.preferred_workout_time),
    liked_activities: cleanStringArray(saved?.liked_activities),
    disliked_activities: cleanStringArray(saved?.disliked_activities),
    sport_details: saved?.sport_details && typeof saved.sport_details === "object" ? { ...saved.sport_details } : {},
    nutrition: {
      nutrition_goal: cleanString(nutrition?.nutrition_goal),
      meals_per_day: cleanNumber(nutrition?.meals_per_day),
      preferred_cuisines: cleanStringArray(nutrition?.preferred_cuisines),
      liked_foods: cleanStringArray(nutrition?.liked_foods),
      disliked_foods: cleanStringArray(nutrition?.disliked_foods),
      allergies: cleanStringArray(nutrition?.allergy_items),
      dietary_restrictions: cleanStringArray(nutrition?.dietary_restrictions),
      cooking_skill: cleanString(nutrition?.cooking_skill),
      max_cooking_time_minutes: cleanNumber(nutrition?.max_cooking_time_minutes),
      meal_prep_preference: cleanString(nutrition?.meal_prep_preference),
      weekly_food_budget: cleanNumber(nutrition?.weekly_food_budget),
      budget_currency: cleanString(nutrition?.budget_currency),
      eating_schedule: cleanString(nutrition?.eating_schedule),
      supplements: cleanStringArray(nutrition?.supplements),
      tracks_calories_or_macros: typeof nutrition?.tracks_calories_or_macros === "boolean" ? nutrition.tracks_calories_or_macros : null
    },
    constraints: {
      injury_or_limitation_labels: cleanStringArray(constraints?.injury_or_limitation_labels),
      pain_sensitive_areas: cleanStringArray(constraints?.pain_sensitive_areas),
      movements_to_avoid: cleanString(constraints?.movements_to_avoid) || null,
      discomfort_exercises: cleanStringArray(constraints?.discomfort_exercises),
      mobility_limitations: cleanString(constraints?.mobility_limitations) || null,
      professional_restrictions: cleanString(constraints?.professional_restrictions) || null,
      legacy_context_notes: cleanString(constraints?.legacy_context_notes) || null
    }
  };
}

export function shouldShowTargetWeight(goals: GoalId[]) {
  return goals.some((goal) => TARGET_WEIGHT_GOALS.has(goal));
}

function validationIssue(code: ValidationErrorCode, fieldId?: string): ValidationIssue {
  return fieldId ? { code, fieldId } : { code };
}

function validateOptionalNumber(
  errors: FieldErrors,
  key: string,
  value: number | null,
  min: number,
  max: number,
  code: ValidationErrorCode
) {
  if (value === null) return;
  if (!Number.isFinite(value) || value < min || value > max) errors[key] = validationIssue(code);
}

function validateSportDetails(answers: AdaptiveOnboardingAnswers, errors: FieldErrors) {
  if (!answers.primary_sport) return;
  for (const field of SPORT_FIELD_CONFIG[answers.primary_sport]) {
    if (field.optional) continue;
    const value = answers.sport_details[field.id];
    const missing = field.type === "tags"
      ? !Array.isArray(value) || value.length === 0
      : field.type === "number"
        ? typeof value !== "number" || !Number.isFinite(value)
        : !cleanString(value);
    if (missing) errors[`sport_details.${field.id}`] = validationIssue("sport_field_required", field.id);
  }
}

export function validateOnboardingSection(
  section: OnboardingSectionIndex,
  answers: AdaptiveOnboardingAnswers,
  options?: { permissionStatus?: AiPermissionSettingsStatus["state"] | "loading"; permissionConfirmed?: boolean; permissions?: AiPermissionConfig }
): FieldErrors {
  const errors: FieldErrors = {};
  if (section === 0 || section === 6) {
    if (answers.age === null) errors.age = validationIssue("age_required");
    else if (!Number.isInteger(answers.age) || answers.age < 16 || answers.age > 100) errors.age = validationIssue("age_range");
    validateOptionalNumber(errors, "height_cm", answers.height_cm, 120, 250, "height_range");
    validateOptionalNumber(errors, "weight_kg", answers.weight_kg, 35, 350, "weight_range");
  }
  if (section === 1 || section === 6) {
    if (answers.goals.length === 0) errors.goals = validationIssue("goals_required");
    if (!answers.primary_goal) errors.primary_goal = validationIssue("primary_goal_required");
    else if (!answers.goals.includes(answers.primary_goal)) errors.primary_goal = validationIssue("primary_goal_invalid");
    if (shouldShowTargetWeight(answers.goals)) validateOptionalNumber(errors, "goal_weight_kg", answers.goal_weight_kg, 35, 350, "target_weight_range");
  }
  if (section === 2 || section === 6) {
    if (!answers.primary_sport) errors.primary_sport = validationIssue("primary_sport_required");
    if (answers.primary_sport === "other" && !answers.primary_sport_other.trim()) errors.primary_sport_other = validationIssue("custom_sport_required");
    if (!answers.training_level) errors.training_level = validationIssue("experience_required");
    if (!answers.training_place) errors.training_place = validationIssue("location_required");
    if (!answers.activity_level) errors.activity_level = validationIssue("activity_required");
    if (answers.training_days_per_week === null || !Number.isInteger(answers.training_days_per_week) || answers.training_days_per_week < 1 || answers.training_days_per_week > 7) errors.training_days_per_week = validationIssue("training_days_range");
    if (answers.available_days.length === 0) errors.available_days = validationIssue("available_days_required");
    if (answers.workout_duration_minutes === null || !Number.isInteger(answers.workout_duration_minutes) || answers.workout_duration_minutes < 10 || answers.workout_duration_minutes > 240) errors.workout_duration_minutes = validationIssue("session_duration_range");
    if (!answers.preferred_workout_time) errors.preferred_workout_time = validationIssue("preferred_time_required");
    validateSportDetails(answers, errors);
  }
  if (section === 3 || section === 6) {
    if (!answers.nutrition.nutrition_goal) errors["nutrition.nutrition_goal"] = validationIssue("nutrition_goal_required");
    if (answers.nutrition.meals_per_day === null || !Number.isInteger(answers.nutrition.meals_per_day) || answers.nutrition.meals_per_day < 1 || answers.nutrition.meals_per_day > 12) errors["nutrition.meals_per_day"] = validationIssue("meal_count_range");
    if (answers.nutrition.preferred_cuisines.length === 0) errors["nutrition.preferred_cuisines"] = validationIssue("cuisine_required");
    validateOptionalNumber(errors, "nutrition.max_cooking_time_minutes", answers.nutrition.max_cooking_time_minutes, 0, 1440, "cooking_time_range");
    validateOptionalNumber(errors, "nutrition.weekly_food_budget", answers.nutrition.weekly_food_budget, 0, 1_000_000, "budget_range");
    if (answers.nutrition.weekly_food_budget !== null && !answers.nutrition.budget_currency) errors["nutrition.budget_currency"] = validationIssue("budget_currency_required");
  }
  if (section === 5 || section === 6) {
    if (options?.permissionStatus === "failed") errors.permissions = validationIssue("permission_load_failed");
    if (options?.permissionStatus === "loading") errors.permissions = validationIssue("permission_loading");
    if (!options?.permissionConfirmed) errors.permission_confirmation = validationIssue("permission_confirmation_required");
    if (!options?.permissions) errors.permissions = validationIssue("permission_settings_required");
  }
  return errors;
}

export function sanitizeAdaptiveOnboarding(answers: AdaptiveOnboardingAnswers): AdaptiveOnboardingAnswers {
  const targetWeight = shouldShowTargetWeight(answers.goals) ? answers.goal_weight_kg : null;
  const allowedSportFields = new Set((answers.primary_sport ? SPORT_FIELD_CONFIG[answers.primary_sport] : []).map((field) => field.id));
  const sportDetails = Object.fromEntries(Object.entries(answers.sport_details).filter(([key, value]) => allowedSportFields.has(key) && value !== "" && value !== null && (!Array.isArray(value) || value.length > 0)));
  return { ...answers, goal_weight_kg: targetWeight, primary_sport_other: answers.primary_sport === "other" ? answers.primary_sport_other.trim() : "", secondary_sports: answers.secondary_sports.filter((sport) => sport !== answers.primary_sport), sport_details: sportDetails, nutrition: { ...answers.nutrition, budget_currency: answers.nutrition.weekly_food_budget === null ? "" : answers.nutrition.budget_currency.trim() } };
}

export function isOnboardingComplete(onboarding: { completed_at?: string | null } | null | undefined) {
  return Boolean(onboarding?.completed_at && !Number.isNaN(Date.parse(onboarding.completed_at)));
}

export function firstInvalidSection(answers: AdaptiveOnboardingAnswers, options: { permissionStatus: AiPermissionSettingsStatus["state"] | "loading"; permissionConfirmed: boolean; permissions: AiPermissionConfig }): OnboardingSectionIndex | null {
  for (let index = 0; index < 6; index += 1) if (Object.keys(validateOnboardingSection(index as OnboardingSectionIndex, answers, options)).length > 0) return index as OnboardingSectionIndex;
  return null;
}
