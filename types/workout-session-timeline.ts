export type WorkoutSessionTimelineEventType =
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "rest_started"
  | "rest_ended"
  | "set_completed"
  | "set_edited"
  | "exercise_skipped"
  | "exercise_replaced"
  | "session_completed"
  | "session_skipped"
  | "session_cancelled";

export type WorkoutSessionTimelineEventSource = "runtime" | "migration_backfill";

export type WorkoutSessionTimelinePayload = Record<string, unknown>;

export type WorkoutSessionTimelineEvent = {
  id: string;
  workout_session_id: string;
  user_id: string;
  sequence_number: number;
  event_type: WorkoutSessionTimelineEventType;
  occurred_at: string;
  source: WorkoutSessionTimelineEventSource;
  command_id: string | null;
  exercise_log_id: string | null;
  snapshot_item_id: string | null;
  payload_version: 1;
  payload: WorkoutSessionTimelinePayload;
  idempotency_key: string;
  created_at: string;
};

export type WorkoutSessionTimelinePage = {
  events: WorkoutSessionTimelineEvent[];
  nextAfterSequence: number | null;
};

export type WorkoutSessionExerciseSkipReason =
  | "user_skipped"
  | "equipment_unavailable"
  | "pain_or_discomfort"
  | "time_constraint"
  | "other";

export type WorkoutSessionCancellationReason =
  | "user_cancelled"
  | "started_by_mistake"
  | "not_feeling_well"
  | "time_constraint"
  | "pain_or_discomfort"
  | "other";
