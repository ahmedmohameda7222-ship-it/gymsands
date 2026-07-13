import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { preserveEquivalentDashboardContext } from "@/lib/ai/dashboard-context";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";
import { remainingMacros } from "@/services/nutrition/calculations";

function populatedContext(): QuickPromptContext {
  const remaining = remainingMacros(
    { calories: 2400, protein_g: 180, carbs_g: 260, fat_g: 80, water_ml: 3000 },
    { calories: 850, protein_g: 72, carbs_g: 94, fat_g: 28 }
  );
  return {
    route: "/dashboard",
    today: "2026-07-13",
    nutrition: {
      hasTargets: true,
      targetsState: "loaded",
      foodLogsState: "loaded",
      remainingCalories: remaining.calories,
      remainingProtein: remaining.protein_g,
      remainingCarbs: remaining.carbs_g,
      remainingFat: remaining.fat_g,
      foodLogCount: 1,
      mealPlanCount: 2,
      plannedMealCount: 1
    },
    grocery: { state: "loaded", itemCount: 0 },
    hydration: { state: "loaded", logCount: 0 },
    recovery: { state: "loaded", hasData: false },
    wellness: { state: "loaded", habitCount: 0, supplementCount: 0 },
    progress: { state: "loaded", entryCount: 0 },
    profile: { state: "loaded" }
  };
}

describe("dashboard render-loop regression", () => {
  it("publishes a populated equivalent dashboard context only once", () => {
    let current: QuickPromptContext = {};
    let providerUpdates = 0;

    for (let render = 0; render < 100; render += 1) {
      const next = populatedContext();
      const resolved = preserveEquivalentDashboardContext(current, next);
      if (resolved !== current) providerUpdates += 1;
      current = resolved;
    }

    expect(providerUpdates).toBe(1);
    expect(current.nutrition?.remainingCalories).toBe(1550);
    expect(current.nutrition?.remainingProtein).toBe(108);
  });

  it("preserves empty and partial/error states without repeated updates", () => {
    const states: QuickPromptContext[] = [
      {
        nutrition: { hasTargets: false, targetsState: "loaded", foodLogsState: "loaded", foodLogCount: 0, mealPlanCount: 0 }
      },
      {
        nutrition: { hasTargets: true, targetsState: "loaded", foodLogsState: "failed", foodLogCount: null, mealPlanCount: null }
      }
    ];

    for (const state of states) {
      const equivalent = JSON.parse(JSON.stringify(state)) as QuickPromptContext;
      expect(preserveEquivalentDashboardContext(state, equivalent)).toBe(state);
    }
  });

  it("keeps the remaining-macro calculation referentially stabilized in the dashboard component", () => {
    const source = readFileSync(resolve(process.cwd(), "components/dashboard/today-dashboard.tsx"), "utf8");
    expect(source).toMatch(/const remaining = useMemo\(\(\) => targets && totals/);
    expect(source).toMatch(/\[targets, totals\]\)/);
  });
});
