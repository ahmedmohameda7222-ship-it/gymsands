import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { buildWeekAnalytics } from "@/lib/eat/eat-model";
import type { DailyNutritionSummary, FoodLog } from "@/types";

function loggedDay(date: string, calories: number | null, target: number): DailyNutritionSummary {
  return {
    date,
    planned_calories: target,
    has_targets: true,
    calories,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    water_ml: 0,
    logs: [{ id: `log-${date}` } as FoodLog],
  };
}

describe("Eat weekly adherence with nullable calories", () => {
  it("does not claim definitive adherence when a target-configured logged day has unknown calories", () => {
    const analytics = buildWeekAnalytics([
      loggedDay("2026-08-24", 2000, 2000),
      loggedDay("2026-08-25", null, 1800),
    ]);

    expect(analytics).toMatchObject({
      targetEligibleLoggedDays: 1,
      adherenceDays: null,
      adherenceState: "incomplete",
      targetsState: "available",
    });
  });

  it("keeps a legitimate zero calorie value eligible and distinct from unknown", () => {
    const analytics = buildWeekAnalytics([
      loggedDay("2026-08-24", 0, 2000),
    ]);

    expect(analytics).toMatchObject({
      targetEligibleLoggedDays: 1,
      adherenceDays: 0,
      adherenceState: "available",
    });
  });

  it("keeps fully known adherence behavior unchanged", () => {
    const analytics = buildWeekAnalytics([
      loggedDay("2026-08-24", 2000, 2000),
      loggedDay("2026-08-25", 1900, 1900),
    ]);

    expect(analytics).toMatchObject({
      targetEligibleLoggedDays: 2,
      adherenceDays: 2,
      adherenceState: "available",
    });
  });

  it("renders incomplete adherence as unavailable instead of a reduced known-only ratio", () => {
    const source = readFileSync(join(process.cwd(), "components/meals/eat-week-view.tsx"), "utf8");
    expect(source).toMatch(/analytics\.adherenceState === "incomplete"[\s\S]*?et\("unavailable"\)/);
  });
});