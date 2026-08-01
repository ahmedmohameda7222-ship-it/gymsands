import type {
  ExerciseLog,
  WorkoutSession,
  WorkoutSessionExecutionState,
  WorkoutSessionPrescriptionItem
} from "@/types";

export const ACTIVE_SESSION_STORE_SCHEMA_VERSION = 1 as const;
export const MAX_ACTIVITY_TIMER_DURATION_SECONDS = 86_400;

export const sessionCommandTypes = [
  "claim_control",
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

export type ClaimControlPayload = {
  controller_device_id: string;
  expected_controller_device_id: string | null;
  takeover: boolean;
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
  claim_control: ClaimControlPayload;
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
  | "idempotency_conflict"
  | "controller_conflict";

export const sessionCommandOutcomes = [
  "applied",
  "no_op",
  "revision_conflict",
  "idempotency_conflict",
  "controller_conflict"
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
  | "controller_conflict"
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

export class ActiveSessionControllerConflictError extends ActiveSessionError {
  readonly response?: SessionCommandResponse;

  constructor(response?: SessionCommandResponse) {
    super(
      "controller_conflict",
      "This workout is controlled by another device."
    );
    this.name = "ActiveSessionControllerConflictError";
    this.response = response;
  }
}

export class ActiveSessionDataConflictError extends ActiveSessionError {
  readonly targetIdentity: string;

  constructor(targetIdentity: string) {
    super(
      "revision_conflict",
      "This set changed on the server while local work was pending."
    );
    this.name = "ActiveSessionDataConflictError";
    this.targetIdentity = targetIdentity;
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

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidIntent(message: string): never {
  throw new ActiveSessionError("invalid_transition", message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertExactKeys(
  payload: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = []
) {
  const allowed = new Set([...required, ...optional]);
  if (
    required.some((key) => !Object.prototype.hasOwnProperty.call(payload, key))
    || Object.keys(payload).some((key) => !allowed.has(key))
  ) {
    invalidIntent("Workout command payload keys are invalid.");
  }
}

function assertUuidOrNull(value: unknown, label: string) {
  if (value !== null && (typeof value !== "string" || !uuidPattern.test(value))) {
    invalidIntent(`${label} must be a UUID or null.`);
  }
}

function assertPositiveInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    invalidIntent(`${label} must be a positive integer.`);
  }
}

function assertBoundedDuration(value: unknown, nullable: boolean) {
  if (nullable && value === null) return;
  if (
    !Number.isSafeInteger(value)
    || Number(value) < 0
    || Number(value) > MAX_ACTIVITY_TIMER_DURATION_SECONDS
  ) {
    invalidIntent("Timer duration is outside the supported range.");
  }
}

function assertController(payload: Record<string, unknown>) {
  assertUuidOrNull(payload.controller_device_id, "Controller identity");
  if (payload.controller_device_id === null) {
    invalidIntent("Controller identity is required.");
  }
}

function assertEnum(value: unknown, allowed: readonly string[], label: string) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    invalidIntent(`${label} is invalid.`);
  }
}

function assertNullableIsoTimestamp(value: unknown, label: string) {
  if (
    value !== null
    && (
      typeof value !== "string"
      || !Number.isFinite(Date.parse(value))
    )
  ) {
    invalidIntent(`${label} must be a valid timestamp or null.`);
  }
}

export function validateSessionCommandIntent(
  value: unknown
): asserts value is SessionCommandIntent {
  if (!isRecord(value)) invalidIntent("Workout command intent is invalid.");
  if (
    typeof value.userId !== "string"
    || value.userId.length === 0
    || typeof value.workoutSessionId !== "string"
    || value.workoutSessionId.length === 0
    || typeof value.commandId !== "string"
    || !uuidPattern.test(value.commandId)
    || typeof value.commandType !== "string"
    || !sessionCommandTypes.includes(value.commandType as SessionCommandType)
    || !isRecord(value.payload)
  ) {
    invalidIntent("Workout command identity or type is invalid.");
  }
  const payload = value.payload;
  let serializedPayload = "";
  try {
    serializedPayload = JSON.stringify(payload);
  } catch {
    invalidIntent("Workout command payload is not serializable.");
  }
  if (serializedPayload.length > 4096) {
    invalidIntent("Workout command payload is too large.");
  }

  switch (value.commandType as SessionCommandType) {
    case "claim_control":
      assertExactKeys(payload, [
        "controller_device_id",
        "expected_controller_device_id",
        "takeover"
      ]);
      assertUuidOrNull(payload.controller_device_id, "Controller identity");
      if (payload.controller_device_id === null) {
        invalidIntent("Controller identity is required.");
      }
      assertUuidOrNull(
        payload.expected_controller_device_id,
        "Expected controller identity"
      );
      if (typeof payload.takeover !== "boolean") {
        invalidIntent("Takeover intent is invalid.");
      }
      break;
    case "move_cursor":
      assertExactKeys(
        payload,
        ["active_snapshot_item_id", "active_item_order", "active_set_number"],
        ["view_state", "controller_device_id"]
      );
      assertUuidOrNull(payload.active_snapshot_item_id, "Snapshot item identity");
      assertPositiveInteger(payload.active_item_order, "Active item order");
      assertPositiveInteger(payload.active_set_number, "Active set number");
      if (payload.view_state !== undefined) {
        assertEnum(
          payload.view_state,
          ["set_entry", "exercise_complete", "session_review"],
          "Workout view"
        );
      }
      assertController(payload);
      break;
    case "complete_set_transition":
      assertExactKeys(payload, [
        "active_snapshot_item_id",
        "active_item_order",
        "active_set_number",
        "view_state",
        "rest_duration_seconds",
        "controller_device_id"
      ]);
      assertUuidOrNull(payload.active_snapshot_item_id, "Snapshot item identity");
      assertPositiveInteger(payload.active_item_order, "Active item order");
      assertPositiveInteger(payload.active_set_number, "Active set number");
      assertEnum(
        payload.view_state,
        ["rest", "set_entry", "exercise_complete"],
        "Workout view"
      );
      assertBoundedDuration(payload.rest_duration_seconds, true);
      assertController(payload);
      break;
    case "start_rest":
      assertExactKeys(payload, ["duration_seconds", "controller_device_id"]);
      assertBoundedDuration(payload.duration_seconds, false);
      assertController(payload);
      break;
    case "clear_rest":
      assertExactKeys(
        payload,
        ["view_state"],
        ["completion_reason", "controller_device_id"]
      );
      assertEnum(
        payload.view_state,
        ["set_entry", "exercise_complete", "session_review"],
        "Workout view"
      );
      if (payload.completion_reason !== undefined) {
        assertEnum(
          payload.completion_reason,
          ["natural_expiration", "user_skipped", "transitioned"],
          "Rest completion reason"
        );
      }
      assertController(payload);
      break;
    case "reset_timer":
    case "pause":
    case "resume":
    case "reset_activity_timer":
      assertExactKeys(payload, ["controller_device_id"]);
      assertController(payload);
      break;
    case "import_legacy_cache":
      assertExactKeys(payload, [
        "cached_started_at",
        "cached_rest_ends_at",
        "cached_rest_duration_seconds",
        "controller_device_id"
      ]);
      assertNullableIsoTimestamp(payload.cached_started_at, "Cached workout start");
      assertNullableIsoTimestamp(payload.cached_rest_ends_at, "Cached rest end");
      assertBoundedDuration(payload.cached_rest_duration_seconds, true);
      assertController(payload);
      break;
    case "start_activity_timer":
      assertExactKeys(
        payload,
        ["kind", "duration_seconds", "controller_device_id"]
      );
      assertEnum(payload.kind, ["timed_set", "block"], "Activity timer kind");
      assertBoundedDuration(payload.duration_seconds, true);
      if (payload.kind === "block" && payload.duration_seconds === null) {
        invalidIntent("A block activity timer must be bounded.");
      }
      assertController(payload);
      break;
    case "clear_activity_timer":
      assertExactKeys(payload, ["completion_reason", "controller_device_id"]);
      assertEnum(
        payload.completion_reason,
        ["completed", "user_skipped", "cancelled", "transitioned"],
        "Activity completion reason"
      );
      assertController(payload);
      break;
  }
}

export function validateSessionCommandRequest(
  value: unknown
): asserts value is SessionCommandRequest {
  validateSessionCommandIntent(value);
  const expectedRevision = (
    value as SessionCommandIntent & { expectedRevision?: unknown }
  ).expectedRevision;
  if (
    !Number.isSafeInteger(expectedRevision)
    || Number(expectedRevision) < 0
  ) {
    invalidIntent("Expected workout revision is invalid.");
  }
}
