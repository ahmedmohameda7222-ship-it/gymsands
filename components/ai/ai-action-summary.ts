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
  build_meal_plan: { label: "Import meal plan", description: "Discuss a personalized meal plan, approve the final version, then import it into Plaivra.", goal: "Create an approved meal plan for Plaivra" },
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
  if (request.action_type === "build_meal_plan") {
    const context = record(request.context_json);
    const planning = record(context.planning_profile);
    const nutrition = record(context.nutrition_preference_profile);
    const list = (value: unknown) => Array.isArray(value) && value.length ? value.join(", ") : "Not specified";
    const value = (...values: unknown[]) => text(...values) || "Not specified";
    return [
      "Act as a practical, evidence-informed meal-planning assistant. Help me discuss and refine a meal plan before anything is imported into Plaivra.",
      "MY PLANNING CONTEXT",
      `Goal: ${value(planning.goal)}.`,
      `Goal weight: ${value(planning.goal_weight_kg)}${planning.goal_weight_kg ? " kg" : ""}.`,
      `Training schedule: ${value(planning.training_days_per_week)} days per week, ${value(planning.session_duration)} minutes per session, for ${value(planning.plan_duration_weeks)} weeks.`,
      `Nutrition preferences: ${list(planning.nutrition_preferences)}.`,
      `Food preferences: ${value(planning.food_preferences, list(nutrition.preferred_cuisines))}.`,
      `Disliked foods: ${list(nutrition.disliked_foods)}.`,
      `Allergies or limitations: ${value(planning.allergies_limitations, nutrition.allergies)}.`,
      `Lifestyle constraints: ${value(planning.lifestyle_notes)}.`,
      `Workout constraints: ${value(planning.workout_constraints)}.`,
      `Other coaching context: ${value(planning.coaching_notes)}.`,
      `Cooking and shopping context: budget ${value(nutrition.weekly_food_budget)} ${value(nutrition.budget_currency)}, maximum cooking time ${value(nutrition.max_cooking_time_minutes)} minutes, kitchen equipment ${list(nutrition.kitchen_equipment)}.`,
      "First ask any essential questions and explain your recommendation. Do not finalize or import a plan until I explicitly approve it.",
      "For the approved final plan, provide each meal with: day or date, meal type, food name, serving or quantity, calories, protein, carbohydrates, fat, and practical notes. Keep totals realistic and internally consistent.",
      "After I approve the final version, use the Plaivra connection to import only that approved plan. Do not alter any other Plaivra data.",
      request.user_note ? `My additional note: ${request.user_note.trim()}` : null
    ].filter(Boolean).join("\n\n");
  }
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
