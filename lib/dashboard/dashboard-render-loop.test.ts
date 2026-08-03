// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { QuickPromptContext } from "@/lib/ai/quick-prompts";
import {
  useDashboardContextPublication,
  useDashboardRemainingMacros,
  useStableDashboardContextState
} from "@/lib/dashboard/dashboard-context-publication";
import type { SavedTargets } from "@/services/nutrition/targets";
import type { MacroTotals } from "@/types";

type Scenario = "loaded" | "empty" | "failed";

type RuntimeCounters = {
  renders: number;
  publications: number;
  providerUpdates: number;
  equivalentAttempts: number;
};

const targets: SavedTargets = {
  daily_calories: 2300,
  protein_g: 170,
  carbs_g: 260,
  fat_g: 75,
  water_ml: 2500
};

const totals: MacroTotals = {
  calories: 750,
  protein_g: 68,
  carbs_g: 94,
  fat_g: 23
};

const emptyContext: QuickPromptContext = {
  route: "/dashboard",
  today: "2026-08-03",
  localHour: 9,
  nutrition: {
    hasTargets: false,
    targetsState: "loaded",
    foodLogsState: "loaded",
    remainingCalories: null,
    remainingProtein: null,
    remainingCarbs: null,
    remainingFat: null,
    foodLogCount: 0,
    mealPlanCount: 0,
    plannedMealCount: 0
  }
};

function DashboardHarness({
  scenario,
  counters,
  exposeContext
}: {
  scenario: Scenario;
  counters: RuntimeCounters;
  exposeContext: (context: QuickPromptContext) => void;
}) {
  counters.renders += 1;
  const remaining = useDashboardRemainingMacros(
    scenario === "empty" ? null : targets,
    scenario === "loaded" ? totals : null
  );
  const nextContext: QuickPromptContext = {
    ...emptyContext,
    nutrition:
      scenario === "loaded"
        ? {
            hasTargets: true,
            targetsState: "loaded",
            foodLogsState: "loaded",
            remainingCalories: remaining?.calories ?? null,
            remainingProtein: remaining?.protein_g ?? null,
            remainingCarbs: remaining?.carbs_g ?? null,
            remainingFat: remaining?.fat_g ?? null,
            foodLogCount: 2,
            mealPlanCount: 1,
            plannedMealCount: 1
          }
        : scenario === "failed"
          ? {
              ...emptyContext.nutrition!,
              hasTargets: true,
              foodLogsState: "failed",
              foodLogCount: null
            }
          : emptyContext.nutrition
  };
  useDashboardContextPublication(nextContext, (context) => {
    counters.publications += 1;
    exposeContext(context);
  });
  return <output data-remaining-calories={remaining?.calories ?? "unavailable"} />;
}

function ProviderHarness({
  scenario,
  counters,
  exposeContext
}: {
  scenario: Scenario;
  counters: RuntimeCounters;
  exposeContext: (context: QuickPromptContext) => void;
}) {
  const [dashboardContext, setDashboardContext] = useStableDashboardContextState(emptyContext);
  useEffect(() => {
    counters.providerUpdates += 1;
    exposeContext(dashboardContext);
  }, [dashboardContext, counters, exposeContext]);
  return (
    <>
      <DashboardHarness
        scenario={scenario}
        counters={counters}
        exposeContext={(context) => {
          setDashboardContext(context);
          counters.equivalentAttempts += 1;
          setDashboardContext({
            ...context,
            nutrition: context.nutrition ? { ...context.nutrition } : undefined
          });
        }}
      />
    </>
  );
}

async function renderScenario(scenario: Scenario) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const counters: RuntimeCounters = { renders: 0, publications: 0, providerUpdates: 0, equivalentAttempts: 0 };
  let currentContext = emptyContext;
  await act(async () => {
    root.render(
      <ProviderHarness
        scenario={scenario}
        counters={counters}
        exposeContext={(context) => {
          currentContext = context;
        }}
      />
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return {
    container,
    counters,
    context: () => currentContext,
    unmount: async () => {
      await act(async () => root.unmount());
      container.remove();
    }
  };
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  document.body.replaceChildren();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("dashboard React publication lifecycle", () => {
  it("publishes one loaded context without an update-depth loop", async () => {
    const runtime = await renderScenario("loaded");
    expect(runtime.context().nutrition).toMatchObject({
      foodLogsState: "loaded",
      remainingCalories: 1550,
      remainingProtein: 102,
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
    expect(dashboard).toMatch(/useDashboardContextPublication\(\s*publishedDashboardContext,\s*setDashboardContext,?\s*\)/);
    expect(provider).toContain("useStableDashboardContextState(emptyContext)");
  });
});