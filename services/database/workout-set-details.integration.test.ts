import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serializer = readFileSync(
  "services/database/workout-set-log-serialization.ts",
  "utf8",
);
const sessions = readFileSync("services/database/workout-sessions.ts", "utf8");
const legacy = readFileSync(
  "services/database/workout-sessions-legacy-implementation.ts",
  "utf8",
);
const controller = readFileSync(
  "components/workouts/active-workout/active-workout-core-session.tsx",
  "utf8",
);
const runtimeModel = [
  readFileSync(
    "components/workouts/active-workout/active-workout-runtime-model.ts",
    "utf8",
  ),
  readFileSync(
    "components/workouts/active-workout/active-workout-runtime-model-core.ts",
    "utf8",
  ),
].join("\n");
const detailsBridge = readFileSync(
  "components/workouts/active-workout/active-workout-details-bridge.tsx",
  "utf8",
);
const shell = readFileSync(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  "utf8",
);
const ui = [controller, runtimeModel, detailsBridge, shell].join("\n");
const mcp = readFileSync("lib/mcp/tool-executor-implementation.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260722210312_active_workout_aw3b_structured_set_details.sql",
  "utf8",
);
const types = readFileSync("types/workout-set-details.ts", "utf8");

describe("AW-3B set-write convergence", () => {
  it("keeps every set mutation on the canonical atomic authority", () => {
    for (const source of [sessions, legacy, mcp]) {
      expect(source).not.toMatch(
        /\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/,
      );
    }
    expect(sessions).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacy).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacy).toMatch(/\.rpc\(\s*"complete_workout_session_atomic"/);
    expect(mcp).toContain('.rpc("upsert_workout_set_logs_atomic"');
  });

  it("uses optional-key semantics for details and segments", () => {
    expect(serializer).toContain('hasOwnProperty.call(log, "setDetails")');
    expect(serializer).toContain('hasOwnProperty.call(log, "segments")');
    expect(migration).toContain("if v_item ? 'set_details' then");
    expect(migration).toContain("if v_item ? 'segments' then");
    expect(migration).toContain("delete from public.exercise_log_set_details");
    expect(migration).toContain(
      "delete from public.exercise_log_set_segments existing",
    );
  });

  it("removes runtime note-token parsing and writes only free notes", () => {
    expect(ui).not.toContain("parseSetNote");
    expect(ui).not.toContain("setNote(");
    expect(ui).not.toContain("`RPE:${");
    expect(ui).not.toContain("`RIR:${");
    expect(ui).not.toContain("`type:${");
    expect(runtimeModel).toContain("setDetails:");
    expect(runtimeModel).toContain("notes: set.notes || null");
    expect(migration).toContain(
      "private.workout_set_type(null,v_log->>'set_type')",
    );
    expect(migration).not.toContain("regexp_match(\n    coalesce(p_notes");
  });

  it("hydrates structured rows without changing the current layout boundary", () => {
    const logReader = legacy.slice(
      legacy.indexOf("export async function getWorkoutSessionLogs"),
      legacy.indexOf("export async function updateWorkoutSessionDuration"),
    );
    expect(logReader).toContain('.from("exercise_logs")');
    expect(logReader).toContain("set_details:exercise_log_set_details(*)");
    expect(logReader).toContain("segments:exercise_log_set_segments");
    expect(logReader).toContain(
      "metric_values:exercise_log_set_segment_metric_values(*)",
    );
    expect(logReader).toContain("normalizeWorkoutSetDetailsRelation");
    expect(logReader).toContain("normalizeWorkoutSetSegmentsRelation");
    expect(logReader).toContain('.order("segment_order"');
    expect(logReader).toContain('referencedTable: "exercise_log_set_segments"');
    expect(logReader).toContain("relationContext");
    expect(runtimeModel).toContain("const details = log.set_details");
    expect(runtimeModel).toContain("details?.rpe");
    expect(runtimeModel).toContain("details?.rir");
    expect(runtimeModel).toContain("details?.set_type");
    expect(runtimeModel).toContain('notes: log.notes ?? ""');
    expect(runtimeModel).not.toContain("log.notes ?? details?.notes");
    for (const type of ["backoff", "amrap", "timed", "other"]) {
      expect(detailsBridge).toContain(
        `<option value="${type}">{tr("set.${type}")}</option>`,
      );
    }
  });

  it("preserves absent and hidden details while persisting only explicit UI intent", () => {
    expect(runtimeModel).toContain("hasSetDetails: Boolean(details)");
    expect(runtimeModel).toContain("setDetailsWriteRequired: false");
    expect(controller).toContain("buildWorkoutContextLogRows(exerciseStates)");
    expect(runtimeModel).toContain(
      "if (!set?.hasSetDetails || row.setDetails) return row",
    );
    expect(runtimeModel).toContain("sideMode: set.sideMode");
    expect(runtimeModel).toContain("plannedTempo: set.plannedTempo");
    expect(runtimeModel).toContain("performedTempo: set.performedTempo");
    expect(runtimeModel).toContain("tempoAdherence: set.tempoAdherence");
    expect(runtimeModel).toContain("source: detailProvenance.source");
    expect(runtimeModel).toContain(
      "sourceProvider: detailProvenance.sourceProvider",
    );
    expect(runtimeModel).toContain(
      "sourceVersion: detailProvenance.sourceVersion",
    );
    expect(types).toContain('source: WorkoutPerformanceMetricSource');
  });
});
