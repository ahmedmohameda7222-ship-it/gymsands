import type { AiPermissionSection } from "@/types";
import type { PromptCapability, PromptCategory } from "@/lib/ai/quick-prompts";

export type RawPromptSpec = readonly [
  id: string,
  category: PromptCategory,
  title: readonly [en: string, de: string, ar: string],
  capability: PromptCapability,
  permissionSections: readonly AiPermissionSection[],
  supportedBy: readonly string[],
  prerequisiteId: string,
  quick: boolean,
  basePriority: number
];
