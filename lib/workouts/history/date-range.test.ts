import { describe, expect, it } from "vitest";

import {
  customWorkoutHistoryPeriodRange,
  currentMonthWorkoutHistoryRange,
  shiftWorkoutHistoryPeriodAnchor,
  shiftWorkoutHistoryPeriodRange,
  validateWorkoutHistoryDateRange,
  workoutHistoryPeriodRange,
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

  it("builds week, three-month, custom, and shifted calendar periods in the user timezone", () => {
    expect(workoutHistoryPeriodRange(
      "week",
      new Date("2026-08-05T12:00:00.000Z"),
      "Europe/Berlin",
    )).toMatchObject({
      from: "2026-08-02T22:00:00.000Z",
      to: "2026-08-09T22:00:00.000Z",
    });
    expect(workoutHistoryPeriodRange(
      "three-months",
      new Date("2026-08-05T12:00:00.000Z"),
      "Europe/Berlin",
    )).toMatchObject({
      from: "2026-05-31T22:00:00.000Z",
      to: "2026-08-31T22:00:00.000Z",
    });
    expect(customWorkoutHistoryPeriodRange("2026-08-01", "2026-08-03", "Europe/Berlin"))
      .toMatchObject({
        from: "2026-07-31T22:00:00.000Z",
        to: "2026-08-03T22:00:00.000Z",
      });
    expect(shiftWorkoutHistoryPeriodAnchor(
      new Date("2026-08-05T12:00:00.000Z"),
      "month",
      -1,
    ).toISOString()).toBe("2026-07-01T12:00:00.000Z");
    expect(shiftWorkoutHistoryPeriodRange(
      "2026-07-31T22:00:00.000Z",
      "month",
      -1,
      "Europe/Berlin",
    )).toMatchObject({
      from: "2026-06-30T22:00:00.000Z",
      to: "2026-07-31T22:00:00.000Z",
    });
    expect(shiftWorkoutHistoryPeriodRange(
      "2026-07-31T10:00:00.000Z",
      "month",
      -1,
      "Pacific/Kiritimati",
    )).toMatchObject({
      from: "2026-06-30T10:00:00.000Z",
      to: "2026-07-31T10:00:00.000Z",
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
