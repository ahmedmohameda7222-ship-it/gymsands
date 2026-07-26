export type ActiveWorkoutSetPathState = "completed" | "active" | "available";

export type ActiveWorkoutSetPathItem = {
  number: number;
  state: ActiveWorkoutSetPathState;
};

export type ActiveWorkoutSetDraftValidation = {
  reps: number | null;
  weightKg: number | null;
  repsError: "required" | "invalid" | null;
  weightError: "invalid" | null;
  complete: boolean;
};

export type ActiveWorkoutSetCursor = {
  exerciseIndex: number;
  setIndex: number;
};

export function clampWorkoutProgress(completedSets: number, totalSets: number) {
  if (!Number.isFinite(completedSets) || !Number.isFinite(totalSets) || totalSets <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, completedSets / totalSets));
}

export function parseWorkoutNumericDraft(value: string) {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateActiveWorkoutSetDraft(
  repsDraft: string,
  weightDraft: string
): ActiveWorkoutSetDraftValidation {
  const reps = parseWorkoutNumericDraft(repsDraft);
  const weightKg = parseWorkoutNumericDraft(weightDraft);
  const repsError = reps === null || reps <= 0
    ? "required"
    : Number.isInteger(reps)
      ? null
      : "invalid";
  const weightError = weightKg === null || weightKg < 0 ? "invalid" : null;

  return {
    reps,
    weightKg,
    repsError,
    weightError,
    complete: repsError === null && weightError === null
  };
}

export function buildActiveWorkoutSetPath(
  sets: ReadonlyArray<{ setNumber: number; completed: boolean }>,
  activeSetNumber: number
): ActiveWorkoutSetPathItem[] {
  return sets.map((set) => ({
    number: set.setNumber,
    state: set.completed
      ? "completed"
      : set.setNumber === activeSetNumber
        ? "active"
        : "available"
  }));
}

export function nextIncompleteSetCursor(
  sets: ReadonlyArray<ActiveWorkoutSetCursor & { completed: boolean }>,
  current: ActiveWorkoutSetCursor
) {
  const currentIndex = sets.findIndex(
    (candidate) =>
      candidate.exerciseIndex === current.exerciseIndex
      && candidate.setIndex === current.setIndex
  );
  if (currentIndex < 0 || !sets[currentIndex]?.completed) return current;
  return sets
    .slice(currentIndex + 1)
    .find((candidate) => !candidate.completed)
    ?? sets.find((candidate) => !candidate.completed)
    ?? current;
}
