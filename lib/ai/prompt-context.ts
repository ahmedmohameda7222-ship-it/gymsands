import { energyValue, liquidValue } from "@/lib/dashboard/today-units";
import { getPromptTaskContract, type PromptContextField } from "@/lib/ai/prompt-contracts";
import type { PromptLanguage, QuickPromptContext, QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import type { AiPermissionSection } from "@/types";

export type PromptContextItem = { field: PromptContextField; label: string; value: string };
export type NormalizedTargetState =
  | { state: "available" } | { state: "not-configured" } | { state: "unavailable" } | { state: "loading" };
export type PromptContextPermissionValidation = { valid: boolean; illegalFields: PromptContextField[] };

export const PROMPT_CONTEXT_FIELD_PERMISSIONS: Record<PromptContextField, AiPermissionSection[]> = {
  date: [],
  workout: ["workouts"],
  workout_state: ["workouts"],
  workout_history: ["workouts"],
  nutrition_targets: ["nutrition"],
  nutrition_progress: ["nutrition"],
  meal_plan: ["meal_plans"],
  grocery: ["meal_plans"],
  hydration: ["hydration"],
  recovery: ["wellness"],
  wellness: ["wellness"],
  progress: ["progress"],
  profile_goals: ["profile"],
  profile_training_preferences: ["profile"],
  profile_nutrition_preferences: ["profile"],
  profile_constraints: ["profile"],
  selected_exercise: ["workouts"],
  selected_meal: ["meal_plans"]
};

export function validatePromptContextPermissionContract(definition: QuickPromptDefinition): PromptContextPermissionValidation {
  const declared = new Set(definition.permissionSections);
  const illegalFields = getPromptTaskContract(definition).contextFields.filter((field) =>
    PROMPT_CONTEXT_FIELD_PERMISSIONS[field].some((section) => !declared.has(section))
  );
  return { valid: illegalFields.length === 0, illegalFields };
}

export function assertPromptContextPermissionContract(definition: QuickPromptDefinition) {
  const validation = validatePromptContextPermissionContract(definition);
  if (!validation.valid) throw new Error(`Prompt ${definition.id} declares illegal context fields: ${validation.illegalFields.join(", ")}`);
}

const labels = {
  en: { date: "Date", workout: "Workout", workoutState: "Workout state", history: "Completed workouts", nutritionTargets: "Nutrition targets", calorieBalance: "Calorie balance", proteinBalance: "Protein balance", foodLogs: "Food logs", mealPlan: "Saved meal-plan items", grocery: "Saved grocery items", hydration: "Hydration balance", recovery: "Recovery context", wellness: "Wellness tracking", progress: "Progress entries", goals: "Saved goals", trainingPreferences: "Training preferences", nutritionPreferences: "Nutrition preferences", constraints: "Physical constraints", exercise: "Selected exercise", meal: "Selected meal", active: "active", completed: "completed", scheduled: "scheduled", notScheduled: "not scheduled", remaining: "remaining", above: "above target", unavailable: "unavailable", available: "available", notConfigured: "not configured", minutes: "minutes", items: "items", logs: "logs", entries: "entries", habits: "habits", supplements: "supplements", hoursSleep: "hours sleep", lowRecovery: "low recovery or high fatigue" },
  de: { date: "Datum", workout: "Training", workoutState: "Trainingsstatus", history: "Abgeschlossene Trainings", nutritionTargets: "Ernährungsziele", calorieBalance: "Kalorienbilanz", proteinBalance: "Proteinbilanz", foodLogs: "Ernährungsprotokolle", mealPlan: "Gespeicherte Mahlzeiten", grocery: "Gespeicherte Einkaufsartikel", hydration: "Flüssigkeitsbilanz", recovery: "Erholungskontext", wellness: "Wohlbefinden-Tracking", progress: "Fortschrittseinträge", goals: "Gespeicherte Ziele", trainingPreferences: "Trainingspräferenzen", nutritionPreferences: "Ernährungspräferenzen", constraints: "Körperliche Einschränkungen", exercise: "Ausgewählte Übung", meal: "Ausgewählte Mahlzeit", active: "aktiv", completed: "abgeschlossen", scheduled: "geplant", notScheduled: "nicht geplant", remaining: "verbleibend", above: "über dem Ziel", unavailable: "nicht verfügbar", available: "verfügbar", notConfigured: "nicht eingerichtet", minutes: "Minuten", items: "Elemente", logs: "Protokolle", entries: "Einträge", habits: "Gewohnheiten", supplements: "Supplemente", hoursSleep: "Stunden Schlaf", lowRecovery: "niedrige Erholung oder hohe Müdigkeit" },
  ar: { date: "التاريخ", workout: "التمرين", workoutState: "حالة التمرين", history: "التمارين المكتملة", nutritionTargets: "أهداف التغذية", calorieBalance: "رصيد السعرات", proteinBalance: "رصيد البروتين", foodLogs: "سجلات الطعام", mealPlan: "وجبات الخطة المحفوظة", grocery: "عناصر التسوق المحفوظة", hydration: "رصيد الترطيب", recovery: "سياق التعافي", wellness: "تتبع العافية", progress: "سجلات التقدم", goals: "الأهداف المحفوظة", trainingPreferences: "تفضيلات التدريب", nutritionPreferences: "تفضيلات التغذية", constraints: "القيود البدنية", exercise: "التمرين المحدد", meal: "الوجبة المحددة", active: "نشط", completed: "مكتمل", scheduled: "مجدول", notScheduled: "غير مجدول", remaining: "متبقٍ", above: "فوق الهدف", unavailable: "غير متاحة", available: "متاحة", notConfigured: "غير مُعدّة", minutes: "دقيقة", items: "عناصر", logs: "سجلات", entries: "سجلات", habits: "عادات", supplements: "مكملات", hoursSleep: "ساعات نوم", lowRecovery: "تعافٍ منخفض أو إرهاق مرتفع" }
} as const;

function locale(language: PromptLanguage) { return language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US"; }
function numberText(input: number, language: PromptLanguage, digits = 1) { return new Intl.NumberFormat(locale(language), { maximumFractionDigits: digits }).format(input); }
function energy(kcal: number, unit: "kcal" | "kJ", language: PromptLanguage) { return `${numberText(energyValue(Math.abs(kcal), unit), language, 0)} ${unit}`; }
function liquid(ml: number, unit: "ml" | "oz", language: PromptLanguage) { return `${numberText(liquidValue(Math.abs(ml), unit), language, 1)} ${unit === "oz" ? (language === "ar" ? "أونصة سائلة" : "oz") : language === "ar" ? "مل" : "ml"}`; }
function balance(raw: number, formatted: string, language: PromptLanguage) { return `${formatted} ${raw < 0 ? labels[language].above : labels[language].remaining}`; }
function add(items: PromptContextItem[], field: PromptContextField, label: string, valueText?: string | null) { if (valueText?.trim()) items.push({ field, label, value: valueText.trim() }); }

export function normalizeNutritionTargetState(context: QuickPromptContext): NormalizedTargetState {
  const nutrition = context.nutrition;
  if (nutrition?.targetsState === "loaded") return nutrition.hasTargets === true ? { state: "available" } : { state: "not-configured" };
  if (nutrition?.targetsState === "failed") return { state: "unavailable" };
  return { state: "loading" };
}

function permissionCompatibleFields(definition: QuickPromptDefinition) {
  const declared = new Set(definition.permissionSections);
  return getPromptTaskContract(definition).contextFields.filter((field) =>
    PROMPT_CONTEXT_FIELD_PERMISSIONS[field].every((section) => declared.has(section))
  );
}

export function buildPromptContextItems(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage): PromptContextItem[] {
  const copy = labels[language];
  const items: PromptContextItem[] = [];
  const targetState = normalizeNutritionTargetState(context);
  for (const field of permissionCompatibleFields(definition)) {
    if (field === "date") add(items, field, copy.date, context.today);
    if (field === "workout") {
      add(items, field, copy.workout, context.workout?.title);
      if (typeof context.workout?.exerciseCount === "number") add(items, field, copy.workout, `${numberText(context.workout.exerciseCount, language, 0)} ${copy.items}`);
      if (typeof context.workout?.durationMinutes === "number") add(items, field, copy.workout, `${numberText(context.workout.durationMinutes, language, 0)} ${copy.minutes}`);
    }
    if (field === "workout_state" && context.workout) add(items, field, copy.workoutState, context.workout.active ? copy.active : context.workout.completed ? copy.completed : context.workout.scheduled ? copy.scheduled : copy.notScheduled);
    if (field === "workout_history" && typeof context.workout?.historyCount === "number") add(items, field, copy.history, `${numberText(context.workout.historyCount, language, 0)} ${copy.entries}`);
    if (field === "nutrition_targets") {
      if (targetState.state === "available") add(items, field, copy.nutritionTargets, copy.available);
      if (targetState.state === "not-configured") add(items, field, copy.nutritionTargets, copy.notConfigured);
      if (targetState.state === "unavailable") add(items, field, copy.nutritionTargets, copy.unavailable);
    }
    if (field === "nutrition_progress") {
      const nutrition = context.nutrition;
      if (nutrition?.foodLogsState === "failed") add(items, field, copy.foodLogs, copy.unavailable);
      if (nutrition?.foodLogsState === "loaded") {
        if (typeof nutrition.foodLogCount === "number") add(items, field, copy.foodLogs, `${numberText(nutrition.foodLogCount, language, 0)} ${copy.logs}`);
        if (targetState.state === "available") {
          const unit = context.units?.energy ?? "kcal";
          if (typeof nutrition.remainingCalories === "number") add(items, field, copy.calorieBalance, balance(nutrition.remainingCalories, energy(nutrition.remainingCalories, unit, language), language));
          if (typeof nutrition.remainingProtein === "number") add(items, field, copy.proteinBalance, balance(nutrition.remainingProtein, `${numberText(Math.abs(nutrition.remainingProtein), language, 1)} ${language === "ar" ? "غ" : "g"}`, language));
        }
      }
    }
    if (field === "meal_plan" && typeof context.nutrition?.mealPlanCount === "number") add(items, field, copy.mealPlan, `${numberText(context.nutrition.mealPlanCount, language, 0)} ${copy.items}`);
    if (field === "grocery") {
      if (context.grocery?.state === "failed") add(items, field, copy.grocery, copy.unavailable);
      if (context.grocery?.state === "loaded" && typeof context.grocery.itemCount === "number") add(items, field, copy.grocery, `${numberText(context.grocery.itemCount, language, 0)} ${copy.items}`);
    }
    if (field === "hydration") {
      if (context.hydration?.state === "failed") add(items, field, copy.hydration, copy.unavailable);
      if (context.hydration?.state === "loaded" && typeof context.hydration.remainingMl === "number") {
        const unit = context.units?.liquid ?? "ml";
        add(items, field, copy.hydration, balance(context.hydration.remainingMl, liquid(context.hydration.remainingMl, unit, language), language));
      }
    }
    if (field === "recovery") {
      if (context.recovery?.state === "failed") add(items, field, copy.recovery, copy.unavailable);
      if (context.recovery?.state === "loaded" && context.recovery.hasData) {
        const parts: string[] = [];
        if (typeof context.recovery.sleepHours === "number") parts.push(`${numberText(context.recovery.sleepHours, language, 1)} ${copy.hoursSleep}`);
        if (context.recovery.poorRecovery) parts.push(copy.lowRecovery);
        add(items, field, copy.recovery, parts.join(" · "));
      }
    }
    if (field === "wellness") {
      if (context.wellness?.state === "failed") add(items, field, copy.wellness, copy.unavailable);
      if (context.wellness?.state === "loaded") {
        const parts: string[] = [];
        if (typeof context.wellness.habitCount === "number") parts.push(`${numberText(context.wellness.habitCount, language, 0)} ${copy.habits}`);
        if (typeof context.wellness.supplementCount === "number") parts.push(`${numberText(context.wellness.supplementCount, language, 0)} ${copy.supplements}`);
        add(items, field, copy.wellness, parts.join(" · "));
      }
    }
    if (field === "progress") {
      if (context.progress?.state === "failed") add(items, field, copy.progress, copy.unavailable);
      if (context.progress?.state === "loaded" && typeof context.progress.entryCount === "number") add(items, field, copy.progress, `${numberText(context.progress.entryCount, language, 0)} ${copy.entries}`);
    }
    if (field === "profile_goals" && context.profile?.state === "loaded" && context.profile.hasGoals) add(items, field, copy.goals, copy.available);
    if (field === "profile_training_preferences" && context.profile?.state === "loaded" && context.profile.hasTrainingPreferences) add(items, field, copy.trainingPreferences, copy.available);
    if (field === "profile_nutrition_preferences" && context.profile?.state === "loaded" && context.profile.hasNutritionPreferences) add(items, field, copy.nutritionPreferences, copy.available);
    if (field === "profile_constraints" && context.profile?.state === "loaded" && context.profile.hasConstraints) add(items, field, copy.constraints, copy.available);
    if (field === "selected_exercise") add(items, field, copy.exercise, context.selection?.exercise);
    if (field === "selected_meal") add(items, field, copy.meal, context.selection?.meal);
  }
  return items;
}

export type { PromptContextField } from "@/lib/ai/prompt-contracts";
