import { INTERNAL_AI_ACTION_NAMES, WRITE_CAPABLE_AI_ACTION_NAMES } from "@/lib/ai/action-registry";
import { detectMealPromptRelevance } from "@/lib/ai/planned-meal-context";
import { buildPromptContextItems, validatePromptContextPermissionContract, type PromptContextField } from "@/lib/ai/prompt-context";
import { TASK_CONTRACTS, getPromptTaskContract } from "@/lib/ai/prompt-contracts";
import { MCP_PUBLIC_TOOL_NAMES, mcpTools } from "@/lib/mcp/tools";
import { filterPromptLibrary, getPromptAvailability, localizePrompt, QUICK_PROMPTS, type LocalizedText, type PromptCategory, type PromptHomeSections, type PromptId, type PromptLanguage, type QuickPromptContext, type QuickPromptDefinition } from "@/lib/ai/quick-prompts";
import type { AiPermissionSection } from "@/types";

export type BackingCapabilityStatus = { declared: string[]; known: string[]; unknown: string[]; writeCapable: string[]; supported: boolean };
export type PromptCatalogAuditEntry = {
  promptId: PromptId;
  category: PromptCategory;
  capability: QuickPromptDefinition["capability"];
  permissionSections: AiPermissionSection[];
  contextFields: PromptContextField[];
  contextPermissionContractValid: boolean;
  taskContractExists: boolean;
  backingActionsValid: boolean;
  writeBackingValid: boolean;
  prerequisites: string[];
  runtimeExposed: boolean;
};
export type EatPromptHome = { recommended: QuickPromptDefinition[]; nutrition: QuickPromptDefinition[] };

const value = (entry: LocalizedText, language: PromptLanguage) => entry[language];
const sectionCopy = {
  en: { role: "Role", objective: "Objective", context: "Authorized Plaivra context", constraints: "Constraints", output: "Task-specific required output", confirmation: "Confirmation rule", noContext: "- No additional authorized context is available. State what is missing instead of inventing it." },
  de: { role: "Rolle", objective: "Ziel", context: "Autorisierter Plaivra-Kontext", constraints: "Rahmenbedingungen", output: "Aufgabenspezifische erwartete Ausgabe", confirmation: "Bestätigungsregel", noContext: "- Kein zusätzlicher autorisierter Kontext ist verfügbar. Nenne Fehlendes, statt es zu erfinden." },
  ar: { role: "الدور", objective: "الهدف", context: "سياق Plaivra المصرح به", constraints: "القيود", output: "المخرجات المطلوبة الخاصة بالمهمة", confirmation: "قاعدة التأكيد", noContext: "- لا يتوفر سياق إضافي مصرح به. اذكر ما ينقص بدلًا من اختراعه." }
} as const;

export function buildRuntimePrompt(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage) {
  const copy = sectionCopy[language];
  const contract = getPromptTaskContract(definition);
  const contextItems = buildPromptContextItems(definition, context, language);
  const confirmation = definition.capability === "write"
    ? language === "de"
      ? ["Zeige zuerst die vollständigen vorgeschlagenen Änderungen.", "Speichere oder aktualisiere nichts, bis ich ausdrücklich bestätige.", "Nutze danach nur die autorisierte Plaivra-Funktion und behaupte keinen Erfolg, bevor das Tool ihn bestätigt."]
      : language === "ar"
        ? ["اعرض التغييرات المقترحة كاملة أولًا.", "لا تحفظ أو تحدّث أي شيء حتى أؤكد صراحة.", "بعد ذلك استخدم وظيفة Plaivra المصرح بها فقط ولا تدّع النجاح حتى تؤكده الأداة."]
        : ["Show the complete proposed changes first.", "Do not save or update anything until I explicitly confirm.", "After confirmation, use only the authorized Plaivra capability and do not claim success until the tool confirms it."]
    : [language === "de" ? "Ändere keine Plaivra-Daten." : language === "ar" ? "لا تغيّر أي بيانات في Plaivra." : "Do not change any Plaivra data."];
  return [
    `${copy.role}:\n${value(definition.role, language)}`,
    `${copy.objective}:\n${value(definition.objective, language)}`,
    `${copy.context}:\n${contextItems.length ? contextItems.map((item) => `- ${item.label}: ${item.value}`).join("\n") : copy.noContext}`,
    `${copy.constraints}:\n${contract.constraints.map((item) => `- ${value(item, language)}`).join("\n")}`,
    `${copy.output}:\n${contract.output.map((item, index) => `${index + 1}. ${value(item, language)}`).join("\n")}`,
    `${copy.confirmation}:\n${confirmation.map((item) => `- ${item}`).join("\n")}`
  ].join("\n\n");
}

export function getRuntimeContextChips(definition: QuickPromptDefinition, context: QuickPromptContext, language: PromptLanguage) {
  return buildPromptContextItems(definition, context, language).slice(0, 6).map((item) => `${item.label}: ${item.value}`);
}

const publicTools = new Set<string>(MCP_PUBLIC_TOOL_NAMES);
const internalActions = new Set<string>(INTERNAL_AI_ACTION_NAMES);
const writeInternalActions = new Set<string>(WRITE_CAPABLE_AI_ACTION_NAMES);
const writePublicTools = new Set<string>(mcpTools.filter((tool) => publicTools.has(tool.name) && tool.annotations.readOnlyHint === false && tool.risk !== "read").map((tool) => tool.name));

