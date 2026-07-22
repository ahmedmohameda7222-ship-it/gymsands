export * from "./database-legacy";

import type {
  ExerciseLog as LegacyExerciseLog,
  WorkoutSession as LegacyWorkoutSession,
  WorkoutSessionSummary as LegacyWorkoutSessionSummary
} from "./database-legacy";
import type { SavedWorkoutPerformanceMetricValue } from "./workout-performance";

export type WorkoutSessionStatus = "started" | "completed" | "skipped" | "cancelled";

export type WorkoutSession = Omit<LegacyWorkoutSession, "status"> & {
  status: WorkoutSessionStatus;
  cancelled_at?: string | null;
  cancel_reason?:
    | "user_cancelled"
    | "started_by_mistake"
    | "not_feeling_well"
    | "time_constraint"
    | "pain_or_discomfort"
    | "other"
    | null;
};

export type ExerciseLog = LegacyExerciseLog & {
  performance_metrics?: SavedWorkoutPerformanceMetricValue[];
};

export type WorkoutSessionSummary = Omit<LegacyWorkoutSessionSummary, keyof LegacyWorkoutSession | "exercise_logs"> &
  WorkoutSession & {
    exercise_logs: ExerciseLog[];
  };
