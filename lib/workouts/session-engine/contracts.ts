import type {
  ExerciseLog,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSessionPrescriptionItem
} from "@/types";

export const ACTIVE_SESSION_STORE_SCHEMA_VERSION = 1 as const;
export const MAX_ACTIVITY_TIMER_DURATION_SECONDS = 86_400;

export const sessionCommandTypes = [
  "move_cursor",
  "complete_set_transition",
  "start_rest",
  "clear_rest",
  "reset_timer",
  "pause",
  "resume",
  "import_legacy_cache",
  "start_activity_timer",
  "clear_activity_timer",
  "reset_activity_timer"
] as const;

export type SessionCommandType = (typeof sessionCommandTypes)[number];
export type ActivityTimerKind = "timed_set" | "block";
export type RestCompletionReason =
  | "natural_expiration"
  | "user_skipped"
  | "transitioned";
export type RestTimelineEndReason = RestCompletionReason | "restarted";
export type ActivityTimerCompletionReason = "completed" | "user_skipped" | "cancelled" | "transitioned";

export type MoveCursorPayload = {
  active_snapshot_item_id: string | null;
  active_item_order: number;
  active_set_number: number;
  view_state?: "set_entry" | "exercise_complete" | "session_review";
  controller_device_id?: string | null;
};

export type CompleteSetTransitionPayload = {
  active_snapshot_item_id: string | null;
  active_item_order: number;
  active_set_number: number;
  view_state: "rest" | "set_entry" | "exercise_complete";
  rest_duration_seconds: number | null;
  controller_device_id: string | null;
};

export type SessionCommandPayloadByType = {
  move_cursor: MoveCursorPayload;
  complete_set_transition: CompleteSetTransitionPayload;
  start_rest: { duration_seconds: number; controller_device_id: string | null };
  clear_rest: {
    view_state: "set_entry" | "exercise_complete" | "session_review";
    completion_reason?: RestCompletionReason;
    controller_device_id?: string | null;
  };
  reset_timer: { controller_device_id: string | null };
  pause: { controller_device_id: string | null };
  resume: { controller_device_id: string | null };
  import_legacy_cache: {
    cached_started_at: string | null;
    cached_rest_ends_at: string | null;
    cached_rest_duration_seconds: number | null;
    controller_device_id: string | null;
  };
  start_activity_timer: {
    kind: ActivityTimerKind;
    duration_seconds: number | null;
    controller_device_id: string | null;
  };
  clear_activity_timer: {
    completion_reason: ActivityTimerCompletionReason;
    controller_device_id: string | null;
  };
  reset_activity_timer: { controller_device_id: string | null };
};

export type SessionCommandIntent<T extends SessionCommandType = SessionCommandType> =
  T extends SessionCommandType
    ? {
        userId: string;
        workoutSessionId: string;
        commandId: string;
        commandType: T;
        payload: SessionCommandPayloadByType[T];
      }
    : never;

export type SessionCommandRequest<T extends SessionCommandType = SessionCommandType> =
  T extends SessionCommandType
    ? SessionCommandIntent<T> & { expectedRevision: number }
    : never;

export type SessionCommandOutcome =
  | "applied"
  | "no_op"
  | "revision_conflict"
  | "idempotency_conflict";

export const sessionCommandOutcomes = [
  "applied",
  "no_op",
  "revision_conflict",
  "idempotency_conflict"
] as const satisfies readonly SessionCommandOutcome[];

export type SessionCommandResponse = {
  schemaVersion: 1;
  workoutSessionId: string;
  commandId: string;
  commandType: SessionCommandType;
  outcome: SessionCommandOutcome;
  replayed: boolean;
  expectedRevision: number;
  revisionBefore: number;
  revisionAfter: number;
  reason: string | null;
  state: WorkoutSessionExecutionState;
};

export type SessionEngineContext = {
  userId: string;
  workoutSessionId: string;
  rootStatus: WorkoutSession["status"];
  prescription: readonly WorkoutSessionPrescriptionItem[];
  performedLogs?: readonly ExerciseLog[];
};

export type SessionTransitionPlan = {
  outcome: "applied" | "no_op";
  reason: string | null;
  state: WorkoutSessionExecutionState;
};

export type ActiveSessionErrorCode =
  | "revision_conflict"
  | "idempotency_conflict"
  | "transport_uncertainty"
  | "canonical_set_saved_execution_sync_failed"
  | "hydration_failed"
  | "identity_mismatch"
  | "same_revision_state_divergence"
  | "invalid_transition"
  | "terminal_mutation_attempt"
  | "timer_state_corruption"
  | "adapter_failure";

export class ActiveSessionError extends Error {
  readonly code: ActiveSessionErrorCode;
  readonly cause?: unknown;

  constructor(code: ActiveSessionErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ActiveSessionError";
    this.code = code;
    this.cause = cause;
  }
}

export class ActiveSessionRevisionConflictError extends ActiveSessionError {
  readonly response: SessionCommandResponse;

  constructor(response: SessionCommandResponse) {
    super("revision_conflict", "The workout changed on another request. The latest server state was loaded.");
    this.name = "ActiveSessionRevisionConflictError";
    this.response = response;
  }
}

export class ActiveSessionIdempotencyConflictError extends ActiveSessionError {
  readonly response: SessionCommandResponse;

  constructor(response: SessionCommandResponse) {
    super("idempotency_conflict", "The command identity is already bound to another request.");
    this.name = "ActiveSessionIdempotencyConflictError";
    this.response = response;
  }
}

export class ActiveSessionTransportUncertainError extends ActiveSessionError {
  readonly request: SessionCommandRequest;

  constructor(request: SessionCommandRequest, cause?: unknown) {
    super("transport_uncertainty", "The command may have reached the server; retry only with the identical request.", cause);
    this.name = "ActiveSessionTransportUncertainError";
    this.request = request;
  }
}
