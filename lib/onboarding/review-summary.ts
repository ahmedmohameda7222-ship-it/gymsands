import { SPORT_FIELD_CONFIG, type AdaptiveOnboardingAnswers, type GoalId, type SportId } from "@/lib/onboarding/adaptive-profile";
import type { AiPermissionConfig } from "@/services/database/ai-permissions";
import type { AiPermissionSection } from "@/types";

export type ReviewRow = { label: string; value: string };
export type ReviewSection = { id: "basic" | "goals" | "training" | "nutrition" | "constraints" | "permissions"; title: string; step: 0 | 1 | 2 | 3 | 4 | 5; rows: ReviewRow[] };

export type ReviewText = {
  noValue: string;
  noneSelected: string;
  yes: string;
  no: string;
  full: string;
  custom: string;
  read: string;
  readWrite: string;
  primarySport: string;
  secondarySports: string;
  primaryGoal: string;
  goals: string;
  targetWeight: string;
  age: string;
  sex: string;
  height: string;
  currentWeight: string;
  experienceLevel: string;
  trainingLocation: string;
  activityLevel: string;
  daysPerWeek: string;
  availableDays: string;
  sessionDuration: string;
  preferredTime: string;
  likedActivities: string;
  dislikedActivities: string;
  nutritionGoal: string;
  mealsPerDay: string;
  preferredCuisines: string;
  foodsLiked: string;
  foodsDisliked: string;
  allergies: string;
  restrictions: string;
  cookingAbility: string;
  cookingTime: string;
  mealPrep: string;
  weeklyBudget: string;
  eatingSchedule: string;
  supplements: string;
  tracksMacros: string;
  injuries: string;
  painAreas: string;
  movementsAvoid: string;
  discomfortExercises: string;
  mobilityLimits: string;
  professionalRestrictions: string;
  retainedNotes: string;
  accessMode: string;
  basicSummary: string;
  goalsSummary: string;
  trainingSummary: string;
  nutritionSummary: string;
  constraintsSummary: string;
  permissionsSummary: string;
};

type ReviewLabels = {
  text: ReviewText;
  goalLabel: (goal: GoalId) => string;
  sportLabel: (sport: SportId) => string;
  optionLabel: (value: string) => string;
  fieldLabel: (id: string, fallback: string) => string;
  dayLabel: (day: string) => string;
  permissionLabel: (section: AiPermissionSection) => string;
};

function row(label: string, value: string | null | undefined): ReviewRow | null {
  const clean = value?.trim();
  return clean ? { label, value: clean } : null;
}

function compact(rows: Array<ReviewRow | null>): ReviewRow[] {
  return rows.filter((item): item is ReviewRow => Boolean(item));
}

function list(value: string[], map: (item: string) => string = (item) => item) {
  return value.length ? value.map(map).join(", ") : "";
}

export function formatReviewWeight(valueKg: number | null, unit: "kg" | "lb") {
  if (valueKg === null) return "";
  const value = unit === "lb" ? Math.round(valueKg * 2.2046226218 * 10) / 10 : Math.round(valueKg * 10) / 10;
  return `${value} ${unit}`;
}

export function formatReviewHeight(valueCm: number | null, unit: "cm" | "ft-in") {
  if (valueCm === null) return "";
  if (unit === "cm") return `${Math.round(valueCm * 10) / 10} cm`;
  const totalInches = Math.round(valueCm / 2.54);
  return `${Math.floor(totalInches / 12)}′ ${totalInches % 12}″`;
}

