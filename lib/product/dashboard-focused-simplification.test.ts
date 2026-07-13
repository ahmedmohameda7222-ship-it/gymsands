import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("focused Today dashboard", () => {
  it("keeps only progress, plan, wellness, and relevant shopping sections", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain("<TodayProgress");
    expect(dashboard).toContain('aria-labelledby="today-plan"');
    expect(dashboard).toContain("<WellnessToday");
    expect(dashboard).toContain('aria-labelledby="shopping-list"');
    expect(dashboard).not.toContain('id="today-now"');
    expect(dashboard).not.toContain("setupChecklist");
    expect(dashboard).not.toContain("quickLogRoutes");
    expect(dashboard).not.toContain("/api/mcp/connections");
    expect(dashboard).not.toContain("DailyCheckins");
  });

  it("configures exactly calories, protein, carbs, fat, and water progress metrics", () => {
    const progress = source("components/dashboard/today-progress.tsx");
    for (const key of ["calories", "protein", "carbs", "fat", "water"]) {
      expect(progress).toContain(`key: "${key}"`);
    }
    expect(progress).not.toContain('key: "workout"');
    expect(progress.match(/key: "(calories|protein|carbs|fat|water)"/g)).toHaveLength(5);
    expect(progress).toContain("overTargetValue");
  });

  it("preserves correct workout and meal-plan routes", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain('href="/my-workout/plans"');
    expect(dashboard).toContain("`/my-meal-plan?tab=day&date=${today}`");
    expect(dashboard).toContain("markDirectMealPlanItemDone");
    expect(dashboard).toContain("markDirectMealPlanItemSkipped");
  });

  it("removes the Daily Check-in component from active Dashboard and Wellness routes", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    const wellness = source("app/(private)/wellness/page.tsx");
    expect(dashboard).not.toMatch(/DailyCheckins|getDailyCheckins|checkinAvailable|checkinLoggedToday/);
    expect(wellness).not.toMatch(/DailyCheckins|getDailyCheckins|UserDailyCheckin|wellness-check-in/);
    expect(existsSync("components/wellness/daily-checkins.tsx")).toBe(false);
  });

  it("uses independent source states without connection or setup loaders", () => {
    const dashboard = source("components/dashboard/today-dashboard.tsx");
    expect(dashboard).toContain('["workout", "meals", "nutrition", "hydration", "shopping", "wellness"]');
    expect(dashboard).not.toContain('"connection"');
    expect(dashboard).not.toContain('"setup"');
    expect(dashboard).toContain("requestVersion.current");
  });

  it("keeps localized English, German, and Arabic focused copy", () => {
    const copy = source("lib/dashboard/focused-today-copy.ts");
    expect(copy).toContain('carbs: "Kohlenhydrate"');
    expect(copy).toContain('carbs: "الكربوهيدرات"');
    expect(copy).toContain('openTrain: "Training öffnen"');
    expect(copy).toContain('openWellness: "فتح العافية"');
  });

  it("preserves historical schema and adds no migration", () => {
    const migrationLedger = source("supabase/migration-ledger.json");
    expect(migrationLedger).toContain("user_daily_checkins");
  });
});
