import { GROCERY_RECOVERY_PROMPTS } from "@/lib/ai/prompt-catalog/grocery-recovery";
import { NUTRITION_PROMPTS } from "@/lib/ai/prompt-catalog/nutrition";
import { PROGRESS_DAILY_PROFILE_PROMPTS } from "@/lib/ai/prompt-catalog/progress-daily-profile";
import { TRAINING_PROMPTS } from "@/lib/ai/prompt-catalog/training";
import { createPromptPrerequisite, getPromptPrerequisiteMessage, getPromptRole } from "@/lib/ai/prompt-catalog/prerequisites";
import type { RawPromptSpec } from "@/lib/ai/prompt-catalog/types";
import type { AiPermissionSection } from "@/types";

export type PromptLanguage = "en" | "de" | "ar";
export type PromptCategory = "training" | "nutrition" | "grocery" | "recovery" | "progress" | "daily" | "profile";
export type PromptCapability = "read" | "write";
export type PromptSourceState = "loading" | "loaded" | "failed" | "unknown";
export type LocalizedText = Record<PromptLanguage, string>;
export const PROMPT_CATEGORIES: PromptCategory[] = ["training", "nutrition", "grocery", "recovery", "progress", "daily", "profile"];

export type QuickPromptContext = {
  route?: string;
  today?: string;
  localHour?: number;
  units?: { energy?: "kcal" | "kJ"; liquid?: "ml" | "oz"; weight?: "kg" | "lb" };
  workout?: { hasPlan?: boolean; scheduled?: boolean; active?: boolean; completed?: boolean; title?: string | null; exerciseCount?: number | null; durationMinutes?: number | null; historyCount?: number | null };
  nutrition?: { hasTargets?: boolean; targetsState?: PromptSourceState; foodLogsState?: "loading" | "loaded" | "failed"; remainingCalories?: number | null; remainingProtein?: number | null; foodLogCount: number | null; mealPlanCount: number | null };
  grocery?: { state?: PromptSourceState; itemCount: number | null };
  hydration?: { state?: PromptSourceState; hasTarget?: boolean; logCount?: number | null; remainingMl?: number | null };
  recovery?: { state?: PromptSourceState; hasData?: boolean; sleepHours?: number | null; poorRecovery?: boolean };
  wellness?: { state?: PromptSourceState; habitCount?: number | null; supplementCount?: number | null };
  progress?: { state?: PromptSourceState; entryCount?: number | null };
  profile?: { state?: PromptSourceState; hasGoals?: boolean; hasTrainingPreferences?: boolean; hasNutritionPreferences?: boolean; hasConstraints?: boolean };
  selection?: { exercise?: string | null; meal?: string | null };
  endOfWeek?: boolean;
};

export type PromptPrerequisite = { id: string; message: LocalizedText; isMet: (context: QuickPromptContext) => boolean };
export type QuickPromptDefinition = {
  id: string;
  category: PromptCategory;
  title: LocalizedText;
  description: LocalizedText;
  role: LocalizedText;
  objective: LocalizedText;
  capability: PromptCapability;
  permissionSections: AiPermissionSection[];
  destination?: LocalizedText;
  attachmentExpected?: boolean;
  quick?: boolean;
  prerequisites: PromptPrerequisite[];
  supportedBy: readonly string[];
  eligible: (context: QuickPromptContext) => boolean;
  priority: (context: QuickPromptContext) => number;
};
export type PromptAvailability = { available: boolean; missingContext: string[] };
export type PromptHomeSections = { recommended: QuickPromptDefinition | null; quick: QuickPromptDefinition[]; dynamic: QuickPromptDefinition[] };

