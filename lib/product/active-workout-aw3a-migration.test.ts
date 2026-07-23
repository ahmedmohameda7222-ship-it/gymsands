import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = "supabase/migrations/20260722113000_active_workout_aw3a_structured_metrics.sql";
const migration = readFileSync(migrationPath, "utf8");

function filesUnder(root: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(root)) {
    if (["node_modules", ".next", ".git", "graphify-out"].includes(entry)) continue;
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) result.push(...filesUnder(path));
    else if (/\.(?:ts|tsx)$/.test(path)) result.push(path.replaceAll("\\", "/"));
  }
  return result;
}

describe("AW-3A migration and runtime authority", () => {
  it("creates only the approved performed child hierarchy and exact registry", () => {
    expect(migration).toContain("create table public.workout_performance_metric_definitions");
    expect(migration).toContain("create table public.exercise_log_metric_values");
    expect(migration).not.toContain("create table public.workout_performance_sessions");
    for (const key of [
      "repetitions",
      "external_load_kg",
      "bodyweight_kg",
      "assistance_load_kg",
      "duration_seconds",
      "distance_meters",
      "rounds"
    ]) expect(migration).toContain(`'${key}'`);
    for (const excluded of ["rpe", "rir", "tempo", "heart_rate", "pace", "power"]) {
      expect(migration).not.toMatch(new RegExp(`\\('${excluded}'`));
    }
  });

  it("binds metric ownership, immutable definitions, RLS, and direct-write closure", () => {
    expect(migration).toContain("foreign key (exercise_log_id,workout_session_id)");
    expect(migration).toContain("foreign key (workout_session_id,user_id)");
    expect(migration).toContain("unique (exercise_log_id,metric_key,side)");
    expect(migration).toContain("alter table public.exercise_log_metric_values enable row level security");
    expect(migration).toContain("revoke all on table public.workout_performance_metric_definitions");
    expect(migration).toContain("revoke insert,update,delete on table public.exercise_logs from authenticated");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
  });

  it("preserves the public atomic signature and implements both payload modes", () => {
    expect(migration).toContain("create or replace function public.upsert_workout_set_logs_atomic");
    expect(migration).toContain("v_structured := v_item ? 'performance_metrics'");
    expect(migration).toContain("A set can contain at most 16 performance metrics.");
    expect(migration).toContain("Performance metrics cannot include both none and bilateral compatibility values.");
    expect(migration).toContain("Scalar repetitions disagree with structured repetitions.");
    expect(migration).toContain("delete from public.exercise_log_metric_values existing");
    expect(migration).toContain("metric_key='repetitions' and side in ('none','bilateral')");
    expect(migration).toContain("metric_key='external_load_kg' and side in ('none','bilateral')");
  });

  it("extends AW-2C fingerprints without exposing private raw fields", () => {
    expect(migration).toContain("'performanceMetrics',v_after_metrics");
    expect(migration).toContain("case when v_before_metrics is distinct from v_after_metrics then 'performanceMetrics' end");
    expect(migration).toContain("'notesChanged',v_notes_changed");
    expect(migration).not.toContain("'notes',v_after.notes");
    for (const secret of ["access_token", "refresh_token", "user_agent", "ip_address", "controller_device_id"]) {
      expect(migration).not.toContain(secret);
    }
  });

  it("backfills only provable scalar facts and leaves the compatibility marker unchanged", () => {
    expect(migration).toContain("'repetitions',1,'none',l.reps");
    expect(migration).toContain("'external_load_kg',1,'none',l.weight_kg");
    expect(migration).toContain("where l.reps is not null");
    expect(migration).toContain("where l.weight_kg is not null");
    expect(migration).toContain("if v_marker = '20260722093115' then");
    expect(migration).toContain("AW-3A unexpectedly changed or entered with an unreconciled compatibility marker");
    expect(migration).not.toContain("update public.release_schema_compatibility");
  });

  it("keeps all reachable set mutations on the one atomic RPC", () => {
    const runtimeFiles = [
      "services/database/workout-sessions.ts",
      "services/database/workout-sessions-legacy.ts",
      "services/database/workout-sessions-legacy-implementation.ts",
      "services/database/workout-set-log-serialization.ts",
      "lib/mcp/tool-executor.ts",
      "lib/mcp/tool-executor-implementation.ts",
      "components/workouts/workout-session-form.tsx",
      "components/workouts/workout-day-focus-session.tsx"
    ];
    for (const file of runtimeFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/);
    }
    expect(readFileSync("services/database/workout-sessions.ts", "utf8")).toContain(
      '.rpc("upsert_workout_set_logs_atomic"'
    );
    expect(readFileSync("services/database/workout-sessions-legacy.ts", "utf8")).toContain(
      '.rpc("upsert_workout_set_logs_atomic"'
    );
    expect(readFileSync("services/database/workout-sessions-legacy-implementation.ts", "utf8")).toContain(
      '.rpc("upsert_workout_set_logs_atomic"'
    );

    const directExerciseLogMutators = filesUnder("services")
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .filter((file) =>
        /\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/.test(readFileSync(file, "utf8"))
      );
    expect(directExerciseLogMutators).toEqual([]);
    const mcpBoundary = readFileSync("lib/mcp/tool-executor.ts", "utf8");
    const mcpImplementation = readFileSync("lib/mcp/tool-executor-implementation.ts", "utf8");
    expect(mcpBoundary).toContain('functionName === "upsert_workout_set_logs_atomic"');
    expect(mcpImplementation).toContain('.rpc("upsert_workout_set_logs_atomic"');

    const directLegacyImports = filesUnder(".")
      .filter((file) => !file.includes("node_modules"))
      .filter((file) => !/\.(?:test|spec)\.(?:ts|tsx)$/.test(file))
      .filter((file) => file !== "services/database/workout-sessions.ts")
      .filter((file) =>
        /(?:from\s+|import\()\s*["'][^"']*workout-sessions-legacy["']/.test(readFileSync(file, "utf8"))
      );
    expect(directLegacyImports).toEqual([]);
  });

  it("tags MCP metric writes as chatgpt/openai and preserves PR compatibility", () => {
    const mcpBoundary = readFileSync("lib/mcp/tool-executor.ts", "utf8");
    expect(mcpBoundary).toContain('AW3A_MCP_METRIC_SOURCE = "chatgpt"');
    expect(mcpBoundary).toContain('AW3A_MCP_METRIC_SOURCE_PROVIDER = "openai"');
    expect(migration).toContain("coalesce(auth.role(),'')='service_role'");
    const progress = readFileSync("services/database/progress.ts", "utf8");
    expect(progress).toContain("reps");
    expect(progress).toContain("weight_kg");
  });

  it("includes owned metric values in privacy export without exporting definitions", () => {
    const exportSource = readFileSync("lib/privacy/data-export.ts", "utf8");
    expect(exportSource).toContain('.from("exercise_log_metric_values")');
    expect(exportSource).toContain("workouts.performance_metric_values");
    expect(exportSource).toContain('.order("captured_at", { ascending: true })');
    expect(exportSource).toContain('.order("id", { ascending: true })');
    expect(exportSource).toContain(".range(from, from + performanceMetricPageSize - 1)");
    expect(exportSource).not.toContain(".limit(8000)");
    expect(exportSource).not.toContain('.from("workout_performance_metric_definitions")');
  });

  it("records the exact audited repository commit consistently in the correction report", () => {
    const ledger = JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")) as { auditedRepositoryCommit: string };
    const report = readFileSync("plaivra_aw3a_final_planner_qaqc_corrections_report.md", "utf8");
    expect(ledger.auditedRepositoryCommit).toBe("a196cb217245557030cdc812a9dfcb670fcc0ba6");
    expect(report).toContain(`auditedRepositoryCommit: ${ledger.auditedRepositoryCommit}`);
  });
});
