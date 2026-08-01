import { describe, expect, it } from "vitest";

import {
  decodeWorkoutHistoryCursor,
  encodeWorkoutHistoryCursor,
  WorkoutHistoryCursorError,
} from "@/lib/workouts/history/cursor";

const secret = "test-only-workout-history-cursor-secret-123456789";

describe("Workout History cursor", () => {
  it("round trips the signed stable sort tuple", () => {
    const payload = {
      contractVersion: 1 as const,
      sort: "longest_duration" as const,
      effectiveAt: "2026-08-01T09:30:00.000Z",
      activityId: "performed:11111111-1111-4111-8111-111111111111",
      durationMinutes: 47,
    };

    expect(decodeWorkoutHistoryCursor(encodeWorkoutHistoryCursor(payload, secret), secret))
      .toEqual(payload);
  });

  it("rejects a tampered payload and signature", () => {
    const cursor = encodeWorkoutHistoryCursor({
      contractVersion: 1,
      sort: "newest",
      effectiveAt: "2026-08-01T09:30:00.000Z",
      activityId: "scheduled:22222222-2222-4222-8222-222222222222",
      durationMinutes: null,
    }, secret);
    const [payload, signature] = cursor.split(".");

    expect(() => decodeWorkoutHistoryCursor(`${payload}a.${signature}`, secret))
      .toThrow(WorkoutHistoryCursorError);
    expect(() => decodeWorkoutHistoryCursor(`${payload}.${signature?.slice(1)}x`, secret))
      .toThrow(WorkoutHistoryCursorError);
  });

  it("rejects malformed, oversized, and under-keyed cursors", () => {
    expect(() => decodeWorkoutHistoryCursor("not-a-cursor", secret))
      .toThrow(WorkoutHistoryCursorError);
    expect(() => decodeWorkoutHistoryCursor(`${"a".repeat(1025)}.x`, secret))
      .toThrow(WorkoutHistoryCursorError);
    expect(() => encodeWorkoutHistoryCursor({
      contractVersion: 1,
      sort: "newest",
      effectiveAt: "2026-08-01T09:30:00.000Z",
      activityId: "performed:test",
      durationMinutes: null,
    }, "short"))
      .toThrow("cursor secret is not configured");
  });
});
