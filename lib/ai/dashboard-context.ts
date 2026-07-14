import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
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

export function useStableDashboardContextState(initialContext: QuickPromptContext) {
  const [dashboardContext, setDashboardContextState] = useState<QuickPromptContext>(initialContext);
  const setDashboardContext = useCallback((context: QuickPromptContext) => {
    setDashboardContextState((current) => preserveEquivalentDashboardContext(current, context));
  }, []);

  return [dashboardContext, setDashboardContext, setDashboardContextState] as const satisfies readonly [
    QuickPromptContext,
    (context: QuickPromptContext) => void,
    Dispatch<SetStateAction<QuickPromptContext>>
  ];
}
