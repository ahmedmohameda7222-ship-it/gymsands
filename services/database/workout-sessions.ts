export {
  completeWorkoutSession,
  getOpenWorkoutDaySession,
  getOrStartWorkoutDaySession,
  getScheduledWorkoutActivity,
  getScheduledWorkoutHistory,
  getWorkoutActivity,
  getWorkoutHistory,
  getWorkoutHistoryDetailed,
  getWorkoutSessionLogs,
  saveWorkoutSetLogs,
  skipWorkoutDay,
  startWorkoutDaySession,
  startWorkoutSession,
  updateWorkoutSessionDuration
} from "./legacy-repository";

export type { WorkoutSetLogInput } from "./legacy-repository";
