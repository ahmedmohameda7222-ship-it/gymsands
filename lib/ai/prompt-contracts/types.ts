import type { LocalizedText } from "@/lib/ai/quick-prompts";

export type PromptContextField =
  | "date" | "workout" | "workout_state" | "workout_history"
  | "nutrition_targets" | "nutrition_progress" | "meal_plan" | "grocery"
  | "hydration" | "recovery" | "wellness" | "progress"
  | "profile_goals" | "profile_training_preferences" | "profile_nutrition_preferences" | "profile_constraints"
  | "selected_exercise" | "selected_meal";
export type TaskContract = { contextFields: PromptContextField[]; constraints: LocalizedText[]; output: LocalizedText[] };
export const text = (en: string, de: string, ar: string): LocalizedText => ({ en, de, ar });
const integrityConstraint = text(
  "Use only known authorized Plaivra data, state uncertainty, and do not invent missing values.",
  "Nutze nur bekannte autorisierte Plaivra-Daten, kennzeichne Unsicherheit und erfinde keine fehlenden Werte.",
  "استخدم بيانات Plaivra المعروفة والمصرح بها فقط، واذكر عدم اليقين، ولا تخترع قيمًا مفقودة."
);
export const task = (contextFields: PromptContextField[], taskConstraint: LocalizedText, output: LocalizedText[]): TaskContract => ({ contextFields, constraints: [taskConstraint, integrityConstraint], output });
