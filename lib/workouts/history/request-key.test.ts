import { describe, expect, it } from "vitest";

import {
  workoutHistoryCursorRequestKey,
  workoutHistoryFirstPageRequestKey,
} from "@/lib/workouts/history/request-key";
import type { WorkoutHistoryListRequest } from "@/types/workout-history";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

const base: WorkoutHistoryListRequest = {
  from: "2026-08-01T00:00:00.000Z",
  to: "2026-09-01T00:00:00.000Z",
  timezone: "Europe/Berlin",
  limit: 20,
  search: "bench press",
  workoutTypes: ["strength"],
  muscleIds: ["pectoralis_major_sternal"],
  exerciseIds: [
    "global:40000000-0000-4000-8000-000000000001",
  ],
  planIds: ["30000000-0000-4000-8000-000000000001"],
  statuses: ["completed", "partial"],
  progressOnly: true,
  sort: "newest",
};

describe("Workout History canonical request key", () => {
  it("treats equivalent normalized list requests as one first-page key", () => {
    const equivalent: WorkoutHistoryListRequest = {
      ...base,
      cursor: "ignored-first-page-cursor",
      limit: undefined,
      search: "  bench   press  ",
      workoutTypes: ["strength", "strength"],
      muscleIds: [
        "pectoralis_major_sternal",
        "pectoralis_major_sternal",
      ],
      statuses: ["partial", "completed", "partial"],
      sort: undefined,
    };

    expect(
      workoutHistoryFirstPageRequestKey(ownerA, equivalent),
    ).toBe(
      workoutHistoryFirstPageRequestKey(ownerA, {
        ...base,
        limit: 20,
        sort: "newest",
      }),
    );
  });

  it("is independent of filter array ordering", () => {
    const left: WorkoutHistoryListRequest = {
      ...base,
      workoutTypes: ["strength", "conditioning"],
      muscleIds: ["triceps_brachii", "pectoralis_major_sternal"],
    };
    const right: WorkoutHistoryListRequest = {
      ...base,
      workoutTypes: ["conditioning", "strength"],
      muscleIds: ["pectoralis_major_sternal", "triceps_brachii"],
    };

    expect(workoutHistoryFirstPageRequestKey(ownerA, left)).toBe(
      workoutHistoryFirstPageRequestKey(ownerA, right),
    );
  });

  it("changes for another owner or a real committed query change", () => {
    const current = workoutHistoryFirstPageRequestKey(ownerA, base);

    expect(
      workoutHistoryFirstPageRequestKey(ownerB, base),
    ).not.toBe(current);
    expect(
      workoutHistoryFirstPageRequestKey(ownerA, {
        ...base,
        search: "row",
      }),
    ).not.toBe(current);
    expect(
      workoutHistoryFirstPageRequestKey(ownerA, {
        ...base,
        progressOnly: false,
      }),
    ).not.toBe(current);
  });

  it("keeps first-page and cursor identities separate", () => {
    const first = workoutHistoryFirstPageRequestKey(ownerA, {
      ...base,
      cursor: "cursor-a",
    });
    const cursorA = workoutHistoryCursorRequestKey(ownerA, {
      ...base,
      cursor: "cursor-a",
    });
    const cursorB = workoutHistoryCursorRequestKey(ownerA, {
      ...base,
      cursor: "cursor-b",
    });

    expect(first).toBe(
      workoutHistoryFirstPageRequestKey(ownerA, {
        ...base,
        cursor: "cursor-b",
      }),
    );
    expect(cursorA).not.toBe(cursorB);
    expect(cursorA).not.toBe(first);
  });
});
