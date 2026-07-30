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
  buildPrs,
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

function exerciseState(
  name: string,
  completed: number,
  total = 3
): ActiveWorkoutExerciseState {
  return {
    exercise: {
      ...exercise,
      id: `exercise-${name}`,
      exercise_name: name,
      sets: total
    },
    prescriptionItem: {
      ...prescriptionItem,
      id: `item-${name}`,
      activityName: name,
      plannedSets: total
    },
    sets: Array.from({ length: total }, (_, index) => setState({
      setNumber: index + 1,
      completedAt: index < completed ? `2026-07-27T08:0${index}:00.000Z` : null
    }))
  };
}

describe("active workout runtime model", () => {
  it("normalizes numeric drafts and exercise identity deterministically", () => {
    expect(toNumberOrNull(" 12,5 ")).toBe(12.5);
    expect(toNumberOrNull(" ")).toBeNull();
    expect(normalizeExerciseName("A1: Bench Press")).toBe("bench press");
    expect(normalizeExerciseName("ضغط الصدر")).toBe("ضغط الصدر");
    expect(normalizeExerciseName("سحب أمامي")).toBe("سحب أمامي");
    expect(normalizeExerciseName("BÄNKDRÜCKEN")).toBe("bänkdrücken");
    expect(normalizeExerciseName("  Bench—Press...   Close Grip ")).toBe("bench press close grip");
    expect(normalizeExerciseName("تمرين ٢")).not.toBe("");
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
      partialExercises: [],
      skippedExercises: [],
      notes: "Good session"
    });
    expect(summary.suggestions).toHaveLength(1);
  });

  it("separates not-started, partial, and fully completed exercise semantics", () => {
    const none = buildSummary([exerciseState("None", 0)], [], 1, "", tr, formatters);
    const partial = buildSummary([exerciseState("Partial", 1)], [], 1, "", tr, formatters);
    const full = buildSummary([exerciseState("Full", 3)], [], 1, "", tr, formatters);
    const mixed = buildSummary([
      exerciseState("None", 0),
      exerciseState("Partial", 1),
      exerciseState("Full", 3)
    ], [], 1, "", tr, formatters);

    expect(none).toMatchObject({
      completedExercises: 0,
      partialExercises: [],
      skippedExercises: ["None"]
    });
    expect(partial).toMatchObject({
      completedExercises: 0,
      partialExercises: ["Partial"],
      skippedExercises: []
    });
    expect(full).toMatchObject({
      completedExercises: 1,
      partialExercises: [],
      skippedExercises: []
    });
    expect(mixed).toMatchObject({
      completedExercises: 1,
      partialExercises: ["Partial"],
      skippedExercises: ["None"]
    });
  });

  it("keeps unrelated Arabic histories and PR groups distinct", () => {
    const history = [{
      id: "history-ar",
      started_at: "2026-07-26T08:00:00.000Z",
      completed_at: "2026-07-26T09:00:00.000Z",
      exercise_logs: [{
        exercise_name: "ضغط الصدر",
        set_number: 1,
        reps: 8,
        weight_kg: 50
      }, {
        exercise_name: "سحب أمامي",
        set_number: 1,
        reps: 10,
        weight_kg: 40
      }]
    }] as unknown as WorkoutSessionSummary[];

    expect(previousSetForExercise(history, "ضغط الصدر", 1)).toMatchObject({
      reps: 8,
      weightKg: 50
    });
    expect(previousSetForExercise(history, "تمرين مختلف", 1)).toBeNull();

    const prs = buildPrs([
      exerciseState("ضغط الصدر", 1, 1),
      exerciseState("سحب أمامي", 1, 1)
    ].map((item, index) => ({
      ...item,
      sets: item.sets.map((set) => ({
        ...set,
        reps: index === 0 ? "9" : "11",
        weightKg: index === 0 ? "55" : "45"
      }))
    })), history, tr, formatters);

    expect(prs.some((item) => item.includes("ضغط الصدر"))).toBe(true);
    expect(prs.some((item) => item.includes("سحب أمامي"))).toBe(true);
  });
});
