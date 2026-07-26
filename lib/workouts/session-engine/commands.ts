import type { WorkoutSessionExecutionState } from "@/types";
import type { ActiveSessionPersistenceAdapter } from "../active-session-store/persistence-adapter";
import {
  ActiveSessionError,
  ActiveSessionIdempotencyConflictError,
  ActiveSessionRevisionConflictError,
  ActiveSessionTransportUncertainError,
  type SessionCommandIntent,
  type SessionCommandRequest,
  type SessionCommandResponse
} from "./contracts";
import { acceptMonotonicExecutionState } from "./invariants";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createSessionCommandId(randomUuid?: () => string) {
  const commandId = randomUuid?.() ?? globalThis.crypto?.randomUUID?.();
  if (!commandId || !uuidPattern.test(commandId)) {
    throw new ActiveSessionError(
      "invalid_transition",
      "Workout command identities require a cryptographically random UUID."
    );
  }
  return commandId;
}

type SessionLane = {
  state: WorkoutSessionExecutionState | null;
  tail: Promise<void>;
};

export type SessionCommandDispatcher = {
  current(userId: string, workoutSessionId: string): WorkoutSessionExecutionState | null;
  replace(state: WorkoutSessionExecutionState): WorkoutSessionExecutionState;
  dispatch(intent: SessionCommandIntent): Promise<SessionCommandResponse>;
  retry(request: SessionCommandRequest): Promise<SessionCommandResponse>;
  clear(userId: string, workoutSessionId: string): void;
};

function laneKey(userId: string, workoutSessionId: string) {
  return `${userId}:${workoutSessionId}`;
}

function validateResponseIdentity(
  request: SessionCommandRequest,
  response: SessionCommandResponse
) {
  if (
    response.schemaVersion !== 1
    || response.workoutSessionId !== request.workoutSessionId
    || response.commandId !== request.commandId
    || response.commandType !== request.commandType
    || response.expectedRevision !== request.expectedRevision
    || response.state.user_id !== request.userId
    || response.state.workout_session_id !== request.workoutSessionId
    || response.state.revision !== response.revisionAfter
  ) {
    throw new ActiveSessionError(
      "adapter_failure",
      "Workout command response identity is inconsistent."
    );
  }
}

export function createSessionCommandDispatcher(
  adapter: Pick<ActiveSessionPersistenceAdapter, "dispatchExecutionCommand">
): SessionCommandDispatcher {
  const lanes = new Map<string, SessionLane>();

  function lane(userId: string, workoutSessionId: string) {
    const key = laneKey(userId, workoutSessionId);
    const existing = lanes.get(key);
    if (existing) return existing;
    const created: SessionLane = { state: null, tail: Promise.resolve() };
    lanes.set(key, created);
    return created;
  }

  async function execute(
    currentLane: SessionLane,
    request: SessionCommandRequest
  ): Promise<SessionCommandResponse> {
    let response: SessionCommandResponse;
    try {
      response = await adapter.dispatchExecutionCommand(request);
    } catch (error) {
      if (error instanceof ActiveSessionTransportUncertainError) throw error;
      if (
        error instanceof ActiveSessionRevisionConflictError
        || error instanceof ActiveSessionIdempotencyConflictError
      ) {
        response = error.response;
      } else {
        throw new ActiveSessionError(
          "adapter_failure",
          "The workout command could not be persisted.",
          error
        );
      }
    }
    validateResponseIdentity(request, response);
    currentLane.state = acceptMonotonicExecutionState(currentLane.state, response.state);
    if (response.outcome === "revision_conflict") {
      throw new ActiveSessionRevisionConflictError(response);
    }
    if (response.outcome === "idempotency_conflict") {
      throw new ActiveSessionIdempotencyConflictError(response);
    }
    return response;
  }

  function enqueue<T>(currentLane: SessionLane, operation: () => Promise<T>) {
    const result = currentLane.tail.then(operation);
    currentLane.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  return {
    current(userId, workoutSessionId) {
      return lane(userId, workoutSessionId).state;
    },
    replace(state) {
      const currentLane = lane(state.user_id, state.workout_session_id);
      currentLane.state = acceptMonotonicExecutionState(currentLane.state, state);
      return currentLane.state;
    },
    dispatch(intent) {
      const currentLane = lane(intent.userId, intent.workoutSessionId);
      return enqueue(currentLane, async () => {
        if (!currentLane.state) {
          throw new ActiveSessionError(
            "hydration_failed",
            "Workout execution state is not hydrated."
          );
        }
        const request: SessionCommandRequest = {
          ...intent,
          expectedRevision: currentLane.state.revision
        };
        return execute(currentLane, request);
      });
    },
    retry(request) {
      const currentLane = lane(request.userId, request.workoutSessionId);
      return enqueue(currentLane, async () => {
        if (!currentLane.state) {
          throw new ActiveSessionError(
            "hydration_failed",
            "Workout execution state is not hydrated."
          );
        }
        return execute(currentLane, request);
      });
    },
    clear(userId, workoutSessionId) {
      lanes.delete(laneKey(userId, workoutSessionId));
    }
  };
}

export async function dispatchWithTransportClassification(
  request: SessionCommandRequest,
  send: (request: SessionCommandRequest) => Promise<SessionCommandResponse>
) {
  try {
    return await send(request);
  } catch (error) {
    if (
      error instanceof ActiveSessionRevisionConflictError
      || error instanceof ActiveSessionIdempotencyConflictError
      || error instanceof ActiveSessionError
    ) throw error;
    throw new ActiveSessionTransportUncertainError(request, error);
  }
}
