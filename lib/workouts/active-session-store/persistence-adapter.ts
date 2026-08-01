import type {
  ExerciseLog,
  Workout,
  WorkoutPerformanceMetricInput,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSetDetailsInput,
  WorkoutSetRuntimeSource,
  WorkoutSetSegmentInput
} from "@/types";
import type { WorkoutSessionExerciseSkipReason } from "@/types/workout-session-timeline";
import type { WorkoutSessionPrescriptionItem } from "@/types/workout-prescription";
import type { SessionCommandRequest, SessionCommandResponse } from "../session-engine/contracts";

export type CanonicalWorkoutSetWrite = {
  planExerciseId?: string | null;
  exerciseOrder?: number | null;
  exerciseName: string;
  exerciseCategory?: string | null;
  plannedSets?: number | null;
  plannedReps?: string | null;
  plannedRestSeconds?: number | null;
  setNumber: number;
  reps: number | null;
  weightKg: number | null;
  notes?: string | null;
  completedAt?: string | null;
  performanceMetrics?: Array<Omit<WorkoutPerformanceMetricInput, "source"> & {
    source?: WorkoutSetRuntimeSource;
  }>;
  setDetails?: WorkoutSetDetailsInput | null;
  segments?: WorkoutSetSegmentInput[];
  metricSource?: WorkoutSetRuntimeSource;
  metricSourceProvider?: string | null;
  metricSourceVersion?: string | null;
};

export type CompleteActiveSessionInput = {
  userId: string;
  workoutSessionId: string;
  notes: string;
  durationMinutes: number;
  controllerDeviceId: string;
  finalLogs?: CanonicalWorkoutSetWrite[];
};

export type ReplaceActiveSessionExerciseInput = {
  userId: string;
  workoutSessionId: string;
  sourcePlanExerciseId: string;
  controllerDeviceId: string;
  replacement: Workout;
};

export type ActiveSessionPersistenceAdapter = {
  loadSessionRoot(userId: string, workoutSessionId: string): Promise<WorkoutSession | null>;
  loadExecutionState(
    userId: string,
    workoutSessionId: string
  ): Promise<WorkoutSessionExecutionState | null>;
  loadPrescription(
    userId: string,
    workoutSessionId: string
  ): Promise<WorkoutSessionPrescriptionItem[]>;
  loadPerformedLogs(userId: string, workoutSessionId: string): Promise<ExerciseLog[]>;
  dispatchExecutionCommand(request: SessionCommandRequest): Promise<SessionCommandResponse>;
  writeCanonicalSet(
    workoutSessionId: string,
    logs: CanonicalWorkoutSetWrite[],
    controllerDeviceId: string
  ): Promise<void>;
  completeSession(input: CompleteActiveSessionInput): Promise<WorkoutSession>;
  replaceExercise(input: ReplaceActiveSessionExerciseInput): Promise<unknown>;
  skipExercise(
    userId: string,
    workoutSessionId: string,
    snapshotItemId: string,
    reason: WorkoutSessionExerciseSkipReason | undefined,
    controllerDeviceId: string
  ): Promise<unknown>;
  cancelSession(
    userId: string,
    workoutSessionId: string,
    controllerDeviceId: string
  ): Promise<WorkoutSession>;
};
