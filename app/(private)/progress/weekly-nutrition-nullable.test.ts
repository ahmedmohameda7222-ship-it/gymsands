import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { addDays, startOfWeek } from "@/lib/date-utils";

type WeeklyInsights = {
  averageCalories: number | null;
  calendarAverageCalories: number | null;
  averageProtein: number | null;
  calendarAverageProtein: number | null;
  consistencyScore: number;
};

type NutritionDay = {
  calories: number | null;
  protein_g: number | null;
  water_ml?: number | null;
  logs: unknown[];
};

function loadProductionBuildWeeklyInsights() {
  const source = readFileSync("app/(private)/progress/page.tsx", "utf8");
  const match = source.match(/function buildWeeklyInsights\([^\n]+/);
  if (!match) throw new Error("Progress buildWeeklyInsights production function not found.");
  const compiled = ts.transpileModule(`${match[0]}\nmodule.exports = buildWeeklyInsights;`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loadedModule = { exports: undefined as unknown };
  new Function("module", "exports", "startOfWeek", "addDays", compiled)(loadedModule, {}, startOfWeek, addDays);
  return loadedModule.exports as (input: {
    nutritionWeek: NutritionDay[];
    workoutActivity: never[];
    entries: never[];
    today: string;
  }) => WeeklyInsights;
}

function insights(days: NutritionDay[]) {
  return loadProductionBuildWeeklyInsights()({
    nutritionWeek: days,
    workoutActivity: [],
    entries: [],
    today: "2026-08-31",
  });
}

function day(calories: number | null, protein_g: number | null, hasLogs = true): NutritionDay {
  return { calories, protein_g, water_ml: 0, logs: hasLogs ? [{}] : [] };
}

describe("Progress weekly nullable nutrition", () => {
  it("does not publish logged-day or calendar calorie averages when any logged calorie is unknown", () => {
    const result = insights([day(2000, 150), day(null, 160)]);
    expect(result.averageCalories).toBeNull();
    expect(result.calendarAverageCalories).toBeNull();
    expect(result.averageProtein).toBe(155);
  });

  it("does not publish logged-day or calendar protein averages when any logged protein is unknown", () => {
    const result = insights([day(2000, 150), day(2200, null)]);
    expect(result.averageProtein).toBeNull();
    expect(result.calendarAverageProtein).toBeNull();
    expect(result.averageCalories).toBe(2100);
  });

  it("keeps known zero as a real value", () => {
    const result = insights([day(0, 0)]);
    expect(result.averageCalories).toBe(0);
    expect(result.averageProtein).toBe(0);
    expect(result.calendarAverageCalories).toBe(0);
    expect(result.calendarAverageProtein).toBe(0);
  });

  it("preserves fully-known logged-day and seven-day denominator semantics", () => {
    const result = insights([day(2000, 140), day(2200, 160), day(9999, 999, false)]);
    expect(result.averageCalories).toBe(2100);
    expect(result.calendarAverageCalories).toBe(600);
    expect(result.averageProtein).toBe(150);
    expect(result.calendarAverageProtein).toBe(43);
  });

  it("preserves the established no-log behavior", () => {
    const result = insights([day(2000, 150, false)]);
    expect(result.averageCalories).toBeNull();
    expect(result.averageProtein).toBeNull();
    expect(result.calendarAverageCalories).toBe(0);
    expect(result.calendarAverageProtein).toBe(0);
  });
});
