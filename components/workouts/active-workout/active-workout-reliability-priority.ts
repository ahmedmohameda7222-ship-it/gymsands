import type { ActiveWorkoutSyncState } from "@/lib/workouts/active-session-sync";

export type ActiveWorkoutBlockingReliabilityState =
  | "data_conflict"
  | "device_conflict"
  | "tab_conflict"
  | null;

export type ActiveWorkoutNonBlockingSyncState =
  | "offline_saved"
  | "syncing"
  | "retry_needed"
  | "terminal_pending"
  | null;

export type ActiveWorkoutReliabilityPresentation = {
  blockingState: ActiveWorkoutBlockingReliabilityState;
  nonBlockingSyncState: ActiveWorkoutNonBlockingSyncState;
  showStandaloneSyncStatus: boolean;
};

export function resolveActiveWorkoutReliabilityPresentation(input: {
  syncState: ActiveWorkoutSyncState;
  tabLeader: boolean;
  controllerConflictDeviceId: string | null;
}): ActiveWorkoutReliabilityPresentation {
  const blockingState: ActiveWorkoutBlockingReliabilityState = input.syncState === "data_conflict"
    ? "data_conflict"
    : input.controllerConflictDeviceId || input.syncState === "device_conflict"
      ? "device_conflict"
      : !input.tabLeader
        ? "tab_conflict"
        : null;

  const nonBlockingSyncState: ActiveWorkoutNonBlockingSyncState =
    input.syncState === "offline_saved"
      || input.syncState === "syncing"
      || input.syncState === "retry_needed"
      || input.syncState === "terminal_pending"
      ? input.syncState
      : null;

  return {
    blockingState,
    nonBlockingSyncState,
    showStandaloneSyncStatus: blockingState === null && nonBlockingSyncState !== null
  };
}
