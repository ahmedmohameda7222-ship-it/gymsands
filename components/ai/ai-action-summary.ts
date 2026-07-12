import {
  AI_ACTION_REGISTRY,
  isAiActionWriteCapable as isRegisteredAiActionWriteCapable,
  type AiActionRegistryEntry
} from "@/lib/ai/action-registry";
import type { AiActionType } from "@/types";

type UnknownRecord = Record<string, unknown>;

export type AiActionSummaryRow = {
  label: string;
  value: string;
};

export type AiActionPresentation = Pick<
  AiActionRegistryEntry,
  "label" | "description" | "goal" | "accessArea"
>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function friendly(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getAiActionPresentation(actionType: AiActionType) {
  return AI_ACTION_REGISTRY[actionType];
}

export function isAiActionWriteCapable(actionType: AiActionType) {
  return isRegisteredAiActionWriteCapable(actionType);
}

function safeObjectNames(value: unknown, keys: string[], limit = 3) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const item = record(entry);
      return text(...keys.map((key) => item[key]));
    })
    .filter(Boolean)
    .slice(0, limit);
}

export function buildAiActionSummary(actionType: AiActionType, context: UnknownRecord): AiActionSummaryRow[] {
  const presentation = getAiActionPresentation(actionType);
  const workoutDay = record(context.workout_day);
  const plan = record(context.plan ?? context.workout_plan);
  const activeExercise = record(context.active_exercise);
  const meal = record(context.meal_item);
  const readiness = record(context.readiness);
  const estimate = record(readiness.estimate);
  const planningProfile = record(context.planning_profile);
  const savedMacros = record(context.saved_macros);

  const rows: AiActionSummaryRow[] = [];
  const workout = text(workoutDay.name, workoutDay.day_name, context.workout_name, plan.name);
  const exercise = text(activeExercise.exercise_name, activeExercise.name, context.exercise_name);
  const plannedSets = text(activeExercise.planned_sets, activeExercise.sets, context.planned_sets);
  const repTarget = text(activeExercise.planned_reps, activeExercise.reps, context.rep_target);
  const mealName = text(meal.food_name, meal.name, context.meal_name);
  const mealType = text(meal.meal_type, context.meal_type);
  const selectedDate = text(context.date, context.selected_date, meal.plan_date, context.requested_start_date);
  const reason = text(context.replacement_reason, context.reason);
  const readinessValue = text(readiness.morning_checkin, estimate.label, estimate.value);
  const relevantGoal = text(context.relevant_goal, context.goal, planningProfile.goal);
  const sourceDescription = text(context.source_description);
  const weekStart = text(context.week_start);
  const weekEnd = text(context.week_end);
  const groceryNames = safeObjectNames(context.grocery_items, ["item_name", "name"]);
  const plannedMealNames = safeObjectNames(context.meal_plan_items, ["food_name", "name"]);
  const calorieValue = text(savedMacros.calories);
  const proteinValue = text(savedMacros.protein_g, savedMacros.protein);

  if (workout) rows.push({ label: "Workout", value: workout });
  if (exercise) rows.push({ label: "Exercise", value: exercise });
  if (plannedSets) rows.push({ label: "Planned sets", value: plannedSets });
  if (repTarget) rows.push({ label: "Rep target", value: repTarget });
  if (reason) rows.push({ label: "Reason", value: friendly(reason) });
  if (readinessValue && actionType.includes("readiness")) rows.push({ label: "Today’s readiness", value: friendly(readinessValue) });
  if (mealName) rows.push({ label: "Meal", value: mealName });
  if (mealType) rows.push({ label: "Meal type", value: friendly(mealType) });
  if (selectedDate) rows.push({ label: "Date", value: selectedDate });
  if (calorieValue || proteinValue) {
    rows.push({
      label: "Saved nutrition",
      value: [calorieValue ? `${calorieValue} kcal` : "", proteinValue ? `${proteinValue} g protein` : ""].filter(Boolean).join(", ")
    });
  }
  if (weekStart) rows.push({ label: weekEnd ? "Grocery week" : "Week", value: weekEnd ? `${weekStart} to ${weekEnd}` : weekStart });
  if (groceryNames.length) rows.push({ label: "Current grocery items", value: groceryNames.join(", ") });
  if (plannedMealNames.length) rows.push({ label: "Planned meals", value: plannedMealNames.join(", ") });
  if (relevantGoal && relevantGoal.toLowerCase() !== presentation.goal.toLowerCase()) rows.push({ label: "Relevant goal", value: relevantGoal });
  if (sourceDescription) rows.push({ label: "Source", value: sourceDescription });
  rows.push({ label: "Goal", value: presentation.goal });
  return rows.slice(0, 8);
}

export function buildChatGptActionPrompt(
  actionType: AiActionType,
  context: UnknownRecord,
  userNote?: string | null
) {
  const presentation = getAiActionPresentation(actionType);
  const summary = buildAiActionSummary(actionType, context);
  const details = summary.map((row) => `- ${row.label}: ${row.value}`);
  const writeInstruction = isAiActionWriteCapable(actionType)
    ? "Show the proposed structured changes and do not save anything until I explicitly confirm. After confirmation, use the appropriate Plaivra tools and do not claim success until the tool confirms it."
    : "Explain the result and do not change any Plaivra data.";

  return [
    "Connect to my Plaivra account for this request.",
    `Request: ${presentation.goal}.`,
    "Context:",
    ...details,
    userNote?.trim() ? `Additional instruction: ${userNote.trim()}` : null,
    `Use only the minimum authorized ${presentation.accessArea} context needed for this task. Do not ask me to repeat information already included above or available in the relevant authorized Plaivra context.`,
    presentation.description,
    writeInstruction,
    "Do not expose internal records, raw objects, or unrelated Plaivra data."
  ].filter(Boolean).join("\n");
}
