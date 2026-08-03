import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("PR #44 correction contracts", () => {
  it("copies the same canonical source summary shown as chips", () => {
    const dialog = source("components/ai/ai-action-request-dialog.tsx");
    expect(dialog).toContain("buildChatGptActionPrompt(action.type, context)");
    expect(dialog).toContain("summary.map");
    expect(dialog).not.toContain("summary.slice(0, 4)");
  });

  it("never converts a failed food-log projection into a successful empty source", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const contract = source("lib/dashboard/today-projection-contract.ts");
    expect(dashboard).toContain('visibleProjection?.nutrition.logs.state === "loaded"');
    expect(dashboard).toContain("visibleProjection.nutrition.logs.value");
    expect(dashboard).toContain('logsState === "failed"');
    expect(contract).toContain('state: "failed"; value: null; errorCode: TodayProjectionErrorCode');
    expect(dashboard).not.toContain("getTodayFoodLogs");
  });

  it("restores loaded food-log state only after one successful projection retry", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain("const retryProjection = useCallback");
    expect(dashboard).toContain("loadProjection({ force: true, preserveContent: true })");
    expect(dashboard).toContain('visibleProjection?.nutrition.logs.state === "loaded"');
    expect(dashboard).toContain('logsState === "failed"');
    expect(dashboard).toContain('onClick={() => void retryProjection()}');
    expect(dashboard).not.toContain("retryFoodLogs");
  });

  it("keeps Dashboard context activity values execution-only and source-aware", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const model = source("lib/dashboard/today-model.ts");
    const projection = source("services/dashboard/today-projection-server.ts");
    expect(dashboard).toContain("const source = visibleProjection?.promptContext");
    expect(dashboard).toContain("plannedMealCount: source.nutrition.plannedMealCount");
    expect(dashboard).toContain("wellness: source?.wellness");
    expect(projection).toContain("plannedMealCount: meals?.plannedCount ?? null");
    expect(projection).toContain("habitCount: habits?.plannedCount ?? null");
    expect(projection).toContain("supplementCount: supplements?.plannedCount ?? null");
    expect(model).not.toContain("buildTodayActions");
    expect(model).not.toContain('input.workoutState !== "none"');
  });

  it("routes completed workouts to history rather than session execution", () => {
    const model = source("lib/dashboard/today-model.ts");
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const projection = source("services/dashboard/today-projection-server.ts");
    expect(model).toContain("/workout-history?session=");
    expect(projection).toContain("/workout-history?session=");
    expect(dashboard).toContain("workout.actionHref");
    expect(dashboard).not.toContain('href={`/workouts/session/day/${workoutData.day.id}`}');
  });

  it("localizes Meal Plan skip status and blocks skipped-to-done legacy flows", () => {
    const builder = source("components/meals/my-meal-plan-builder.tsx");
    const legacy = source("components/workouts/todays-workout.tsx");
    const nutrition = source("services/database/nutrition.ts");
    expect(builder).toContain('t("mealPlan.statusSkipped")');
    expect(builder).not.toContain(">{item.status}</Badge>");
    expect(legacy).toContain('item.status !== "planned"');
    expect(nutrition).toContain('item.status === "skipped"');
    expect(nutrition).toContain('.eq("status", "planned")');
  });
});