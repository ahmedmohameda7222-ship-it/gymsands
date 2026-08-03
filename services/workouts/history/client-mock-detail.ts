"use client";

import {
  mockHistory,
  renderedQaScenario,
} from "@/services/workouts/history/client-mock-shared";
import { WorkoutHistoryClientError } from "@/services/workouts/history/client-error";
import {
  WORKOUT_HISTORY_CONTRACT_VERSION,
  type WorkoutHistorySessionDetailResponse,
} from "@/types/workout-history";

export function mockHistoryDetail(
  userId: string,
  source: "performed" | "scheduled_fallback",
  id: string,
): WorkoutHistorySessionDetailResponse {
  if (source === "scheduled_fallback") {
    return {
      contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
      activity: {
        contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
        activityId: `scheduled:${id}`,
        canonicalSessionId: null,
        scheduledSessionId: id,
        userId,
        sourceKind: "scheduled_fallback",
        lifecycle: "completed",
        title: "Saved scheduled workout",
        category: null,
        effectiveAt: "2026-07-20T09:00:00.000Z",
        startedAt: null,
        completedAt: "2026-07-20T09:00:00.000Z",
        skippedAt: null,
        cancelledAt: null,
        durationMinutes: 40,
        notes: "Older scheduled record.",
        planId: null,
        planDayId: null,
        planWeekId: null,
        planSessionId: null,
        hasPerformedSets: false,
        hasMeaningfulPerformance: false,
        capabilities: {
          openDetails: true,
          showPerformedSets: false,
          showPlannedVsActual: false,
          showMuscleAnalysis: false,
          calculatePerformanceMetrics: false,
          calculateVerifiedRecords: false,
          repeatWorkout: false,
          correctSession: false,
          softDeleteSession: false,
        },
      },
      summary: {
        exerciseCount: null,
        completedSetCount: null,
        reliableVolume: null,
        verifiedRecordCount: null,
      },
      snapshot: null,
      exercises: [
        {
          identity: "compatibility:1:bench-press",
          exerciseId: null,
          snapshotItemId: null,
          name: "Bench press",
          plannedName: "Bench press",
          state: null,
          category: null,
          plannedSetCount: null,
          performedSets: [],
          missingPlannedSets: [],
        },
      ],
      timeline: [],
      notices: ["partial-availability"],
    };
  }
  const activity = mockHistory(userId, 100).activities.find(
    (candidate) => candidate.canonicalSessionId === id,
  );
  if (!activity) {
    throw new WorkoutHistoryClientError(
      "history_not_found",
      "Workout history item was not found.",
      404,
    );
  }
  const plannedSet = (setOrder: number) => ({
    id: `30000000-0000-4000-8000-${String(setOrder).padStart(
      12,
      "0",
    )}`,
    setOrder,
    setType: "working",
    targetMode: "range",
    sideMode: "bilateral",
    restSeconds: 90,
    tempoTarget: null,
    targets: [
      {
        metricKey: "repetitions",
        side: "none" as const,
        targetMode: "range",
        targetValue: null,
        minimumValue: 8,
        maximumValue: 10,
      },
    ],
  });
  const exercises = ["Bench press", "Row"].map(
    (name, exerciseIndex) => ({
      identity: `40000000-0000-4000-8000-${String(
        exerciseIndex + 1,
      ).padStart(12, "0")}`,
      exerciseId: null,
      snapshotItemId: `40000000-0000-4000-8000-${String(
        exerciseIndex + 1,
      ).padStart(12, "0")}`,
      name,
      plannedName: name,
      state: "completed" as const,
      category: "strength",
      plannedSetCount: 4,
      performedSets: [1, 2, 3, 4].map((setNumber) => ({
        id: `50000000-0000-4000-${String(
          exerciseIndex + 1,
        ).padStart(4, "0")}-${String(setNumber).padStart(
          12,
          "0",
        )}`,
        setNumber,
        reps: 10 - (setNumber % 2),
        weightKg: exerciseIndex === 0 ? 70 : 60,
        completedAt: activity.completedAt,
        notes:
          setNumber === 4 && exerciseIndex === 0
            ? "Controlled finish."
            : null,
        setType: setNumber === 1 ? "warmup" : "working",
        rpe: setNumber === 4 ? 8 : null,
        rir: setNumber === 4 ? 2 : null,
        matchState: "matched" as const,
        plannedSet: plannedSet(setNumber),
        metrics: [],
        segments: [],
        verifiedRecords:
          exerciseIndex === 0 && setNumber === 2
            ? [
                {
                  id: "70000000-0000-4000-8000-000000000001",
                  recordType: "highest_load" as const,
                  currentValue: 82.5,
                  previousValue: 80,
                  unit: "kg" as const,
                  estimated: false,
                },
              ]
            : [],
      })),
      missingPlannedSets: [],
    }),
  );
  return {
    contractVersion: WORKOUT_HISTORY_CONTRACT_VERSION,
    activity: {
      ...activity,
      notes: "Good control and consistent tempo.",
    },
    summary: {
      exerciseCount: 2,
      completedSetCount: 8,
      reliableVolume: 5_420,
      verifiedRecordCount: 1,
    },
    snapshot: null,
    exercises,
    timeline: [
      {
        id: "60000000-0000-4000-8000-000000000001",
        type: "workout_started",
        occurredAt: activity.startedAt ?? activity.effectiveAt,
        exerciseName: null,
      },
      {
        id: "60000000-0000-4000-8000-000000000002",
        type: "workout_completed",
        occurredAt:
          activity.completedAt ?? activity.effectiveAt,
        exerciseName: null,
      },
    ],
    notices: [],
  };
}

export function mockHistoryDetailForRenderedQa(
  userId: string,
  source: "performed" | "scheduled_fallback",
  id: string,
): WorkoutHistorySessionDetailResponse {
  const detail = mockHistoryDetail(userId, source, id);
  const scenario = renderedQaScenario();
  if (scenario === "long-notes") {
    return {
      ...detail,
      activity: {
        ...detail.activity,
        notes:
          "Long saved note: controlled tempo, stable breathing, careful setup, deliberate pauses, and consistent technique across every completed working set. ".repeat(
            8,
          ),
      },
    };
  }
  if (
    scenario === "v1-muscle-snapshot" ||
    scenario === "v2-muscle-snapshot"
  ) {
    return {
      ...detail,
      snapshot: {
        id: `23000000-0000-4000-8000-${
          scenario === "v1-muscle-snapshot"
            ? "000000000001"
            : "000000000002"
        }`,
        schemaVersion:
          scenario === "v1-muscle-snapshot"
            ? "workout_session_muscle_snapshot_v1"
            : "workout_session_muscle_snapshot_v2",
        frozenAt: detail.activity.effectiveAt,
      },
    };
  }
  if (scenario === "post-correction-detail") {
    return {
      ...detail,
      historyRevision: 2,
      activity: {
        ...detail.activity,
        notes:
          "Corrected session note saved through the trusted history authority.",
        durationMinutes: 61,
      },
    };
  }
  return detail;
}
