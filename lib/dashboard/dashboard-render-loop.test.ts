// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement, useCallback, useEffect, useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStableDashboardContextState } from "@/lib/ai/dashboard-context";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";
import { useDashboardContextPublication, useDashboardRemainingMacros } from "@/lib/dashboard/dashboard-context-publication";
import { sumFoodLogs } from "@/services/nutrition/calculations";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { FoodLog } from "@/types";

const targets = {
  daily_calories: 2400,
  protein_g: 180,
  carbs_g: 260,
  fat_g: 80,
  water_ml: 3000
} as SavedTargets;
const foodLog = {
  id: "log-1",
  calories: 850,
  protein_g: 72,
  carbs_g: 94,
  fat_g: 28,
  quantity: 1
} as FoodLog;

type Scenario = "populated" | "empty" | "failed";
type Counters = {
  renders: number;
  publications: number;
  providerUpdates: number;
  equivalentAttempts: number;
};

function DashboardPublisher({
  scenario,
  publish,
  onRender
}: {
  scenario: Scenario;
  publish: (context: QuickPromptContext) => void;
  onRender: () => void;
}) {
  onRender();
  const logs = useMemo(() => scenario === "populated" ? [foodLog] : [], [scenario]);
  const totals = useMemo(() => scenario === "failed" ? null : sumFoodLogs(logs), [logs, scenario]);
  const activeTargets = scenario === "empty" ? null : targets;
  const remaining = useDashboardRemainingMacros(activeTargets, totals);
  const foodLogCount = scenario === "failed" ? null : logs.length;
  const context = useMemo<QuickPromptContext>(() => ({
    route: "/dashboard",
    today: "2026-07-13",
    nutrition: {
      hasTargets: Boolean(activeTargets),
      targetsState: "loaded",
      foodLogsState: scenario === "failed" ? "failed" : "loaded",
      remainingCalories: remaining?.calories ?? null,
      remainingProtein: remaining?.protein_g ?? null,
      remainingCarbs: remaining?.carbs_g ?? null,
      remainingFat: remaining?.fat_g ?? null,
      foodLogCount,
      mealPlanCount: 0
    }
  }), [activeTargets, foodLogCount, remaining, scenario]);

  useDashboardContextPublication(context, publish);
  return createElement("output", {
    "data-remaining-calories": remaining?.calories ?? "",
    "data-food-log-count": foodLogCount ?? "unknown",
    "data-food-log-state": context.nutrition?.foodLogsState
  });
}

function RuntimeProvider({ scenario, onContext, onEquivalentAttempt, onProviderUpdate, onPublication, onRender }: {
  scenario: Scenario;
  onContext: (context: QuickPromptContext) => void;
  onEquivalentAttempt: () => void;
  onProviderUpdate: () => void;
  onPublication: () => void;
  onRender: () => void;
}) {
  const [dashboardContext, setDashboardContext] = useStableDashboardContextState({});
  const previousContext = useRef(dashboardContext);
  const repeatedEquivalent = useRef(false);
  const publish = useCallback((context: QuickPromptContext) => {
    onPublication();
    setDashboardContext(context);
  }, [onPublication, setDashboardContext]);

  useEffect(() => {
    if (dashboardContext === previousContext.current) return;
    previousContext.current = dashboardContext;
    onProviderUpdate();
    onContext(dashboardContext);
  }, [dashboardContext, onContext, onProviderUpdate]);

  useEffect(() => {
    if (!dashboardContext.route || repeatedEquivalent.current) return;
    repeatedEquivalent.current = true;
    onEquivalentAttempt();
    setDashboardContext(JSON.parse(JSON.stringify(dashboardContext)) as QuickPromptContext);
  }, [dashboardContext, onEquivalentAttempt, setDashboardContext]);

  return createElement(DashboardPublisher, {
    scenario,
    publish,
    onRender
  });
}

async function renderScenario(scenario: Scenario) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const counters: Counters = { renders: 0, publications: 0, providerUpdates: 0, equivalentAttempts: 0 };
  let publishedContext: QuickPromptContext = {};
  const onContext = (context: QuickPromptContext) => { publishedContext = context; };
  const onEquivalentAttempt = () => { counters.equivalentAttempts += 1; };
  const onProviderUpdate = () => { counters.providerUpdates += 1; };
  const onPublication = () => { counters.publications += 1; };
  const onRender = () => { counters.renders += 1; };

  await act(async () => {
    root.render(createElement(RuntimeProvider, { scenario, onContext, onEquivalentAttempt, onProviderUpdate, onPublication, onRender }));
  });

  return {
    counters,
    container,
    context: () => publishedContext,
    unmount: async () => act(async () => { root.unmount(); })
  };
}

describe("dashboard React publication lifecycle", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
    document.body.replaceChildren();
  });

  it("publishes populated remaining macros once with bounded React/provider updates", async () => {
    const runtime = await renderScenario("populated");
    expect(runtime.context().nutrition).toMatchObject({
      hasTargets: true,
      foodLogsState: "loaded",
      foodLogCount: 1,
      remainingCalories: 1550,
      remainingProtein: 108,
      remainingCarbs: 166,
      remainingFat: 52
    });
    expect(runtime.container.querySelector("output")?.getAttribute("data-remaining-calories")).toBe("1550");
    expect(runtime.counters).toEqual({ renders: 2, publications: 1, providerUpdates: 1, equivalentAttempts: 1 });
    expect(consoleError).not.toHaveBeenCalled();
    await runtime.unmount();
  });

  it.each([
    ["empty", { hasTargets: false, foodLogsState: "loaded", foodLogCount: 0 }],
    ["failed", { hasTargets: true, foodLogsState: "failed", foodLogCount: null }]
  ] as const)("keeps the %s state bounded without synthesizing remaining values", async (scenario, expected) => {
    const runtime = await renderScenario(scenario);
    expect(runtime.context().nutrition).toMatchObject({ ...expected, remainingCalories: null });
    expect(runtime.counters.publications).toBe(1);
    expect(runtime.counters.providerUpdates).toBe(1);
    expect(runtime.counters.equivalentAttempts).toBe(1);
    expect(runtime.counters.renders).toBeLessThanOrEqual(2);
    expect(consoleError).not.toHaveBeenCalled();
    await runtime.unmount();
  });

  it("keeps the runtime hooks wired into the production dashboard and provider", () => {
    const dashboard = readFileSync(resolve(process.cwd(), "components/dashboard/today-dashboard.tsx"), "utf8");
    const provider = readFileSync(resolve(process.cwd(), "components/ai/quick-chatgpt-provider.tsx"), "utf8");
    expect(dashboard).toContain("useDashboardRemainingMacros(targets, totals)");
    expect(dashboard).toContain("useDashboardContextPublication(publishedDashboardContext, setDashboardContext)");
    expect(provider).toContain("useStableDashboardContextState(emptyContext)");
  });
});
