import { describe, expect, it } from "vitest";

import type {
  PerformedWorkoutHistoryCandidate,
  ScheduledWorkoutHistoryRow,
} from "@/lib/workouts/history/contracts";
import {
  resolveCanonicalWorkoutActivity,
  WorkoutHistoryOwnerMismatchError,
} from "@/lib/workouts/history/resolve-activity";

const owner = "20000000-0000-4000-8000-000000000001";

function performed(
  id: string,
  overrides: Partial<PerformedWorkoutHistoryCandidate["session"]> = {},
  metadata: Partial<PerformedWorkoutHistoryCandidate["metadata"]> = {},
): PerformedWorkoutHistoryCandidate {
  return {
    session: {
      id,
      user_id: owner,
      scheduled_session_id: null,
      workout_name: "Strength",
      workout_day_name: null,
      workout_category: "strength",
      started_at: "2026-07-01T08:00:00.000Z",
      completed_at: "2026-07-01T09:00:00.000Z",
      skipped_at: null,
      cancelled_at: null,
      duration_minutes: null,
      notes: null,
      status: "completed",
      ...overrides,
    },
    metadata: {
      completedSetCount: 1,
      structuredPerformedMetricCount: 0,
      actualPerformedSnapshotCount: 0,
      plannedSetCount: null,
      ...metadata,
    },
  };
}

function scheduled(
  id: string,
  overrides: Partial<ScheduledWorkoutHistoryRow> = {},
): ScheduledWorkoutHistoryRow {
  return {
    id,
    user_id: owner,
    user_workout_plan_id: "30000000-0000-4000-8000-000000000001",
    plan_day_id: null,
    scheduled_date: "2026-07-01",
    day_title: "Strength",
    status: "completed",
    started_at: null,
    completed_at: "2026-07-01T09:00:00.000Z",
    skipped_at: null,
    duration_minutes: null,
    notes: null,
    ...overrides,
  };
}

describe("canonical Workout History resolver", () => {
  it("suppresses the linked scheduled duplicate in the Production shape", () => {
    const linkedId = "40000000-0000-4000-8000-000000000001";
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001", { scheduled_session_id: linkedId })],
      scheduledTerminal: [scheduled(linkedId)],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0]).toMatchObject({ sourceKind: "performed", canonicalSessionId: "10000000-0000-4000-8000-000000000001" });
  });

  it("keeps unlinked scheduled fallback and direct performed sessions", () => {
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001")],
      scheduledTerminal: [scheduled("40000000-0000-4000-8000-000000000001")],
    });
    expect(activities.map((activity) => activity.sourceKind).sort()).toEqual([
      "performed",
      "scheduled_fallback",
    ]);
  });

  it("counts linked skipped activity once and never as completed", () => {
    const linkedId = "40000000-0000-4000-8000-000000000001";
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001", {
        scheduled_session_id: linkedId,
        status: "skipped",
        completed_at: null,
        skipped_at: "2026-07-01T09:00:00.000Z",
      }, { completedSetCount: 0 })],
      scheduledTerminal: [scheduled(linkedId, { status: "skipped", completed_at: null, skipped_at: "2026-07-01T09:00:00.000Z" })],
    });
    expect(activities).toHaveLength(1);
    expect(activities[0].lifecycle).toBe("skipped");
  });

  it("excludes started and empty cancelled roots by default", () => {
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [
        performed("10000000-0000-4000-8000-000000000001", { status: "started", completed_at: null }),
        performed("10000000-0000-4000-8000-000000000002", { status: "cancelled", completed_at: null, cancelled_at: "2026-07-01T09:00:00.000Z" }, { completedSetCount: 0 }),
      ],
      scheduledTerminal: [],
    });
    expect(activities).toEqual([]);
  });

  it("recognizes meaningful cancelled work only under an explicit status filter", () => {
    const candidate = performed("10000000-0000-4000-8000-000000000001", {
      status: "cancelled",
      completed_at: null,
      cancelled_at: "2026-07-01T09:00:00.000Z",
    });
    expect(resolveCanonicalWorkoutActivity({ ownerUserId: owner, performed: [candidate], scheduledTerminal: [] })).toEqual([]);
    expect(resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [candidate],
      scheduledTerminal: [],
      eligibility: { statuses: ["cancelled"] },
    })[0]?.lifecycle).toBe("cancelled");
  });

  it("fails closed on either source owner mismatch", () => {
    expect(() => resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001", { user_id: "90000000-0000-4000-8000-000000000001" })],
      scheduledTerminal: [],
    })).toThrow(WorkoutHistoryOwnerMismatchError);
    expect(() => resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [],
      scheduledTerminal: [scheduled("40000000-0000-4000-8000-000000000001", { user_id: "90000000-0000-4000-8000-000000000001" })],
    })).toThrow(WorkoutHistoryOwnerMismatchError);
  });

  it("keeps unknown duration null and never expands planned sets", () => {
    const [activity] = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001", {}, { completedSetCount: 0, plannedSetCount: 4 })],
      scheduledTerminal: [],
    });
    expect(activity.durationMinutes).toBeNull();
    expect(activity.hasPerformedSets).toBe(false);
  });

  it("orders equal timestamps by stable activity identity descending", () => {
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [
        performed("10000000-0000-4000-8000-000000000001"),
        performed("10000000-0000-4000-8000-000000000002"),
      ],
      scheduledTerminal: [],
    });
    expect(activities.map((activity) => activity.activityId)).toEqual([
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000001",
    ]);
  });

  it("uses deleted performed roots for linked fallback suppression", () => {
    const linkedId = "40000000-0000-4000-8000-000000000001";
    const activities = resolveCanonicalWorkoutActivity({
      ownerUserId: owner,
      performed: [performed("10000000-0000-4000-8000-000000000001", {
        scheduled_session_id: linkedId,
        deleted_at: "2026-07-02T00:00:00.000Z",
      })],
      scheduledTerminal: [scheduled(linkedId)],
    });
    expect(activities).toEqual([]);
  });
});
