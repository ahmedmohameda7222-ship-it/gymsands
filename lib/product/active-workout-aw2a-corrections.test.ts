import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("components/workouts/workout-day-focus-session.tsx", "utf8").replaceAll("\r\n", "\n");
const service = readFileSync("services/database/workout-session-execution.ts", "utf8").replaceAll("\r\n", "\n");

function functionBody(source: string, name: string, nextName: string) {
  const start = source.indexOf(`  async function ${name}`);
  const end = source.indexOf(`\n  async function ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("AW-2A final correction source contracts", () => {
  it("routes set completion through canonical-log-first sequencing", () => {
    const finishSet = functionBody(component, "finishSet", "restartSet");
    expect(finishSet).toContain("persistCanonicalSetThenExecution");
    expect(finishSet.indexOf("saveWorkoutSetLogs")).toBeLessThan(finishSet.indexOf("persistWorkoutSessionAfterSetCompletion"));
    expect(finishSet).not.toContain("startRestTimer(");
    expect(finishSet).not.toContain("moveToNextSet(");
  });

  it("uses one typed post-set execution update containing cursor, view, rest, and controller fields", () => {
    const start = service.indexOf("export async function persistWorkoutSessionAfterSetCompletion");
    const end = service.indexOf("\nexport async function persistWorkoutSessionRestTimer", start);
    const operation = service.slice(start, end);
    expect(operation.match(/updateWorkoutSessionExecutionState\(/g)).toHaveLength(1);
    for (const field of [
      "active_snapshot_item_id",
      "active_item_order",
      "active_set_number",
      "view_state",
      "rest_started_at",
      "rest_duration_seconds",
      "rest_ends_at",
      "controller_device_id"
    ]) expect(operation).toContain(field);
  });

  it("projects the compatibility heartbeat from authoritative execution elapsed time", () => {
    const heartbeat = component.match(/useEffect\(\(\) => \{\n    if \(!session\) return;[\s\S]*?\n  \}, \[session\]\);/)?.[0] ?? "";
    expect(heartbeat).toContain("executionDurationMinutes(authoritativeState)");
    expect(heartbeat).toContain("executionWriteQueueRef.current.current()");
    expect(heartbeat).not.toContain("Date.now() - startedAtMs");
  });

  it("does not retain the old rendered-snapshot promise queue", () => {
    expect(component).toContain("createWorkoutSessionExecutionWriteQueue");
    expect(component).not.toContain("executionWriteRef");
    expect(component).not.toContain("currentState: executionState");
    expect(component).not.toContain('executionState?.session_state !== "review"');
  });
});
