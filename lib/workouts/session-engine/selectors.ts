import type { WorkoutSessionExecutionState, WorkoutSessionPrescriptionItem } from "@/types";
import { activityTimerProjection, restSecondsRemaining, sessionElapsedSeconds } from "./timers";

export function executionCursor(state: WorkoutSessionExecutionState | null) {
  return state
    ? {
        snapshotItemId: state.active_snapshot_item_id,
        itemOrder: state.active_item_order,
        setNumber: state.active_set_number
      }
    : null;
}

export function currentPrescriptionSet(
  state: WorkoutSessionExecutionState | null,
  prescription: readonly WorkoutSessionPrescriptionItem[]
) {
  if (!state) return null;
  const item = prescription.find((candidate) =>
    candidate.id === state.active_snapshot_item_id
    && candidate.itemOrder === state.active_item_order
  );
  return item?.prescriptionSets.find(
    (candidate) => candidate.setOrder === state.active_set_number
  ) ?? null;
}

export const sessionTimerSelector = (
  state: WorkoutSessionExecutionState | null,
  nowMs: number
) => state ? sessionElapsedSeconds(state, nowMs) : 0;

export const restTimerSelector = (
  state: WorkoutSessionExecutionState | null,
  nowMs: number
) => state ? restSecondsRemaining(state, nowMs) : 0;

export const activityTimerSelector = (
  state: WorkoutSessionExecutionState | null,
  nowMs: number
) => state ? activityTimerProjection(state, nowMs) : null;
