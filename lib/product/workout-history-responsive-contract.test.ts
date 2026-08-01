import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workout History responsive contract", () => {
  it("uses the established 1240 px Train container, tablet gutters, and bounded tablet timeline", () => {
    const container = readFileSync("components/workouts/train-ui.tsx", "utf8");
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");
    const summary = readFileSync("components/workouts/history/workout-history-summary.tsx", "utf8");

    expect(container).toContain("max-w-[1240px]");
    expect(container).toContain("md:px-6");
    expect(page).toContain("md:max-w-[760px] lg:max-w-none");
    expect(summary).toContain('"grid grid-cols-2 gap-2 sm:grid-cols-4"');
  });

  it("reserves a 2:1 desktop timeline/sidebar grid with an approved responsive gap", () => {
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");
    const preview = readFileSync("components/workouts/history/workout-history-desktop-preview.tsx", "utf8");

    expect(page).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]");
    expect(page).toContain("lg:gap-6 xl:gap-8");
    expect(page).toContain("hidden lg:block");
    expect(preview).toContain("sticky top-24");
    expect(preview).not.toContain("performedSets");
  });

  it("exposes selection through a share-safe query parameter and preserves browser history", () => {
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");

    expect(page).toContain('searchParams.get("session")');
    expect(page).toContain('params.set("session", item.activityId)');
    expect(page).toContain("router.push(");
    expect(page).not.toContain("router.replace(");
  });
});
