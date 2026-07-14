import { useEffect, useMemo } from "react";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";
import { remainingMacros } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";

export type DashboardMacroTotals = {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

export function useDashboardRemainingMacros(
  targets: SavedTargets | null,
  totals: DashboardMacroTotals | null
) {
  return useMemo(() => targets && totals
    ? remainingMacros({
        calories: targets.daily_calories,
        protein_g: targets.protein_g,
        carbs_g: targets.carbs_g,
        fat_g: targets.fat_g,
        water_ml: targets.water_ml
      }, totals)
    : null, [targets, totals]);
}

export function useDashboardContextPublication(
  context: QuickPromptContext,
  publish: (context: QuickPromptContext) => void
) {
  useEffect(() => {
    publish(context);
  }, [context, publish]);
}
