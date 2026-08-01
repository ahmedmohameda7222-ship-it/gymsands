import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentPaths = [
  "components/workouts/history/workout-history-page.tsx",
  "components/workouts/history/workout-history-header.tsx",
  "components/workouts/history/workout-history-period-control.tsx",
  "components/workouts/history/workout-history-summary.tsx",
  "components/workouts/history/workout-history-search.tsx",
  "components/workouts/history/workout-history-filters.tsx",
  "components/workouts/history/workout-history-timeline.tsx",
  "components/workouts/history/workout-history-card.tsx",
  "components/workouts/history/workout-history-state-view.tsx",
  "components/workouts/history/workout-history-load-more.tsx",
] as const;
const surface = componentPaths.map((path) => readFileSync(path, "utf8")).join("\n");

describe("Workout History localized surface contract", () => {
  it("routes every member-facing state and action through the Train dictionary", () => {
    for (const key of [
      "historyPageTitle", "historyPeriodThreeMonths", "historySearchPlaceholder",
      "historyFiltersAction", "historyEmptyTitle", "historyFilteredEmptyTitle",
      "historyLoadFailedTitle", "historyStaleNotice", "historyPartialNotice",
      "historyLoadMore", "historyOpenDetails",
    ]) {
      expect(surface).toContain(`tr("${key}"`);
    }
    expect(surface).not.toContain("raw source");
    expect(surface).not.toContain("sync state");
    expect(surface).not.toContain("device state");
    expect(surface).not.toContain("import state");
  });

  it("keeps RTL direction and localized calendar formatting at the surface boundary", () => {
    expect(surface).toContain('dir={dir}');
    expect(surface).toContain("Intl.DateTimeFormat(locale");
    expect(surface).toContain("rtl:rotate-180");
    expect(surface).not.toContain("toLocaleDateString()");
  });
});
