import type { WorkoutSessionExecutionState } from "@/types";
import type { ActiveSessionStore } from "@/lib/workouts/active-session-store/store";

export type ActiveWorkoutExecutionDispatchOptions = {
  rollback?: (currentServerState: WorkoutSessionExecutionState | null) => void;
  reportFailure?: boolean;
};

export type ActiveWorkoutExecutionDispatchContext = {
  store: ActiveSessionStore | null;
  userId: string | null;
  sessionId: string | null;
  createCommandId: () => string;
  mirrorState: (state: WorkoutSessionExecutionState) => void;
  reportFailure: (error: unknown) => void;
};

type CommandType = Parameters<ActiveSessionStore["dispatch"]>[0]["commandType"];
type CommandPayload = Parameters<ActiveSessionStore["dispatch"]>[0]["payload"];

export async function dispatchActiveWorkoutExecutionAwaited(
  context: ActiveWorkoutExecutionDispatchContext,
  commandType: CommandType,
  payload: CommandPayload,
  options: ActiveWorkoutExecutionDispatchOptions = {}
) {
  const attemptedState = context.store?.getSnapshot().executionState ?? null;

  try {
    if (!context.store || !context.userId || !context.sessionId) {
      throw new Error("The workout execution store is unavailable.");
    }
    const response = await context.store.dispatch({
      userId: context.userId,
      workoutSessionId: context.sessionId,
      commandId: context.createCommandId(),
      commandType,
      payload
    } as Parameters<ActiveSessionStore["dispatch"]>[0]);
    context.mirrorState(response.state);
    return response.state;
  } catch (error) {
    options.rollback?.(attemptedState);
    if (options.reportFailure !== false) context.reportFailure(error);
    throw error;
  }
}

export async function dispatchActiveWorkoutExecutionBackground(
  context: ActiveWorkoutExecutionDispatchContext,
  commandType: CommandType,
  payload: CommandPayload,
  options: ActiveWorkoutExecutionDispatchOptions = {}
) {
  try {
    await dispatchActiveWorkoutExecutionAwaited(context, commandType, payload, options);
  } catch {
    // Background commands finish after their single centralized report/rollback.
  }
}
