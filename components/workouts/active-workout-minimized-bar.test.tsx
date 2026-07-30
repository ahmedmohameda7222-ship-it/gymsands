import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  ActiveWorkoutMinimizedBar,
  projectActiveWorkoutMinimizedProgress
} from "./active-workout-minimized-bar";
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

  it("excludes skipped prescription items and their logs from minimized progress", () => {
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
        performedLog({ id: "active-2", planExerciseId: "active-exercise" }),
        performedLog({ id: "skipped-1", planExerciseId: "skipped-exercise" })
      ]
    );

    expect(projection).toEqual({
      totalSetCount: 2,
      completedSetCount: 2,
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
