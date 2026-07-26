import type {
  FrozenWorkoutPrescriptionSet,
  WorkoutSessionPrescriptionItem,
  WorkoutSetSideMode,
  WorkoutSetTempoAdherence,
  WorkoutSetType
} from "@/types";

export type ActiveWorkoutCoreSet = {
  setNumber: number;
  reps: string;
  weightKg: string;
  notes: string;
  rpe: string;
  rir: string;
  setType: WorkoutSetType;
  sideMode: WorkoutSetSideMode;
  plannedTempo: string | null;
  performedTempo: string | null;
  tempoAdherence: WorkoutSetTempoAdherence;
  completedAt: string | null;
  prescriptionSet: FrozenWorkoutPrescriptionSet | null;
  hasPersistedDetails: boolean;
};

export type ActiveWorkoutCoreExercise = {
  item: WorkoutSessionPrescriptionItem;
  name: string;
  category: string | null;
  sets: ActiveWorkoutCoreSet[];
};

export type ActiveWorkoutCoreLabels = {
  workoutContext: string;
  exercises: string;
  sets: string;
  set: (number: number) => string;
  reps: string;
  weightKg: string;
  pause: string;
  resume: string;
  finish: string;
  more: string;
  completeSet: (number: number) => string;
  rest: string;
  skipRest: string;
  addThirtySeconds: string;
  startRest: string;
  currentSessionHeat: string;
  openDetails: string;
  advancedDetails: string;
  setType: string;
  note: string;
  optional: string;
  previousSet: string;
  fullDetails: string;
  close: string;
  invalidRpe: string;
  invalidRir: string;
};

export function activeWorkoutProgress(completedSets: number, totalSets: number) {
  if (!Number.isFinite(completedSets) || !Number.isFinite(totalSets) || totalSets <= 0) return 0;
  return Math.max(0, Math.min(1, completedSets / totalSets));
}

export function activeWorkoutNumber(value: string) {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function activeWorkoutSetIsCompletable(set: ActiveWorkoutCoreSet | null | undefined) {
  if (!set || set.completedAt) return false;
  const reps = activeWorkoutNumber(set.reps);
  const weight = activeWorkoutNumber(set.weightKg);
  return reps !== null && reps > 0 && weight !== null && weight >= 0;
}
