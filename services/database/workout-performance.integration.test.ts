import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const writeService = readFileSync("services/database/workout-sessions.ts", "utf8");
const legacyService = readFileSync("services/database/workout-sessions-legacy.ts", "utf8");
const legacyImplementation = readFileSync(
  "services/database/workout-sessions-legacy-implementation.ts",
  "utf8"
);
const serializer = readFileSync(
  "services/database/workout-set-log-serialization.ts",
  "utf8"
);
const mcpExecutor = readFileSync("lib/mcp/tool-executor.ts", "utf8");
const mcpImplementation = readFileSync("lib/mcp/tool-executor-implementation.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260722113000_active_workout_aw3a_structured_metrics.sql",
  "utf8"
);

describe("AW-3A set-write integration contract", () => {
  it("keeps legacy callers compatible while serializing structured values only when supplied", () => {
    expect(writeService).toContain('import { serializeWorkoutSetLogs } from "./workout-set-log-serialization"');
    expect(legacyImplementation).toContain("serializeWorkoutSetLogs(finalLogs)");
    expect(serializer).toContain("performanceMetrics?: WorkoutSetPerformanceMetricInput[]");
    expect(serializer).toContain('Object.prototype.hasOwnProperty.call(log, "performanceMetrics")');
    expect(serializer).toContain("performance_metrics:");
    expect(serializer).toContain("metric_source:");
    expect(serializer).toContain("metric_source_provider:");
    expect(serializer).toContain("metric_source_version:");
    expect(serializer).toContain("workoutPerformanceMetricInputToSql");
  });

  it("routes browser and MCP set mutations through the canonical atomic RPC", () => {
    expect(writeService).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacyService).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacyImplementation).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(mcpImplementation).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(mcpExecutor).toContain('functionName === "upsert_workout_set_logs_atomic"');
    for (const source of [writeService, legacyService, legacyImplementation, mcpExecutor, mcpImplementation]) {
      expect(source).not.toMatch(/\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/);
    }
  });

  it("removes the old direct set-write fallback from every public and implementation service path", () => {
    expect(writeService).toContain('export * from "./workout-sessions-legacy"');
    expect(writeService).toMatch(/export async function saveWorkoutSetLogs\(/);
    expect(legacyService).toContain('export * from "./workout-sessions-legacy-implementation"');
    expect(legacyService).toMatch(/export async function saveWorkoutSetLogs\(/);
    expect(legacyImplementation).toMatch(/export async function saveWorkoutSetLogs\(/);
    expect(legacyService).not.toContain('.from("exercise_logs")');
    expect(legacyImplementation).not.toMatch(/\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/);
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
    expect(legacyImplementation).toContain("serializeWorkoutSetLogs(finalLogs)");
    expect(migration).toContain("on delete cascade");
    expect(migration).toContain("references public.exercise_logs(id,workout_session_id) on delete cascade");
  });

  it("assigns ChatGPT/OpenAI metadata at the trusted MCP boundary without expanding the MCP schema", () => {
    expect(mcpExecutor).toContain('AW3A_MCP_METRIC_SOURCE = "chatgpt"');
    expect(mcpExecutor).toContain('AW3A_MCP_METRIC_SOURCE_PROVIDER = "openai"');
    expect(migration).toContain("coalesce(auth.role(),'')='service_role'");
    expect(mcpImplementation).not.toContain("performance_metrics:");
  });
});
