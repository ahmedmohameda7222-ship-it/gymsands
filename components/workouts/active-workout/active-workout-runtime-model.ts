export * from "./active-workout-runtime-model-core";

import type {
  ActiveWorkoutExerciseState,
  ActiveWorkoutReviewProjection,
  ActiveWorkoutSetState,
  ActiveWorkoutSummary,
  CanonicalLogOptions
} from "./active-workout-runtime-model-core";
import {
  acknowledgeSetWrites as acknowledgeSetWritesCore,
  buildActiveWorkoutReview as buildActiveWorkoutReviewCore,
  buildCanonicalLogRows as buildCanonicalLogRowsCore,
  buildSummary as buildSummaryCore
} from "./active-workout-runtime-model-core";
import type {
  ActiveWorkoutFormatters,
  ActiveWorkoutTranslator
} from "@/lib/i18n/active-workout";
import type {
  UserWorkoutPlanExercise,
  WorkoutSessionSummary
} from "@/types";

export class ActiveWorkoutDraftValidationError extends Error {
  readonly retryable = false;

  constructor(message = "Workout set draft contains invalid values.") {
    super(message);
    this.name = "ActiveWorkoutDraftValidationError";
  }
}

function optionalPositiveIntegerDraft(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return true;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 && Number.isInteger(parsed);
}

function optionalNonNegativeDraft(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return true;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0;
}

function effortDraftIsValid(value: string, maximum: number) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return true;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= maximum;
}

export function setHasPersistableDraftInputs(set: ActiveWorkoutSetState) {
  return (
    optionalPositiveIntegerDraft(set.reps)
    && optionalNonNegativeDraft(set.weightKg)
    && effortDraftIsValid(set.rpe, 10)
    && effortDraftIsValid(set.rir, 20)
  );
}

export function isPendingSetWrite(set: ActiveWorkoutSetState) {
  return set.logWriteRequired;
}

export function hasPendingValidSetWrites(states: ActiveWorkoutExerciseState[]) {
  // The coordinator must see invalid pending drafts too so explicit minimize
  // flushes reject instead of silently navigating and discarding user input.
  return states.some((item) => item.sets.some(isPendingSetWrite));
}

function canonicalDraftStates(
  states: ActiveWorkoutExerciseState[],
  options: CanonicalLogOptions
) {
  const invalidPendingDraft = options.validOnly
    ? states.flatMap((item) => item.sets).find(
        (set) => isPendingSetWrite(set) && !setHasPersistableDraftInputs(set)
      )
    : null;
  if (invalidPendingDraft) throw new ActiveWorkoutDraftValidationError();

  return states.map((item) => ({
    ...item,
    sets: item.sets.map((set) =>
      isPendingSetWrite(set) && !set.completedAt && !set.hasPersistedLog
        ? { ...set, hasPersistedLog: true }
        : set
    )
  }));
}

export function buildCanonicalLogRows(
  states: ActiveWorkoutExerciseState[],
  options: CanonicalLogOptions = {}
) {
  return buildCanonicalLogRowsCore(canonicalDraftStates(states, options), options);
}

export function acknowledgeSetWrites(
  currentStates: ActiveWorkoutExerciseState[],
  savedStates: ActiveWorkoutExerciseState[] = currentStates
) {
  return acknowledgeSetWritesCore(
    currentStates,
    canonicalDraftStates(savedStates, {})
  );
}

export function buildActiveWorkoutReview(
  states: ActiveWorkoutExerciseState[],
  originalExercises: UserWorkoutPlanExercise[] = []
): ActiveWorkoutReviewProjection {
  const base = buildActiveWorkoutReviewCore(states, originalExercises);
  const exercises = base.exercises.map((exercise, exerciseIndex) => {
    const skipped = states[exerciseIndex]?.prescriptionItem.executionState === "skipped";
    const status = skipped
      ? exercise.completedSets === 0
        ? "skipped"
        : exercise.completedSets >= exercise.totalSets
          ? "completed"
          : "partial"
      : exercise.status;
    return { ...exercise, status };
  });

  const completedSets = exercises.reduce(
    (sum, exercise) => sum + exercise.completedSets,
    0
  );
  const totalSets = exercises.reduce((sum, exercise, exerciseIndex) => {
    const skipped = states[exerciseIndex]?.prescriptionItem.executionState === "skipped";
    return sum + (skipped ? exercise.completedSets : exercise.totalSets);
  }, 0);

  return {
    exercises,
    completedSets,
    totalSets,
    incompleteSets: Math.max(0, totalSets - completedSets),
    completedExercises: exercises.filter((exercise) => exercise.status === "completed").length,
    incompleteExercises: exercises.filter((exercise, exerciseIndex) => {
      const skipped = states[exerciseIndex]?.prescriptionItem.executionState === "skipped";
      return !skipped && (
        exercise.status === "incomplete" || exercise.status === "partial"
      );
    }).length,
    partialExercises: exercises.filter((exercise) => exercise.status === "partial").length,
    skippedExercises: states.filter(
      (item) => item.prescriptionItem.executionState === "skipped"
    ).length,
    replacedExercises: exercises.filter((exercise) => exercise.originalName).length
  };
}

export function buildSummary(
  states: ActiveWorkoutExerciseState[],
  history: WorkoutSessionSummary[],
  durationMinutes: number,
  notes: string,
  tr: ActiveWorkoutTranslator,
  formatters: ActiveWorkoutFormatters,
  canonicalLogs?: readonly import("@/types").ExerciseLog[]
): ActiveWorkoutSummary {
  const base = buildSummaryCore(
    states,
    history,
    durationMinutes,
    notes,
    tr,
    formatters,
    canonicalLogs
  );
  const review = buildActiveWorkoutReview(states);

  return {
    ...base,
    completedSets: review.completedSets,
    totalPlannedSets: review.totalSets,
    completedExercises: review.completedExercises,
    incompleteExercises: review.exercises
      .filter((exercise) => exercise.status === "incomplete")
      .map((exercise) => exercise.currentName),
    partialExercises: review.exercises
      .filter((exercise) => exercise.status === "partial")
      .map((exercise) => exercise.currentName),
    skippedExercises: states
      .filter((item) => item.prescriptionItem.executionState === "skipped")
      .map((item) => item.exercise.exercise_name),
    replacedExercises: review.exercises
      .filter((exercise) => exercise.originalName)
      .map((exercise) => ({
        currentName: exercise.currentName,
        originalName: exercise.originalName!
      }))
  };
}
