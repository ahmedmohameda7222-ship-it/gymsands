import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { ActiveWorkoutMinimizedBar } from "./active-workout-minimized-bar";

function render(state: "active" | "rest" | "paused" | "review" | "error") {
  return renderToStaticMarkup(
    <ActiveWorkoutMinimizedBar
      state={state}
      href="/workouts/session/day/day-1"
      title="Bench press"
      meta="Set 2 of 3"
      timer="01:24"
      progress={0.51}
      openLabel="Open active workout"
      actionLabel={state === "paused" ? "Resume" : state === "review" ? "Review" : "Pause"}
      actionPending={false}
      onAction={state === "active" || state === "paused" ? vi.fn() : undefined}
    />
  );
}

describe("AW-7 minimized workout bar", () => {
  it("renders one compact controller with authoritative progress and no terminal actions", () => {
    const markup = render("active");

    expect(markup).toContain("data-active-workout-minimized-bar");
    expect(markup).toContain('data-active-workout-minimized-state="active"');
    expect(markup).toContain('aria-valuenow="51"');
    expect(markup).toContain("Bench press");
    expect(markup).toContain("Pause");
    expect(markup).not.toContain("Finish");
    expect(markup).not.toContain("Cancel workout");
  });

  it("keeps paused and review projections linkable without nested anchors", () => {
    const paused = render("paused");
    const review = render("review");

    expect(paused).toContain('data-active-workout-minimized-state="paused"');
    expect(paused).toContain("Resume");
    expect(review).toContain('data-active-workout-minimized-state="review"');
    expect(review).toContain("Review");
    expect((review.match(/<a /g) ?? [])).toHaveLength(2);
    const firstClose = review.indexOf("</a>");
    const secondOpen = review.indexOf("<a ", review.indexOf("<a ") + 1);
    expect(firstClose).toBeLessThan(secondOpen);
  });
});
