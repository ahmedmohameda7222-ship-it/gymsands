import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/train", () => ({
  useTrainTranslation: () => ({ tr: (key: string) => key }),
}));

import { WorkoutHistoryStateView, type WorkoutHistoryPageState } from "@/components/workouts/history/workout-history-state-view";

function render(state: WorkoutHistoryPageState) {
  return renderToStaticMarkup(
    <WorkoutHistoryStateView state={state} onRetry={vi.fn()} onClearFilters={vi.fn()} />,
  );
}

describe("Workout History page states", () => {
  it("renders geometry-matching loading cards without a blank spinner screen", () => {
    const markup = render("initial-loading");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain("border-b");
    expect((markup.match(/animate-pulse/g) ?? [])).toHaveLength(12);
    expect(markup).not.toContain("animate-spin");
  });

  it("keeps empty, filtered-empty, and blocking-error actions distinct", () => {
    expect(render("empty")).toContain("historyStartWorkout");
    expect(render("empty")).toContain("historyCreatePlan");
    expect(render("filtered-empty")).toContain("historyClearFilters");
    expect(render("blocking-error")).toContain("historyRetry");
  });

  it("shows at most one quiet ready notice", () => {
    const markup = renderToStaticMarkup(
      <WorkoutHistoryStateView
        state="ready"
        notice="stale-data"
        onRetry={vi.fn()}
        onClearFilters={vi.fn()}
      />,
    );
    expect(markup).toContain("historyStaleNotice");
    expect((markup.match(/role="status"/g) ?? [])).toHaveLength(1);
  });
});