export function getBackingCapabilityStatus(definition: QuickPromptDefinition): BackingCapabilityStatus {
  const declared = [...definition.supportedBy];
  const known = declared.filter((name) => publicTools.has(name) || internalActions.has(name));
  const unknown = declared.filter((name) => !publicTools.has(name) && !internalActions.has(name));
  const writeCapable = declared.filter((name) => writePublicTools.has(name) || writeInternalActions.has(name));
  const supported = declared.length > 0 && unknown.length === 0 && (definition.capability === "read" || writeCapable.length > 0);
  return { declared, known, unknown, writeCapable, supported };
}

function canonicalPromptIsValid(definition: QuickPromptDefinition) {
  return validatePromptContextPermissionContract(definition).valid && getBackingCapabilityStatus(definition).supported;
}
export const RUNTIME_QUICK_PROMPTS = QUICK_PROMPTS.filter(canonicalPromptIsValid);

export function auditPromptCatalog(): PromptCatalogAuditEntry[] {
  const runtimeIds = new Set(RUNTIME_QUICK_PROMPTS.map((prompt) => prompt.id));
  return QUICK_PROMPTS.map((definition) => {
    const permission = validatePromptContextPermissionContract(definition);
    const backing = getBackingCapabilityStatus(definition);
    return {
      promptId: definition.id as PromptId,
      category: definition.category,
      capability: definition.capability,
      permissionSections: [...definition.permissionSections],
      contextFields: [...getPromptTaskContract(definition).contextFields],
      contextPermissionContractValid: permission.valid,
      taskContractExists: Boolean(TASK_CONTRACTS[definition.id as PromptId]),
      backingActionsValid: backing.unknown.length === 0 && backing.known.length === backing.declared.length,
      writeBackingValid: definition.capability === "read" || backing.writeCapable.length > 0,
      prerequisites: definition.prerequisites.map((item) => item.id),
      runtimeExposed: runtimeIds.has(definition.id)
    };
  });
}

export function rankRuntimePrompts(context: QuickPromptContext) { return RUNTIME_QUICK_PROMPTS.filter((prompt) => prompt.eligible(context)).sort((a, b) => b.priority(context) - a.priority(context) || a.id.localeCompare(b.id)); }
export function getRuntimeHomeSections(context: QuickPromptContext): PromptHomeSections {
  const ranked = rankRuntimePrompts(context); const recommended = ranked[0] ?? null; const used = new Set(recommended ? [recommended.id] : []);
  const quick = ranked.filter((item) => item.quick && !used.has(item.id)).slice(0, 6); quick.forEach((item) => used.add(item.id));
  const dynamic = ranked.filter((item) => !used.has(item.id)).slice(0, 5); return { recommended, quick, dynamic };
}

export function getEatRuntimeHome(context: QuickPromptContext): EatPromptHome {
  const byId = new Map<PromptId, QuickPromptDefinition>(RUNTIME_QUICK_PROMPTS.map((prompt) => [prompt.id, prompt]));
  const recommendedIds: PromptId[] = ["finish-macros", "plan-rest-meals", "review-day-nutrition", "replace-meal", "review-hydration"];
  const recommended = recommendedIds.flatMap((id) => {
    const prompt = byId.get(id);
    return prompt?.eligible(context) ? [prompt] : [];
  });
  const nutrition: QuickPromptDefinition[] = RUNTIME_QUICK_PROMPTS.filter((prompt) => prompt.category === "nutrition");
  return { recommended, nutrition };
}

export function getMealAdjustmentRuntimePrompts(context: QuickPromptContext): QuickPromptDefinition[] {
  const byId = new Map<PromptId, QuickPromptDefinition>(RUNTIME_QUICK_PROMPTS.map((prompt) => [prompt.id, prompt]));
  const relevance = context.selection?.plannedMeal ? detectMealPromptRelevance(context.selection.plannedMeal) : { dairy: false, gluten: false };
  const ids: PromptId[] = ["replace-meal", "make-meal-cheaper", "make-meal-faster", "make-meal-higher-protein", "swap-meal-ingredients"];
  if (relevance.dairy) ids.push("make-meal-dairy-free");
  if (relevance.gluten) ids.push("make-meal-gluten-free");
  return ids.flatMap((id) => {
    const prompt = byId.get(id);
    return prompt?.eligible(context) ? [prompt] : [];
  });
}

export function filterRuntimeLibrary(input: { search?: string; category?: PromptCategory | "all"; language: PromptLanguage }) { return filterPromptLibrary({ ...input, prompts: RUNTIME_QUICK_PROMPTS }); }

export { getPromptAvailability, localizePrompt };
export { TASK_CONTRACTS, getPromptTaskContract } from "@/lib/ai/prompt-contracts";
export { PROMPT_CONTEXT_FIELD_PERMISSIONS, assertPromptContextPermissionContract, buildPromptContextItems, normalizeNutritionTargetState, validatePromptContextPermissionContract } from "@/lib/ai/prompt-context";
export type { NormalizedTargetState, PromptContextItem, PromptContextPermissionValidation } from "@/lib/ai/prompt-context";
export type { PromptContextField, TaskContract } from "@/lib/ai/prompt-contracts";