const l = (en: string, de: string, ar: string): LocalizedText => ({ en, de, ar });
const v = (entry: LocalizedText, language: PromptLanguage) => entry[language];
const specs = [...TRAINING_PROMPTS, ...NUTRITION_PROMPTS, ...GROCERY_RECOVERY_PROMPTS, ...PROGRESS_DAILY_PROFILE_PROMPTS] as const satisfies readonly RawPromptSpec[];
function definition<const T extends RawPromptSpec>(spec: T): QuickPromptDefinition & { id: T[0] } {
  const [id, category, titleText, capability, permissionSections, supportedBy, prerequisiteId, quick, basePriority] = spec;
  const title = l(...titleText);
  const objective = l(
    `Complete the “${title.en}” task using only the minimum authorized Plaivra context required for this task.`,
    `Führe die Aufgabe „${title.de}“ nur mit dem dafür erforderlichen minimalen autorisierten Plaivra-Kontext aus.`,
    `نفّذ مهمة «${title.ar}» باستخدام الحد الأدنى فقط من سياق Plaivra المصرح به واللازم لهذه المهمة.`
  );
  const prerequisite = createPromptPrerequisite(prerequisiteId);
  return {
    id, category, title, description: objective, role: getPromptRole(category), objective, capability,
    permissionSections: [...permissionSections], destination: capability === "write" ? title : undefined,
    attachmentExpected: id === "estimate-meal-photo", quick, prerequisites: prerequisiteId === "always" ? [] : [prerequisite], supportedBy,
    eligible: prerequisite.isMet,
    priority: (context) => basePriority
      + (id === "adjust-today-workout" && context.workout?.active ? 20 : 0)
      + (id === "review-recovery" && context.recovery?.poorRecovery ? 20 : 0)
      + (id === "review-week" && context.endOfWeek ? 18 : 0)
      + (id === "finish-macros" && typeof context.nutrition?.remainingProtein === "number" && context.nutrition.remainingProtein > 40 ? 12 : 0)
      + (id === "estimate-meal-photo" && context.nutrition?.foodLogsState === "loaded" && context.nutrition.foodLogCount === 0 ? 12 : 0)
  };
}

export type PromptId = (typeof specs)[number][0];
export const QUICK_PROMPTS: Array<QuickPromptDefinition & { id: PromptId }> = specs.map(definition);

export function localizePrompt(definition: QuickPromptDefinition, language: PromptLanguage) { return { title: v(definition.title, language), description: v(definition.description, language) }; }
export function getPromptAvailability(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage): PromptAvailability {
  const missingContext = definition.prerequisites.filter((item) => !item.isMet(context)).map((item) => getPromptPrerequisiteMessage(item.id, context, language));
  return { available: missingContext.length === 0, missingContext };
}
export function rankQuickPrompts(context: QuickPromptContext) { return QUICK_PROMPTS.filter((prompt) => prompt.eligible(context)).sort((a, b) => b.priority(context) - a.priority(context) || a.id.localeCompare(b.id)); }
export function getPromptHomeSections(context: QuickPromptContext): PromptHomeSections {
  const ranked = rankQuickPrompts(context); const recommended = ranked[0] ?? null; const used = new Set(recommended ? [recommended.id] : []);
  const quick = ranked.filter((item) => item.quick && !used.has(item.id)).slice(0, 6); quick.forEach((item) => used.add(item.id));
  const dynamic = ranked.filter((item) => !used.has(item.id)).slice(0, 5); return { recommended, quick, dynamic };
}
export function filterPromptLibrary({ prompts = QUICK_PROMPTS, category, search, language }: { prompts?: readonly QuickPromptDefinition[]; category?: PromptCategory | "all"; search?: string; language: PromptLanguage }) {
  const query = search?.trim().toLocaleLowerCase(language === "ar" ? "ar" : language === "de" ? "de-DE" : "en") ?? "";
  return prompts.filter((prompt) => {
    if (category && category !== "all" && prompt.category !== category) return false;
    if (!query) return true;
    const localized = localizePrompt(prompt, language); return `${localized.title} ${localized.description}`.toLocaleLowerCase().includes(query);
  });
}
