import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Workout History responsive contract", () => {
  it("uses a bounded flat single-column archive without KPI or preview layouts", () => {
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");
    const row = readFileSync("components/workouts/history/workout-history-card.tsx", "utf8");
    expect(page).toContain("max-w-4xl");
    expect(page).not.toContain("DesktopPreview");
    expect(page).not.toContain("selected:");
    expect(row).toContain("border-b border-border/70");
    expect(row).not.toContain("min-h-[158px]");
  });

  it("uses mobile-bottom and desktop-centered dialogs with safe-area space", () => {
    const dialog = readFileSync("components/ui/dialog.tsx", "utf8");
    const period = readFileSync("components/workouts/history/workout-history-period-control.tsx", "utf8");
    expect(dialog).toContain("bottom-0");
    expect(dialog).toContain("sm:top-1/2");
    expect(period).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps search independent when clearing filters", () => {
    const page = readFileSync("components/workouts/history/workout-history-page.tsx", "utf8");
    const clearFilters = page.slice(page.indexOf("function clearFilters"), page.indexOf("function clearSearch"));
    expect(clearFilters).not.toContain('search: ""');
  });
});
