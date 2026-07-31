import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const indexedDb = readFileSync(
  "lib/workouts/active-session-sync/indexed-db.ts",
  "utf8",
);
const contracts = readFileSync(
  "lib/workouts/active-session-sync/contracts.ts",
  "utf8",
);
const coordinator = readFileSync(
  "lib/workouts/active-session-sync/coordinator.ts",
  "utf8",
);
const store = readFileSync(
  "lib/workouts/active-session-store/store-core.ts",
  "utf8",
);
const workoutSessions = readFileSync(
  "services/database/workout-sessions.ts",
  "utf8",
);
const realtime = readFileSync(
  "services/database/active-session-realtime.ts",
  "utf8",
);

describe("AW-9 durable synchronization contract", () => {
  it("uses the versioned native IndexedDB schema and seven-day retention", () => {
    expect(contracts).toContain("plaivra-active-workout-v1");
    expect(indexedDb).toContain('"session_snapshots"');
    expect(indexedDb).toContain('"operations"');
    expect(indexedDb).toContain("ACTIVE_WORKOUT_OFFLINE_RETENTION_MS");
  });

  it("validates locally before durable enqueue and serializes reconciliation", () => {
    const offlineBranch = store.indexOf("if (isOffline()) {");
    const validate = store.indexOf("const transition = planOfflineCommand(", offlineBranch);
    const enqueue = store.indexOf("await sync.enqueue(", validate);
    expect(offlineBranch).toBeGreaterThan(0);
    expect(validate).toBeGreaterThan(offlineBranch);
    expect(enqueue).toBeGreaterThan(validate);
    expect(coordinator).toContain("for (const operation of operations)");
    expect(coordinator).toContain("payload.logs.length !== 1");
    expect(coordinator).toContain("MAX_ATTEMPTS = 6");
    expect(coordinator).toContain("controller_conflict");
    expect(coordinator).toContain("revision_conflict_rehydrate");
    expect(coordinator).toContain("target_conflict");
  });

  it("restores the exact candidate session from cache only after offline failure", () => {
    expect(workoutSessions).toContain("readActiveWorkoutSessionCache");
    expect(workoutSessions).toContain("if (!result.error || !candidateSessionId");
    expect(workoutSessions).toContain("navigator.onLine");
    expect(workoutSessions).toContain("root.id !== candidateSessionId");
    expect(workoutSessions).toContain("root.user_id !== userId");
    expect(workoutSessions).toContain('root.status !== "started"');
    expect(store).toContain("projectPendingSetWrites");
    expect(store).toContain('syncState: terminalPending ? "terminal_pending" : "offline_saved"');
  });

  it("uses scoped invalidation-only Realtime with cleanup and no polling", () => {
    expect(realtime).toContain("postgres_changes");
    expect(realtime).toContain(
      "filter: `workout_session_id=eq.${input.workoutSessionId}`",
    );
    expect(realtime).toContain("removeChannel");
    expect(realtime).not.toMatch(/setInterval|poll/i);
  });
});
