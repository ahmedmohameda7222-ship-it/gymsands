import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const writeService = readFileSync("services/database/workout-sessions.ts", "utf8");
const legacyService = readFileSync("services/database/workout-sessions-legacy.ts", "utf8");
const legacyImplementation = readFileSync(
  "services/database/workout-sessions-legacy-implementation.ts",
  "utf8"
);
const mcpExecutor = readFileSync("lib/mcp/tool-executor.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260722113000_active_workout_aw3a_structured_metrics.sql",
  "utf8"
);

describe("AW-3A set-write integration contract", () => {
  it("keeps legacy callers compatible while serializing structured values only when supplied", () => {
    expect(writeService).toContain("performanceMetrics?: WorkoutPerformanceMetricInput[]");
    expect(writeService).toContain('Object.prototype.hasOwnProperty.call(log, "performanceMetrics")');
    expect(writeService).toContain("performance_metrics:");
    expect(writeService).toContain("metric_source:");
    expect(writeService).toContain("metric_source_provider:");
    expect(writeService).toContain("metric_source_version:");
    expect(writeService).toContain("workoutPerformanceMetricInputToSql");
  });

  it("routes browser and MCP set mutations through the canonical atomic RPC", () => {
    expect(writeService).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacyService).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(mcpExecutor).toContain('.rpc("upsert_workout_set_logs_atomic"');
    for (const source of [writeService, legacyService, mcpExecutor]) {
      expect(source).not.toMatch(/\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/);
    }
  });

  it("makes the old direct set-write fallback unreachable from the public service barrel", () => {
    expect(writeService).toContain('export * from "./workout-sessions-legacy"');
    expect(writeService).toMatch(/export async function saveWorkoutSetLogs\(/);
    expect(legacyService).toContain('export * from "./workout-sessions-legacy-implementation"');
    expect(legacyService).toMatch(/export async function saveWorkoutSetLogs\(/);
    expect(legacyService).not.toContain('.from("exercise_logs")');
  });

  it("implements full replacement and old-client preservation in the database transaction", () => {
    expect(migration).toContain("v_structured := v_item ? 'performance_metrics'");
    expect(migration).toContain("delete from public.exercise_log_metric_values existing");
    expect(migration).toContain("not exists (");
    expect(migration).toContain("if v_item ? 'reps' then");
    expect(migration).toContain("if v_item ? 'weight_kg' then");
    expect(migration).toContain("v_existing_captured_at");
  });

  it("keeps completion on the same public RPC and relies on metric cascade for omitted logs", () => {
    expect(legacyImplementation).toContain('.rpc("complete_workout_session_atomic"');
    expect(migration).toContain("on delete cascade");
    expect(migration).toContain("references public.exercise_logs(id,workout_session_id) on delete cascade");
  });

  it("assigns ChatGPT/OpenAI metadata at the trusted MCP boundary without expanding the MCP schema", () => {
    expect(migration).toContain("coalesce(auth.role(),'')='service_role'");
    expect(migration).toContain("then 'chatgpt'");
    expect(migration).toContain("then 'openai'");
    expect(mcpExecutor).not.toContain("performance_metrics:");
  });
});
