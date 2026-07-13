import type { QuickPromptContext } from "./quick-prompts";

export function sameDashboardContext(current: QuickPromptContext, next: QuickPromptContext) {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function preserveEquivalentDashboardContext(
  current: QuickPromptContext,
  next: QuickPromptContext
): QuickPromptContext {
  return sameDashboardContext(current, next) ? current : next;
}
