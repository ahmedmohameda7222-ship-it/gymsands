import { describe, expect, it } from "vitest";

import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import type {
  UserWorkoutPlanExercise,
  WorkoutSessionPrescriptionItem,
  WorkoutSessionSummary
} from "@/types";

import {
  buildCanonicalLogRows,
  buildSummary,
  hydrateStates,
  mergeSetPatch,
  normalizeExerciseName,
  previousSetForExercise,
  toNumberOrNull,
  type ActiveWorkoutExerciseState,
  type ActiveWorkoutSetState
} from "./active-workout-runtime-model";

const formatters = {
  integer: (value: number) => String(value),
  decimal: (value: number) => String(value),
  ratio: (left: number, right: number) => `${left}/${right}`,
  timer: (value: number) => String(value),
  measurement: (value: number, unit: string) => `${value} ${unit}`
} as unknown as ActiveWorkoutFormatters;

const tr = ((key: string, values?: Record<string, unknown>) =>
  `${key}:${JSON.stringify(values ?? {})}`) as unknown as ActiveWorkoutTranslator;

const exercise = {
  id: "exercise-1",
  plan_day_id: "day-1",
  workout_id: null,
  source_workout_id: null,
  exercise_name: "A1: Bench Press",
  category: "strength",
  target_muscle: "chest",
  equipment: "barbell",
  sets: 2,
  reps: "8-10",
  rest_seconds: 90,
  sort_order: 1,
  notes: null
} as UserWorkoutPlanExercise;

const prescriptionItem = {
  id: "item-1",
  snapshotId: "snapshot-1",
  workoutSessionId: "session-1",
  userId: "user-1",
  itemOrder: 1,
  sourcePlanExerciseId: exercise.id,
  sourcePlanActivityId: null,
  activityName: exercise.exercise_name,
  rawCompatibilityPrescription: {},
  plannedSets: 2,
  executionState: "planned",
  normalizationStatus: "partial",
  prescriptionSets: []
} as WorkoutSessionPrescriptionItem;

function setState(overrides: Partial<ActiveWorkoutSetState> = {}): ActiveWorkoutSetState {
  return {
    setNumber: 1,
    reps: "8",
    weightKg: "100",
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
    setDetailsWriteRequired: true,
    logWriteRequired: true,
    completedAt: "2026-07-27T08:00:00.000Z",
    frozenPrescriptionSet: null,
    plannedReps: "8-10",
    plannedRestSeconds: 90,
    ...overrides
  };
}

function states(): ActiveWorkoutExerciseState[] {
  return [{ exercise, prescriptionItem, sets: [setState()] }];
}

describe("active workout runtime model", () => {
  it("normalizes numeric drafts and exercise identity deterministically", () => {
    expect(toNumberOrNull(" 12,5 ")).toBe(12.5);
    expect(toNumberOrNull(" ")).toBeNull();
    expect(normalizeExerciseName("A1: Bench Press")).toBe("bench press");
  });

  it("marks detail and canonical-log writes when a set draft changes", () => {
    const next = mergeSetPatch(setState({ logWriteRequired: false }), {
      reps: "9",
      notes: "Controlled"
    });
    expect(next.logWriteRequired).toBe(true);
    expect(next.setDetailsWriteRequired).toBe(true);
  });

  it("projects exact canonical rows without React or store authority", () => {
    const rows = buildCanonicalLogRows(states());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      planExerciseId: "exercise-1",
      exerciseName: "A1: Bench Press",
      setNumber: 1,
      reps: 8,
      weightKg: 100,
      completedAt: "2026-07-27T08:00:00.000Z"
    });
  });

  it("hydrates performed logs and resolves the previous matching set", () => {
    const history = [{
      id: "history-1",
      started_at: "2026-07-26T08:00:00.000Z",
      completed_at: "2026-07-26T09:00:00.000Z",
      exercise_logs: [{
        id: "log-1",
        workout_session_id: "history-1",
        user_id: "user-1",
        exercise_name: "Bench Press",
        plan_exercise_id: "exercise-1",
        set_number: 1,
        reps: 10,
        weight_kg: 95,
        notes: null,
        set_type: "working",
        completed_at: "2026-07-26T08:30:00.000Z",
        set_details: null
      }]
    }] as unknown as WorkoutSessionSummary[];

    const hydrated = hydrateStates(states(), history[0]!.exercise_logs ?? []);
    expect(hydrated[0]!.sets[0]).toMatchObject({
      reps: "10",
      weightKg: "95",
      hasPersistedLog: true,
      logWriteRequired: false
    });
    expect(previousSetForExercise(history, "A1: Bench Press", 1)).toEqual({
      reps: 10,
      weightKg: 95,
      performedAt: "2026-07-26T09:00:00.000Z"
    });
  });

  it("builds a deterministic completion summary from completed drafts", () => {
    const summary = buildSummary(states(), [], 42, "Good session", tr, formatters);
    expect(summary).toMatchObject({
      durationMinutes: 42,
      totalVolume: 800,
      completedSets: 1,
      completedExercises: 1,
      skippedExercises: [],
      notes: "Good session"
    });
    expect(summary.suggestions).toHaveLength(1);
  });
});
