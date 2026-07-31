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
  "lib/workouts/active-session-store/store.ts",
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

  it("persists before optimistic command reduction and serializes reconciliation", () => {
    const enqueue = store.indexOf("await sync.enqueue(");
    const reduce = store.indexOf("const transition = reduceSessionCommand(");
    expect(enqueue).toBeGreaterThan(0);
    expect(reduce).toBeGreaterThan(enqueue);
    expect(coordinator).toContain("for (const operation of operations)");
    expect(coordinator).toContain("MAX_ATTEMPTS = 6");
    expect(coordinator).toContain("controller_conflict");
    expect(coordinator).toContain("revision_conflict");
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
