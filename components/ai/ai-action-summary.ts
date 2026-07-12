import type { AiActionType } from "@/types";

type UnknownRecord = Record<string, unknown>;

export type AiActionSummaryRow = {
  label: string;
  value: string;
};

export type AiActionPresentation = {
  label: string;
  description: string;
  goal: string;
  accessArea: "workouts" | "nutrition" | "meal plans" | "wellness" | "progress";
};

const presentations: Record<AiActionType, AiActionPresentation> = {
  build_meal_plan: {
    label: "Create meal plan with ChatGPT",
    description: "Use my authorized Plaivra nutrition context to create and save a structured meal plan.",
    goal: "Create a realistic meal plan and save it to Plaivra",
    accessArea: "meal plans"
  },
  replace_exercise: { label: "Replace exercise", description: "Find and save a practical alternative for the current exercise.", goal: "Replace this exercise", accessArea: "workouts" },
  adjust_next_workout: { label: "Adjust next workout", description: "Review the next workout and save the requested adjustment.", goal: "Adjust the next workout", accessArea: "workouts" },
  rebalance_week: { label: "Rebalance this week", description: "Review the remaining training week and save the requested changes.", goal: "Rebalance the training week", accessArea: "workouts" },
  review_workout_session: { label: "Review workout", description: "Review the completed work and explain useful next steps.", goal: "Review this workout", accessArea: "workouts" },
  adjust_for_low_readiness: { label: "Make today lighter", description: "Use my authorized training context to adapt today to my current readiness.", goal: "Make today’s workout lighter", accessArea: "workouts" },
  explain_progression: { label: "Explain progression", description: "Explain the next target using my saved performance.", goal: "Explain the next progression step", accessArea: "progress" },
  reduce_workout_volume: { label: "Reduce volume", description: "Reduce the requested sets or exercises and save the update.", goal: "Reduce today’s workout volume", accessArea: "workouts" },
  reduce_workout_intensity: { label: "Reduce intensity", description: "Create a lower-intensity version and save the requested update.", goal: "Reduce today’s workout intensity", accessArea: "workouts" },
  recovery_workout: { label: "Recovery workout", description: "Create a recovery-focused version that respects my authorized fitness constraints.", goal: "Create a recovery-focused workout", accessArea: "workouts" },
  reduce_next_session: { label: "Reduce next session", description: "Make the next session more manageable and save the requested change.", goal: "Reduce the next training session", accessArea: "workouts" },
  regenerate_meal: { label: "Replace meal", description: "Create and save a practical replacement for this planned meal.", goal: "Replace this meal", accessArea: "meal plans" },
  make_meal_cheaper: { label: "Make it cheaper", description: "Use my authorized budget and food preferences to create a lower-cost version.", goal: "Make this meal or list cheaper", accessArea: "nutrition" },
  make_meal_faster: { label: "Make it faster", description: "Use my authorized cooking preferences to create a quicker version.", goal: "Make this meal faster", accessArea: "nutrition" },
  make_meal_higher_protein: { label: "More protein", description: "Create a realistic higher-protein version and save it when requested.", goal: "Increase protein in this meal", accessArea: "nutrition" },
  replace_meal_ingredient: { label: "Replace ingredient", description: "Create an ingredient swap that respects my authorized preferences.", goal: "Replace one ingredient", accessArea: "meal plans" },
  make_meal_dairy_free: { label: "Make dairy-free", description: "Create a dairy-free version with updated nutrition values.", goal: "Make this meal dairy-free", accessArea: "meal plans" },
  make_meal_gluten_free: { label: "Make gluten-free", description: "Create a gluten-free version with updated nutrition values.", goal: "Make this meal gluten-free", accessArea: "meal plans" },
  make_meal_cuisine: { label: "Change cuisine", description: "Adapt this meal to the requested cuisine and my authorized preferences.", goal: "Adapt this meal’s cuisine", accessArea: "meal plans" },
  build_grocery_list: { label: "Build grocery list", description: "Use the saved meal plan to create and save an ingredient-level grocery list.", goal: "Build a practical grocery list", accessArea: "meal plans" },
  review_week: { label: "Review week", description: "Review my authorized training, nutrition, hydration, and recovery context and explain useful priorities.", goal: "Review this week and suggest practical improvements", accessArea: "wellness" }
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

export function isAiActionWriteCapable(actionType: AiActionType) {
  return !["review_week", "review_workout_session", "explain_progression"].includes(actionType);
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
