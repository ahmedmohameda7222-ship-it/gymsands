import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("components/workouts/workout-day-focus-session.tsx", "utf8").replaceAll("\r\n", "\n");
const service = readFileSync("services/database/workout-session-execution.ts", "utf8").replaceAll("\r\n", "\n");
const store = readFileSync("lib/workouts/active-session-store/store.ts", "utf8").replaceAll("\r\n", "\n");

function functionBody(source: string, name: string, nextName: string) {
  const start = source.indexOf(`  async function ${name}`);
  const end = source.indexOf(`\n  async function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("AW-2A lifecycle preserved under AW-2B command authority", () => {
  it("retains canonical-log-first set completion sequencing", () => {
    const finishSet = functionBody(component, "finishSet", "restartSet");
    expect(finishSet).toContain("store.completeCanonicalSet");
    const completeCanonicalSet = store.slice(
      store.indexOf("async completeCanonicalSet"),
      store.indexOf("\n    async completeSession", store.indexOf("async completeCanonicalSet"))
    );
    expect(completeCanonicalSet.indexOf("adapter.writeCanonicalSet"))
      .toBeLessThan(completeCanonicalSet.indexOf("dispatch(setInput.executionIntent)"));
    expect(finishSet).not.toContain("startRestTimer(");
    expect(finishSet).not.toContain("moveToNextSet(");
  });

  it("maps post-set execution to the finite complete_set_transition command", () => {
    const start = service.indexOf("export async function persistWorkoutSessionAfterSetCompletion");
    const end = service.indexOf("\nexport async function persistWorkoutSessionRestTimer", start);
    const operation = service.slice(start, end);
    expect(operation).toContain('executeLatestCommand(userId, sessionId, "complete_set_transition"');
    for (const field of [
      "active_snapshot_item_id",
      "active_item_order",
      "active_set_number",
      "view_state",
      "rest_duration_seconds",
      "controller_device_id"
    ]) expect(operation).toContain(field);
    expect(operation).not.toContain("rest_started_at:");
    expect(operation).not.toContain("rest_ends_at:");
  });

  it("removes normal authenticated direct state UPDATE code", () => {
    expect(service).not.toContain('.from("workout_session_execution_states")\n    .update(');
    expect(service).toContain('.rpc("apply_workout_session_execution_command_atomic"');
  });

  it("replaces the old heartbeat and queue with the official store and shared clock", () => {
    expect(component).toContain("activeSessionStoreRef.current");
    expect(component).toContain("activeSessionClock.subscribe");
    expect(component).toContain("activeSessionClock.getSnapshot");
    expect(component).not.toContain("createWorkoutSessionExecutionWriteQueue");
    expect(component).not.toContain("window.setInterval");
  });
});
