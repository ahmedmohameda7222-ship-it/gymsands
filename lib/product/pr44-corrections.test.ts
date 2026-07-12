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

  it("never converts a failed food-log source into an empty array", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const nutrition = source("lib/dashboard/today-nutrition.ts");
    expect(dashboard).toContain("knownFoodLogCount(nutritionData)");
    expect(dashboard).toContain('getTodayFoodLogs(user.id, today, { throwOnError: true })');
    expect(nutrition).toContain('logs: logsResult.status === "fulfilled" ? logsResult.value : null');
  });

  it("restores a fully loaded food-log state only after a successful retry", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain("const retryFoodLogs = useCallback");
    expect(dashboard).toContain('logsState: "loading", logsError: null');
    expect(dashboard).toContain('logsState: "loaded", logsError: null, totalsIncomplete: false');
    expect(dashboard).toContain('logsState: "failed"');
    expect(dashboard).toContain('onClick={() => void retryFoodLogs()}');
  });

  it("uses execution-only activity values", () => {
    const model = source("lib/dashboard/today-model.ts");
    expect(model).toContain("doneMealCount");
    expect(model).toContain("completedHabitCount");
    expect(model).toContain("takenSupplementCount");
    expect(model).not.toContain("input.mealItems.length");
    expect(model).not.toContain('input.workoutState !== "none"');
  });

  it("routes completed workouts to history rather than session execution", () => {
    const model = source("lib/dashboard/today-model.ts");
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(model).toContain("/workout-history?session=");
    expect(dashboard).toContain("workoutCardHref");
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
