import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ActiveWorkoutMinimizedBar,
  projectActiveWorkoutMinimizedProgress
} from "./active-workout-minimized-bar";
import {
  ActiveWorkoutDraftValidationError,
  acknowledgeSetWrites,
  buildActiveWorkoutReview,
  buildCanonicalLogRows,
  buildSummary,
  hasPendingValidSetWrites,
  type ActiveWorkoutExerciseState,
  type ActiveWorkoutSetState
} from "./active-workout/active-workout-runtime-model";
import type { ExerciseLog, WorkoutSessionPrescriptionItem } from "@/types";

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

function prescriptionItem(input: {
  id: string;
  itemOrder: number;
  activityName: string;
  setCount: number;
  executionState?: "planned" | "completed" | "adjusted" | "skipped";
  sourcePlanExerciseId?: string | null;
  sourcePlanActivityId?: string | null;
}) {
  return {
    id: input.id,
    itemOrder: input.itemOrder,
    activityName: input.activityName,
    plannedSets: input.setCount,
    prescriptionSets: Array.from({ length: input.setCount }, (_, index) => ({
      setOrder: index + 1
    })),
    executionState: input.executionState ?? "planned",
    sourcePlanExerciseId: input.sourcePlanExerciseId ?? null,
    sourcePlanActivityId: input.sourcePlanActivityId ?? null
  } as unknown as WorkoutSessionPrescriptionItem;
}

function performedLog(input: {
  id: string;
  planExerciseId?: string | null;
  planActivityId?: string | null;
  exerciseOrder?: number | null;
  completed?: boolean;
}) {
  return {
    id: input.id,
    plan_exercise_id: input.planExerciseId ?? null,
    plan_activity_id: input.planActivityId ?? null,
    exercise_order: input.exerciseOrder ?? null,
    completed_at: input.completed === false ? null : "2026-07-30T20:00:00.000Z"
  } as unknown as ExerciseLog;
}

function setState(input: Partial<ActiveWorkoutSetState> = {}): ActiveWorkoutSetState {
  return {
    setNumber: 1,
    reps: "",
    weightKg: "",
    notes: "",
    rpe: "",
    rir: "",
    setType: "working",
    sideMode: "none",
    plannedTempo: null,
    performedTempo: null,
    tempoAdherence: "not_recorded",
    detailSource: "manual",
    detailSourceProvider: "plaivra",
    detailSourceVersion: "aw3c-v1",
    hasPersistedLog: false,
    hasSetDetails: false,
    setDetailsWriteRequired: false,
    logWriteRequired: false,
    completedAt: null,
    frozenPrescriptionSet: null,
    plannedReps: null,
    plannedRestSeconds: null,
    ...input
  };
}

