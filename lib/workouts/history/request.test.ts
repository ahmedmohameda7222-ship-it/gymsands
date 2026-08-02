import { describe, expect, it } from "vitest";

import { parseWorkoutHistoryListRequest, WorkoutHistoryRequestError } from "@/lib/workouts/history/request";

const range = "from=2026-08-01T00%3A00%3A00.000Z&to=2026-09-01T00%3A00%3A00.000Z&timezone=UTC";

describe("Workout History list request", () => {
  it.each([
    "global:11111111-1111-4111-8111-111111111111",
    "custom:22222222-2222-4222-8222-222222222222",
    "provider:plaivra:press-ألماني",
    "name:legacy bench press",
  ])("accepts the stable exercise identity %s", (identity) => {
    const request = parseWorkoutHistoryListRequest(new URL(`https://plaivra.test/api/workouts/history?${range}&exerciseId=${encodeURIComponent(identity)}`));
    expect(request.exerciseIds).toEqual([identity]);
  });

  it("rejects a raw UUID and control characters as exercise identities", () => {
    expect(() => parseWorkoutHistoryListRequest(new URL(`https://plaivra.test/api/workouts/history?${range}&exerciseId=11111111-1111-4111-8111-111111111111`)))
      .toThrow(WorkoutHistoryRequestError);
    expect(() => parseWorkoutHistoryListRequest(new URL(`https://plaivra.test/api/workouts/history?${range}&exerciseId=${encodeURIComponent("name:bad\u0000value")}`)))
      .toThrow(WorkoutHistoryRequestError);
  });
});
