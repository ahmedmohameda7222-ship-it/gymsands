import { describe, expect, it } from "vitest";

import {
  currentMonthWorkoutHistoryRange,
  validateWorkoutHistoryDateRange,
  zonedLocalDateTimeToIso,
} from "@/lib/workouts/history/date-range";

describe("Workout History calendar ranges", () => {
  it("creates exact local month boundaries across a daylight-saving transition", () => {
    expect(currentMonthWorkoutHistoryRange(
      new Date("2026-03-15T12:00:00.000Z"),
      "Europe/Berlin",
    )).toEqual({
      from: "2026-02-28T23:00:00.000Z",
      to: "2026-03-31T22:00:00.000Z",
      timezone: "Europe/Berlin",
    });
  });

  it("converts local midnight using the offset active on that date", () => {
    expect(zonedLocalDateTimeToIso(
      { year: 2026, month: 11, day: 1 },
      "America/New_York",
    )).toBe("2026-11-01T04:00:00.000Z");
  });

  it("normalizes valid instants and rejects invalid, reversed, or oversized periods", () => {
    expect(validateWorkoutHistoryDateRange(
      "2026-01-01T01:00:00+01:00",
      "2026-02-01T01:00:00+01:00",
      "Europe/Berlin",
    )).toMatchObject({
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-02-01T00:00:00.000Z",
    });
    expect(() => validateWorkoutHistoryDateRange("bad", "worse", "UTC")).toThrow();
    expect(() => validateWorkoutHistoryDateRange(
      "2026-02-01T00:00:00Z",
      "2026-01-01T00:00:00Z",
      "UTC",
    )).toThrow();
    expect(() => validateWorkoutHistoryDateRange(
      "2025-01-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      "UTC",
    )).toThrow();
    expect(() => validateWorkoutHistoryDateRange(
      "2026-01-01T00:00:00Z",
      "2026-02-01T00:00:00Z",
      "Not/A-Timezone",
    )).toThrow();
  });
});
