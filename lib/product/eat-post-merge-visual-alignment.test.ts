import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Eat post-merge visual alignment", () => {
  it("keeps the mobile Eat title and both labeled actions in one horizontal row", () => {
    const route = source("components/meals/eat-page.tsx");
    const header = route.split('<header className=')[1].split('</header>')[0];

    expect(header).toContain('grid-cols-[minmax(0,1fr)_auto]');
    expect(header).toContain('className="min-w-0"');
    expect(header).toContain('flex shrink-0 flex-nowrap');
    expect(header).toContain('whitespace-nowrap');
    expect(header).toContain("OpenAiBlossom");
    expect(header).toContain('et("askChatGpt")');
    expect(header).toContain("<Plus");
    expect(header).toContain('et("addFood")');
    expect(header).not.toContain("flex flex-col gap-3");
  });

  it("removes only the standalone Remaining Today instance while preserving progress, Food Log, and Water", () => {
    const route = source("components/meals/eat-page.tsx");
    const daySections = source("components/meals/eat-day-sections.tsx");

    expect(route).not.toContain("RemainingToday");
    expect(route).toContain("<EatNutritionProgress");
    expect(route).toContain("<EatFoodLog");
    expect(route).toContain("<CompactHydration");
    expect(route).toContain('<aside className="space-y-4"><CompactHydration');
    expect(daySections).toContain("export function RemainingToday");
  });

  it("centers and optically sizes Tracking Coverage without changing its data", () => {
    const week = source("components/meals/eat-week-view.tsx");

    expect(week).toContain('min-h-20 flex-col items-center justify-center gap-1.5 p-4 text-center');
    expect(week).toContain('et("weekCoverage")');
    expect(week).toContain('et("daysLogged", { count: analytics.loggedDays })');
    expect(week).toContain('et("averagesLogged")');
    expect(week).not.toContain('sm:flex-row sm:items-center sm:justify-between"><p className="text-sm font-semibold">{et("weekCoverage")');
    expect(week).toContain("const analytics = buildWeekAnalytics(days)");
  });

  it("keeps four centered Week metric cards with wrapping values", () => {
    const week = source("components/meals/eat-week-view.tsx");
    const metricCalls = week.match(/<Metric label=/g) ?? [];

    expect(metricCalls).toHaveLength(4);
    expect(week).toContain('min-h-24 flex-col items-center justify-center gap-1.5 p-4 text-center');
    expect(week).toContain('max-w-full whitespace-normal break-words');
    expect(week).toContain('label={et("avgCalories")}');
    expect(week).toContain('label={et("avgProtein")}');
    expect(week).toContain('label={et("calendarAverage")}');
    expect(week).toContain('label={et("adherence")}');
  });

  it("geometrically centers the native Nutrition Targets date control", () => {
    const targets = source("components/meals/nutrition-target-settings.tsx");
    const dateField = targets.split('<Input type="date"')[1].split(" /></label>")[0];

    expect(dateField).toContain("value={selectedDate}");
    expect(dateField).toContain('aria-label={nt("date")}');
    expect(dateField).toContain("onChange={(event) => navigateDate(event.target.value)}");
    expect(dateField).toContain("centered-date-input");
    expect(dateField).toContain("px-12");
    expect(dateField).toContain("[&::-webkit-datetime-edit]:justify-center");
    expect(dateField).toContain("[&::-webkit-datetime-edit-fields-wrapper]:justify-center");
    expect(dateField).toContain("[&::-webkit-calendar-picker-indicator]:absolute");
    expect(dateField).toContain("[&::-webkit-calendar-picker-indicator]:end-3");
    expect(targets).toContain('aria-label={nt("previousDay")}');
    expect(targets).toContain('aria-label={nt("nextDay")}');
    expect(targets).toContain("buildNutritionTargetsDateHref");
    expect(targets).toContain("useUnsavedChangesGuard");
    expect(targets).toContain("rtl:rotate-180");
  });
});
