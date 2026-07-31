"use client";

import type {
  ActiveSessionPersistenceAdapter,
  CanonicalWorkoutSetWrite
} from "@/lib/workouts/active-session-store/persistence-adapter";
import { dispatchWithTransportClassification } from "@/lib/workouts/session-engine/commands";
import type {
  SessionCommandRequest,
  SessionCommandResponse
} from "@/lib/workouts/session-engine/contracts";
import {
  ActiveSessionControllerConflictError
} from "@/lib/workouts/session-engine/contracts";
import {
  executeWorkoutSessionExecutionCommand,
  getWorkoutSessionExecutionState
} from "./workout-session-execution";
import { getWorkoutSessionPrescriptionItems } from "./workout-session-prescriptions";
import { skipWorkoutSessionSnapshotItem } from "./workout-session-timeline";
import {
  cancelWorkoutSession,
  completeWorkoutSession,
  getWorkoutSessionRoot,
  getWorkoutSessionLogs,
  replaceWorkoutSessionExercise,
  saveWorkoutSetLogs
} from "./workout-sessions";
import type { WorkoutSetLogInput } from "./workout-set-log-serialization";

async function dispatchExecutionCommand(request: SessionCommandRequest) {
  return dispatchWithTransportClassification(
    request,
    (nextRequest) =>
      executeWorkoutSessionExecutionCommand(
        nextRequest as Parameters<typeof executeWorkoutSessionExecutionCommand>[0]
      ) as Promise<SessionCommandResponse>
  );
}

function rethrowTypedControllerConflict(error: unknown): never {
  const value = error as {
    code?: unknown;
    details?: unknown;
    message?: unknown;
  };
  if (
    value?.details === "controller_conflict"
    || value?.message === "Workout controller conflict."
  ) {
    throw new ActiveSessionControllerConflictError();
  }
  throw error;
}

export const activeSessionPersistenceAdapter: ActiveSessionPersistenceAdapter = {
  async loadSessionRoot(userId, workoutSessionId) {
    return getWorkoutSessionRoot(userId, workoutSessionId);
  },
  loadExecutionState: getWorkoutSessionExecutionState,
  loadPrescription: getWorkoutSessionPrescriptionItems,
  async loadPerformedLogs(_userId, workoutSessionId) {
    return getWorkoutSessionLogs(workoutSessionId);
  },
  dispatchExecutionCommand,
  async writeCanonicalSet(workoutSessionId, logs, controllerDeviceId) {
    try {
      await saveWorkoutSetLogs(
        workoutSessionId,
        logs as WorkoutSetLogInput[],
        controllerDeviceId
      );
    } catch (error) {
      rethrowTypedControllerConflict(error);
    }
  },
  async completeSession(input) {
    try {
      await completeWorkoutSession(
        input.workoutSessionId,
        input.notes,
        input.durationMinutes,
        input.finalLogs as WorkoutSetLogInput[] | undefined,
        input.controllerDeviceId
      );
    } catch (error) {
      rethrowTypedControllerConflict(error);
    }
    const root = await getWorkoutSessionRoot(input.userId, input.workoutSessionId);
    if (!root || root.status !== "completed") {
      throw new Error("The completed workout session could not be confirmed.");
    }
    return root;
  },
  replaceExercise(input) {
    return replaceWorkoutSessionExercise(
      input.userId,
      input.workoutSessionId,
      input.sourcePlanExerciseId,
      input.replacement,
      input.controllerDeviceId
    ).catch(rethrowTypedControllerConflict);
  },
  skipExercise(
    userId,
    workoutSessionId,
    snapshotItemId,
    reason,
    controllerDeviceId
  ) {
    return skipWorkoutSessionSnapshotItem(
      userId,
      workoutSessionId,
      snapshotItemId,
      reason,
      controllerDeviceId
    ).catch(rethrowTypedControllerConflict);
  },
  async cancelSession(userId, workoutSessionId, controllerDeviceId) {
    try {
      await cancelWorkoutSession(workoutSessionId, controllerDeviceId);
    } catch (error) {
      rethrowTypedControllerConflict(error);
    }
    const root = await getWorkoutSessionRoot(userId, workoutSessionId);
    if (!root || root.status !== "cancelled") {
      throw new Error("The cancelled workout session could not be confirmed.");
    }
    return root;
  }
};

export type { CanonicalWorkoutSetWrite };
