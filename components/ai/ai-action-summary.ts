import type { AiActionRequest, AiActionType } from "@/types";

type UnknownRecord = Record<string, unknown>;

export type AiActionSummaryRow = {
  label: string;
  value: string;
};

export type AiActionPresentation = {
  label: string;
  description: string;
  goal: string;
};

const presentations: Record<AiActionType, AiActionPresentation> = {
  replace_exercise: { label: "Replace exercise", description: "Find a practical alternative for the current exercise.", goal: "Suggest a suitable replacement" },
  adjust_next_workout: { label: "Adjust next workout", description: "Review the next workout and recommend a sensible change.", goal: "Adjust the next workout" },
  rebalance_week: { label: "Rebalance this week", description: "Review the remaining week without changing it automatically.", goal: "Rebalance the training week" },
  review_workout_session: { label: "Review workout", description: "Review the completed work and explain useful next steps.", goal: "Review this workout" },
  adjust_for_low_readiness: { label: "Make today lighter", description: "Adapt today to current readiness and recovery.", goal: "Make today’s workout lighter" },
  explain_progression: { label: "Explain progression", description: "Explain the next target using saved performance.", goal: "Explain the next progression step" },
  reduce_workout_volume: { label: "Reduce volume", description: "Suggest which sets or exercises to reduce today.", goal: "Reduce today’s workout volume" },
  reduce_workout_intensity: { label: "Reduce intensity", description: "Suggest a lower-intensity version of today’s work.", goal: "Reduce today’s workout intensity" },
  recovery_workout: { label: "Recovery workout", description: "Suggest a recovery-focused version of today’s plan.", goal: "Create a recovery-focused version" },
  reduce_next_session: { label: "Reduce next session", description: "Suggest a more manageable next training session.", goal: "Make the next session more manageable" },
  regenerate_meal: { label: "Replace meal", description: "Suggest a practical replacement for this meal.", goal: "Replace this meal" },
  make_meal_cheaper: { label: "Make it cheaper", description: "Suggest a lower-cost version using saved preferences.", goal: "Make this meal or list cheaper" },
  make_meal_faster: { label: "Make it faster", description: "Suggest a quicker version using saved cooking preferences.", goal: "Make this meal faster" },
  make_meal_higher_protein: { label: "More protein", description: "Suggest a practical higher-protein version.", goal: "Increase protein in this meal" },
  replace_meal_ingredient: { label: "Replace ingredient", description: "Suggest an ingredient swap that respects saved preferences.", goal: "Replace one ingredient" },
  make_meal_dairy_free: { label: "Make dairy-free", description: "Suggest a dairy-free version with updated nutrition values.", goal: "Make this meal dairy-free" },
  make_meal_gluten_free: { label: "Make gluten-free", description: "Suggest a gluten-free version with updated nutrition values.", goal: "Make this meal gluten-free" },
  make_meal_cuisine: { label: "Change cuisine", description: "Adapt the meal to the selected cuisine and saved preferences.", goal: "Adapt this meal’s cuisine" },
  build_grocery_list: { label: "Build ingredient list", description: "Turn planned meals into an ingredient-level shopping list.", goal: "Build a practical ingredient list" },
  review_week: { label: "Review week", description: "Review training, meals, hydration, and recovery for small improvements.", goal: "Review this week and suggest small practical improvements" }
};

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
  return presentations[actionType];
}

export function buildAiActionSummary(actionType: AiActionType, context: UnknownRecord): AiActionSummaryRow[] {
  const presentation = getAiActionPresentation(actionType);
  const workoutDay = record(context.workout_day);
  const plan = record(context.plan ?? context.workout_plan);
  const activeExercise = record(context.active_exercise);
  const meal = record(context.meal_item);
  const readiness = record(context.readiness);
  const estimate = record(readiness.estimate);

  const rows: AiActionSummaryRow[] = [];
  const workout = text(workoutDay.name, workoutDay.day_name, context.workout_name, plan.name);
  const exercise = text(activeExercise.exercise_name, activeExercise.name, context.exercise_name);
  const mealName = text(meal.food_name, meal.name, context.meal_name);
  const mealType = text(meal.meal_type, context.meal_type);
  const reason = text(context.replacement_reason, context.reason);
  const readinessValue = text(readiness.morning_checkin, estimate.label, estimate.value);

  if (workout) rows.push({ label: "Workout", value: workout });
  if (exercise) rows.push({ label: "Exercise", value: exercise });
  if (reason) rows.push({ label: "Reason", value: friendly(reason) });
  if (readinessValue && actionType.includes("readiness")) rows.push({ label: "Today’s readiness", value: friendly(readinessValue) });
  if (mealName) rows.push({ label: "Meal", value: mealName });
  if (mealType) rows.push({ label: "Meal type", value: friendly(mealType) });
  if (actionType === "build_grocery_list") {
    const weekStart = text(context.week_start);
    if (weekStart) rows.push({ label: "Week", value: weekStart });
  }
  rows.push({ label: "Goal", value: presentation.goal });
  return rows.slice(0, 5);
}

export function buildChatGptActionPrompt(
  request: Pick<AiActionRequest, "action_type" | "context_json" | "user_note">,
  presentation = getAiActionPresentation(request.action_type)
) {
  const summary = buildAiActionSummary(request.action_type, request.context_json);
  const details = summary.map((row) => `${row.label}: ${row.value}.`);
  return [
    "Please help me with this Plaivra request:",
    ...details,
    request.user_note ? `My note: ${request.user_note.trim()}` : null,
    presentation.description,
    "Please explain your recommendation first. Do not change anything in Plaivra unless I approve it."
  ].filter(Boolean).join("\n\n");
}