export function buildOnboardingReviewSections(input: {
  answers: AdaptiveOnboardingAnswers;
  permissions: AiPermissionConfig;
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "ft-in";
  labels: ReviewLabels;
}): ReviewSection[] {
  const { answers, permissions, weightUnit, heightUnit, labels } = input;
  const t = labels.text;
  const primarySport = answers.primary_sport === "other"
    ? answers.primary_sport_other
    : answers.primary_sport
      ? labels.sportLabel(answers.primary_sport)
      : "";
  const sportDefinitions = answers.primary_sport ? SPORT_FIELD_CONFIG[answers.primary_sport] : [];
  const sportRows = sportDefinitions.map((definition) => {
    const value = answers.sport_details[definition.id];
    const display = Array.isArray(value)
      ? list(value, labels.optionLabel)
      : typeof value === "string"
        ? labels.optionLabel(value)
        : typeof value === "number"
          ? `${value}${definition.unit ? ` ${definition.unit}` : ""}`
          : "";
    return row(labels.fieldLabel(definition.id, definition.label), display);
  });

  const nutrition = answers.nutrition;
  const constraints = answers.constraints;
  const permissionRows: ReviewRow[] = permissions.accessMode === "full"
    ? [{ label: t.accessMode, value: t.full }]
    : compact([
        row(t.accessMode, t.custom),
        ...Object.entries(permissions.sections).map(([section, permission]) => {
          if (!permission.read && !permission.write) return null;
          return row(labels.permissionLabel(section as AiPermissionSection), permission.write ? t.readWrite : t.read);
        })
      ]);

  return [
    {
      id: "basic",
      title: t.basicSummary,
      step: 0,
      rows: compact([
        row(t.age, answers.age === null ? "" : String(answers.age)),
        row(t.sex, answers.gender ? labels.optionLabel(answers.gender) : ""),
        row(t.height, formatReviewHeight(answers.height_cm, heightUnit)),
        row(t.currentWeight, formatReviewWeight(answers.weight_kg, weightUnit))
      ])
    },
    {
      id: "goals",
      title: t.goalsSummary,
      step: 1,
      rows: compact([
        row(t.goals, list(answers.goals, (goal) => labels.goalLabel(goal as GoalId))),
        row(t.primaryGoal, answers.primary_goal ? labels.goalLabel(answers.primary_goal) : ""),
        row(t.targetWeight, formatReviewWeight(answers.goal_weight_kg, weightUnit))
      ])
    },
    {
      id: "training",
      title: t.trainingSummary,
      step: 2,
      rows: compact([
        row(t.primarySport, primarySport),
        row(t.secondarySports, list(answers.secondary_sports, (sport) => labels.sportLabel(sport as SportId))),
        row(t.experienceLevel, labels.optionLabel(answers.training_level)),
        row(t.trainingLocation, labels.optionLabel(answers.training_place)),
        row(t.activityLevel, labels.optionLabel(answers.activity_level)),
        row(t.daysPerWeek, answers.training_days_per_week === null ? "" : String(answers.training_days_per_week)),
        row(t.availableDays, list(answers.available_days, labels.dayLabel)),
        row(t.sessionDuration, answers.workout_duration_minutes === null ? "" : `${answers.workout_duration_minutes} min`),
        row(t.preferredTime, labels.optionLabel(answers.preferred_workout_time)),
        row(t.likedActivities, list(answers.liked_activities)),
        row(t.dislikedActivities, list(answers.disliked_activities)),
        ...sportRows
      ])
    },
    {
      id: "nutrition",
      title: t.nutritionSummary,
      step: 3,
      rows: compact([
        row(t.nutritionGoal, labels.optionLabel(nutrition.nutrition_goal)),
        row(t.mealsPerDay, nutrition.meals_per_day === null ? "" : String(nutrition.meals_per_day)),
        row(t.preferredCuisines, list(nutrition.preferred_cuisines, labels.optionLabel)),
        row(t.foodsLiked, list(nutrition.liked_foods)),
        row(t.foodsDisliked, list(nutrition.disliked_foods)),
        row(t.allergies, list(nutrition.allergies)),
        row(t.restrictions, list(nutrition.dietary_restrictions)),
        row(t.cookingAbility, labels.optionLabel(nutrition.cooking_skill)),
        row(t.cookingTime, nutrition.max_cooking_time_minutes === null ? "" : `${nutrition.max_cooking_time_minutes} min`),
        row(t.mealPrep, labels.optionLabel(nutrition.meal_prep_preference)),
        row(t.weeklyBudget, nutrition.weekly_food_budget === null ? "" : `${nutrition.weekly_food_budget} ${nutrition.budget_currency}`.trim()),
        row(t.eatingSchedule, nutrition.eating_schedule),
        row(t.supplements, list(nutrition.supplements)),
        row(t.tracksMacros, nutrition.tracks_calories_or_macros === null ? "" : nutrition.tracks_calories_or_macros ? t.yes : t.no)
      ])
    },
    {
      id: "constraints",
      title: t.constraintsSummary,
      step: 4,
      rows: compact([
        row(t.injuries, list(constraints.injury_or_limitation_labels)),
        row(t.painAreas, list(constraints.pain_sensitive_areas)),
        row(t.movementsAvoid, constraints.movements_to_avoid),
        row(t.discomfortExercises, list(constraints.discomfort_exercises)),
        row(t.mobilityLimits, constraints.mobility_limitations),
        row(t.professionalRestrictions, constraints.professional_restrictions),
        row(t.retainedNotes, constraints.legacy_context_notes)
      ])
    },
    { id: "permissions", title: t.permissionsSummary, step: 5, rows: permissionRows }
  ];
}