function exerciseState(input: {
  skipped?: boolean;
  completedSets?: number;
  setCount?: number;
  draft?: Partial<ActiveWorkoutSetState>;
} = {}): ActiveWorkoutExerciseState {
  const setCount = input.setCount ?? 3;
  const completedSets = input.completedSets ?? 0;
  return {
    exercise: {
      id: "exercise-1",
      plan_day_id: "day-1",
      workout_id: "workout-1",
      source_workout_id: "workout-1",
      exercise_name: "Bench press",
      category: "Chest",
      target_muscle: "chest",
      equipment: "barbell",
      sets: setCount,
      reps: "8-10",
      rest_seconds: 90,
      instructions: null,
      exercise_url: null,
      video_url: null,
      custom_video_url: null,
      sort_order: 1,
      notes: null
    },
    prescriptionItem: prescriptionItem({
      id: "item-1",
      itemOrder: 1,
      activityName: "Bench press",
      setCount,
      executionState: input.skipped ? "skipped" : "planned",
      sourcePlanExerciseId: "exercise-1"
    }),
    sets: Array.from({ length: setCount }, (_, index) => setState({
      setNumber: index + 1,
      reps: index < completedSets ? "8" : "",
      weightKg: index < completedSets ? "80" : "",
      completedAt: index < completedSets
        ? `2026-07-30T20:0${index}:00.000Z`
        : null,
      hasPersistedLog: index < completedSets,
      ...(index === 0 ? input.draft : {})
    }))
  } as ActiveWorkoutExerciseState;
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

  it("excludes a fully skipped exercise with no completed work", () => {
    const active = prescriptionItem({
      id: "active-item",
      itemOrder: 1,
      activityName: "Back squat",
      setCount: 2,
      sourcePlanExerciseId: "active-exercise"
    });
    const skipped = prescriptionItem({
      id: "skipped-item",
      itemOrder: 2,
      activityName: "Bench press",
      setCount: 3,
      executionState: "skipped",
      sourcePlanExerciseId: "skipped-exercise"
    });

    const projection = projectActiveWorkoutMinimizedProgress(
      [active, skipped],
      [
        performedLog({ id: "active-1", planExerciseId: "active-exercise" }),
        performedLog({ id: "active-2", planExerciseId: "active-exercise" })
      ]
    );

    expect(projection).toEqual({
      totalSetCount: 2,
      completedSetCount: 2,
      progress: 1
    });
  });

  it("preserves completed work when remaining sets are skipped", () => {
    const active = prescriptionItem({
      id: "active-item",
      itemOrder: 1,
      activityName: "Back squat",
      setCount: 2,
      sourcePlanExerciseId: "active-exercise"
    });
    const skippedAfterPartial = prescriptionItem({
      id: "skipped-item",
      itemOrder: 2,
      activityName: "Bench press",
      setCount: 3,
      executionState: "skipped",
      sourcePlanExerciseId: "skipped-exercise"
    });

    const projection = projectActiveWorkoutMinimizedProgress(
      [active, skippedAfterPartial],
      [
        performedLog({ id: "active-1", planExerciseId: "active-exercise" }),
        performedLog({ id: "active-2", planExerciseId: "active-exercise" }),
        performedLog({ id: "skipped-1", planExerciseId: "skipped-exercise" })
      ]
    );

    expect(projection).toEqual({
      totalSetCount: 3,
      completedSetCount: 3,
      progress: 1
    });
  });

  it("keeps all canonical completed logs when no prescription item is skipped", () => {
    const squat = prescriptionItem({
      id: "squat-item",
      itemOrder: 1,
      activityName: "Back squat",
      setCount: 3
    });
    const bench = prescriptionItem({
      id: "bench-item",
      itemOrder: 2,
      activityName: "Bench press",
      setCount: 3
    });

    const projection = projectActiveWorkoutMinimizedProgress(
      [squat, bench],
      [performedLog({ id: "legacy-log" })]
    );

    expect(projection.totalSetCount).toBe(6);
    expect(projection.completedSetCount).toBe(1);
    expect(projection.progress).toBeCloseTo(1 / 6);
  });
});

describe("AW-7 durable draft and partial-skip contracts", () => {
  it("persists and acknowledges a valid incomplete set draft", () => {
    const states = [exerciseState({
      draft: {
        reps: "10",
        weightKg: "80",
        notes: "Keep elbows tucked",
        logWriteRequired: true,
        setDetailsWriteRequired: true
      }
    })];

    expect(hasPendingValidSetWrites(states)).toBe(true);
    const rows = buildCanonicalLogRows(states, {
      pendingOnly: true,
      validOnly: true
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      reps: 10,
      weightKg: 80,
      completedAt: null,
      notes: "Keep elbows tucked"
    });

    const acknowledged = acknowledgeSetWrites(states, states);
    expect(acknowledged[0]?.sets[0]).toMatchObject({
      hasPersistedLog: true,
      logWriteRequired: false,
      setDetailsWriteRequired: false
    });
  });

  it("rejects invalid pending draft values instead of silently discarding them", () => {
    const states = [exerciseState({
      draft: {
        reps: "10.5",
        weightKg: "-1",
        logWriteRequired: true
      }
    })];

    expect(hasPendingValidSetWrites(states)).toBe(true);
    expect(() => buildCanonicalLogRows(states, {
      pendingOnly: true,
      validOnly: true
    })).toThrow(ActiveWorkoutDraftValidationError);
  });

  it("keeps partial skipped work consistent across review and completion", () => {
    const states = [exerciseState({
      skipped: true,
      completedSets: 1,
      setCount: 3
    })];

    const review = buildActiveWorkoutReview(states);
    expect(review).toMatchObject({
      completedSets: 1,
      totalSets: 1,
      incompleteSets: 0,
      incompleteExercises: 0,
      partialExercises: 1,
      skippedExercises: 1
    });
    expect(review.exercises[0]?.status).toBe("partial");

    const summary = buildSummary(
      states,
      [],
      12,
      "",
      ((key: string) => key) as never,
      {
        measurement: (value: number) => String(value),
        integer: (value: number) => String(value),
        decimal: (value: number) => String(value),
        ratio: (left: number, right: number) => `${left}/${right}`,
        timer: (value: number) => String(value)
      } as never
    );
    expect(summary).toMatchObject({
      completedSets: 1,
      totalPlannedSets: 1,
      partialExercises: ["Bench press"],
      skippedExercises: ["Bench press"]
    });
  });
});
