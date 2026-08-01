import { describe, expect, it } from "vitest";

import {
  parseWorkoutHistoryNavigationState,
  workoutHistoryNavigationSearchParams,
} from "@/lib/workouts/history/navigation-state";

describe("Workout History navigation state", () => {
  it("round-trips every approved public URL field with Unicode and literal wildcards", () => {
    const source = new URLSearchParams({
      period: "custom",
      from: "2026-07-01",
      to: "2026-07-31",
      q: "  تمرين Rücken 100%_  ",
      type: "strength",
      muscle: "pectoralis_major_sternal",
      exercise: "provider:plaivra:bench.press-1",
      plan: "11111111-1111-4111-8111-111111111111",
      status: "partial,completed",
      progress: "true",
      sort: "longest_duration",
      selected: "performed:22222222-2222-4222-8222-222222222222",
    });
    const parsed = parseWorkoutHistoryNavigationState(source, new Date("2026-08-01T12:00:00Z"), "UTC");
    const restored = parseWorkoutHistoryNavigationState(
      workoutHistoryNavigationSearchParams(parsed),
      new Date("2026-08-01T12:00:00Z"),
      "UTC",
    );
    expect(restored).toEqual(parsed);
    expect(workoutHistoryNavigationSearchParams(parsed).has("cursor")).toBe(false);
    expect(workoutHistoryNavigationSearchParams(parsed).has("notes")).toBe(false);
  });

  it("defaults to the current month, completed plus partial, and newest", () => {
    const parsed = parseWorkoutHistoryNavigationState(new URLSearchParams(), new Date("2026-08-15T12:00:00Z"), "UTC");
    expect(parsed).toMatchObject({ period: "month", statuses: ["completed", "partial"], sort: "newest" });
    expect(parsed.range).toMatchObject({ from: "2026-08-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
  });

  it("preserves local calendar dates across a positive UTC offset", () => {
    const parsed = parseWorkoutHistoryNavigationState(
      new URLSearchParams("period=custom&from=2026-07-01&to=2026-07-31"),
      new Date("2026-08-01T12:00:00Z"),
      "Europe/Berlin",
    );
    expect(workoutHistoryNavigationSearchParams(parsed).get("from")).toBe("2026-07-01");
    expect(workoutHistoryNavigationSearchParams(parsed).get("to")).toBe("2026-07-31");
  });
});
