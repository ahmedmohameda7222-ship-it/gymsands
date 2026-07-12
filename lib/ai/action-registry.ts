import type { AiActionType } from "@/types";

export type AiActionCapability = "read" | "write";
export type AiActionAccessArea =
  | "workouts"
  | "nutrition"
  | "meal plans"
  | "wellness"
  | "progress";

export type AiActionRegistryEntry = {
  capability: AiActionCapability;
  label: string;
  description: string;
  goal: string;
  accessArea: AiActionAccessArea;
};

const write = (
  label: string,
  description: string,
  goal: string,
  accessArea: AiActionAccessArea
): AiActionRegistryEntry => ({ capability: "write", label, description, goal, accessArea });
const read = (
  label: string,
  description: string,
  goal: string,
  accessArea: AiActionAccessArea
): AiActionRegistryEntry => ({ capability: "read", label, description, goal, accessArea });

export const AI_ACTION_REGISTRY = {
  build_meal_plan: write("Create meal plan with ChatGPT", "Use my authorized Plaivra nutrition context to create and save a structured meal plan.", "Create a realistic meal plan and save it to Plaivra", "meal plans"),
  replace_exercise: write("Replace exercise", "Find and save a practical alternative for the current exercise.", "Replace this exercise", "workouts"),
  adjust_next_workout: write("Adjust next workout", "Review the next workout and save the requested adjustment.", "Adjust the next workout", "workouts"),
  rebalance_week: write("Rebalance this week", "Review the remaining training week and save the requested changes.", "Rebalance the training week", "workouts"),
  review_workout_session: read("Review workout", "Review the completed work and explain useful next steps.", "Review this workout", "workouts"),
  adjust_for_low_readiness: write("Make today lighter", "Use my authorized training context to adapt today to my current readiness.", "Make today’s workout lighter", "workouts"),
  explain_progression: read("Explain progression", "Explain the next target using my saved performance.", "Explain the next progression step", "progress"),
  reduce_workout_volume: write("Reduce volume", "Reduce the requested sets or exercises and save the update.", "Reduce today’s workout volume", "workouts"),
  reduce_workout_intensity: write("Reduce intensity", "Create a lower-intensity version and save the requested update.", "Reduce today’s workout intensity", "workouts"),
  recovery_workout: write("Recovery workout", "Create a recovery-focused version that respects my authorized fitness constraints.", "Create a recovery-focused workout", "workouts"),
  reduce_next_session: write("Reduce next session", "Make the next session more manageable and save the requested change.", "Reduce the next training session", "workouts"),
  regenerate_meal: write("Replace meal", "Create and save a practical replacement for this planned meal.", "Replace this meal", "meal plans"),
  make_meal_cheaper: write("Make it cheaper", "Use my authorized budget and food preferences to create a lower-cost version.", "Make this meal or list cheaper", "nutrition"),
  make_meal_faster: write("Make it faster", "Use my authorized cooking preferences to create a quicker version.", "Make this meal faster", "nutrition"),
  make_meal_higher_protein: write("More protein", "Create a realistic higher-protein version and save it when requested.", "Increase protein in this meal", "nutrition"),
  replace_meal_ingredient: write("Replace ingredient", "Create an ingredient swap that respects my authorized preferences.", "Replace one ingredient", "meal plans"),
  make_meal_dairy_free: write("Make dairy-free", "Create a dairy-free version with updated nutrition values.", "Make this meal dairy-free", "meal plans"),
  make_meal_gluten_free: write("Make gluten-free", "Create a gluten-free version with updated nutrition values.", "Make this meal gluten-free", "meal plans"),
  make_meal_cuisine: write("Change cuisine", "Adapt this meal to the requested cuisine and my authorized preferences.", "Adapt this meal’s cuisine", "meal plans"),
  build_grocery_list: write("Build grocery list", "Use the saved meal plan to create and save an ingredient-level grocery list.", "Build a practical grocery list", "meal plans"),
  review_week: read("Review week", "Review my authorized training, nutrition, hydration, and recovery context and explain useful priorities.", "Review this week and suggest practical improvements", "wellness")
} satisfies Record<AiActionType, AiActionRegistryEntry>;

export const INTERNAL_AI_ACTION_NAMES = Object.keys(AI_ACTION_REGISTRY) as AiActionType[];

export const WRITE_CAPABLE_AI_ACTION_NAMES = INTERNAL_AI_ACTION_NAMES.filter(
  (name) => AI_ACTION_REGISTRY[name].capability === "write"
);

export function isRegisteredAiAction(name: string): name is AiActionType {
  return name in AI_ACTION_REGISTRY;
}

export function isAiActionWriteCapable(actionType: AiActionType) {
  return AI_ACTION_REGISTRY[actionType].capability === "write";
}
