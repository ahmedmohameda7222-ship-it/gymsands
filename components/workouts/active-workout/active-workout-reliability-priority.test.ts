import { describe, expect, it } from "vitest";

import { resolveActiveWorkoutReliabilityPresentation } from "./active-workout-reliability-priority";

function resolve(overrides: Partial<Parameters<typeof resolveActiveWorkoutReliabilityPresentation>[0]> = {}) {
  return resolveActiveWorkoutReliabilityPresentation({
    syncState: "online_synced",
    tabLeader: true,
    controllerConflictDeviceId: null,
    ...overrides
  });
}

describe("Active Workout reliability presentation priority", () => {
  it("A: normal synced session has no reliability surface", () => {
    expect(resolve()).toEqual({
      blockingState: null,
      nonBlockingSyncState: null,
      showStandaloneSyncStatus: false
    });
  });

  it("B: pending writes/syncing stays compact and nonblocking", () => {
    expect(resolve({ syncState: "syncing" })).toEqual({
      blockingState: null,
      nonBlockingSyncState: "syncing",
      showStandaloneSyncStatus: true
    });
  });

  it("C: retry-needed stays compact when execution authority is otherwise available", () => {
    expect(resolve({ syncState: "retry_needed" })).toEqual({
      blockingState: null,
      nonBlockingSyncState: "retry_needed",
      showStandaloneSyncStatus: true
    });
  });

  it("D: same-tab conflict becomes the one blocking session-control state", () => {
    expect(resolve({ tabLeader: false }).blockingState).toBe("tab_conflict");
  });

  it("E: device ownership conflict outranks same-tab leadership", () => {
    expect(resolve({ tabLeader: false, controllerConflictDeviceId: "device-2" }).blockingState)
      .toBe("device_conflict");
  });

  it("F: same-tab conflict suppresses a separate pending-sync floating surface", () => {
    expect(resolve({ tabLeader: false, syncState: "syncing" })).toEqual({
      blockingState: "tab_conflict",
      nonBlockingSyncState: "syncing",
      showStandaloneSyncStatus: false
    });
  });

  it("G: device conflict suppresses a separate pending-sync floating surface", () => {
    expect(resolve({ controllerConflictDeviceId: "device-2", syncState: "syncing" })).toEqual({
      blockingState: "device_conflict",
      nonBlockingSyncState: "syncing",
      showStandaloneSyncStatus: false
    });
  });

  it("H: explicit data conflict is highest priority and never silently downgraded", () => {
    expect(resolve({
      syncState: "data_conflict",
      tabLeader: false,
      controllerConflictDeviceId: "device-2"
    })).toEqual({
      blockingState: "data_conflict",
      nonBlockingSyncState: null,
      showStandaloneSyncStatus: false
    });
  });

  it("treats a sync-layer device conflict as blocking even before controller identity is available", () => {
    expect(resolve({ syncState: "device_conflict" }).blockingState).toBe("device_conflict");
  });

  it("keeps offline and terminal-pending transport status nonblocking", () => {
    expect(resolve({ syncState: "offline_saved" }).showStandaloneSyncStatus).toBe(true);
    expect(resolve({ syncState: "terminal_pending" }).showStandaloneSyncStatus).toBe(true);
  });
});
