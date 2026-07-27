import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const serializer = readFileSync(
  "services/database/workout-set-log-serialization.ts",
  "utf8"
);
const sessions = readFileSync("services/database/workout-sessions.ts", "utf8");
const legacy = readFileSync(
  "services/database/workout-sessions-legacy-implementation.ts",
  "utf8"
);
const controller = readFileSync(
  "components/workouts/active-workout/active-workout-core-session.tsx",
  "utf8"
);
const runtimeModel = readFileSync(
  "components/workouts/active-workout/active-workout-runtime-model.ts",
  "utf8"
);
const detailsBridge = readFileSync(
  "components/workouts/active-workout/active-workout-details-bridge.tsx",
  "utf8"
);
const shell = readFileSync(
  "components/workouts/active-workout/active-workout-execution-shell.tsx",
  "utf8"
);
const ui = [controller, runtimeModel, detailsBridge, shell].join("\n");
const mcp = readFileSync("lib/mcp/tool-executor-implementation.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260722210312_active_workout_aw3b_structured_set_details.sql",
  "utf8"
);
const types = readFileSync("types/workout-set-details.ts", "utf8");

describe("AW-3B set-write convergence", () => {
  it("keeps every set mutation on the canonical atomic authority", () => {
    for (const source of [sessions, legacy, mcp]) {
      expect(source).not.toMatch(
        /\.from\(["']exercise_logs["']\)\s*\.(?:insert|update|delete|upsert)/
      );
    }
    expect(sessions).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacy).toContain('.rpc("upsert_workout_set_logs_atomic"');
    expect(legacy).toContain('.rpc("complete_workout_session_atomic"');
    expect(mcp).toContain('.rpc("upsert_workout_set_logs_atomic"');
  });

  it("uses optional-key semantics for details and segments", () => {
    expect(serializer).toContain('hasOwnProperty.call(log, "setDetails")');
    expect(serializer).toContain('hasOwnProperty.call(log, "segments")');
    expect(migration).toContain("if v_item ? 'set_details' then");
    expect(migration).toContain("if v_item ? 'segments' then");
    expect(migration).toContain("delete from public.exercise_log_set_details");
    expect(migration).toContain(
      "delete from public.exercise_log_set_segments existing"
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
      "private.workout_set_type(null,v_log->>'set_type')"
    );
    expect(migration).not.toContain("regexp_match(\n    coalesce(p_notes");
  });

  it("hydrates structured rows without changing the current layout boundary", () => {
    const logReader = legacy.slice(
      legacy.indexOf("export async function getWorkoutSessionLogs"),
      legacy.indexOf("export async function updateWorkoutSessionDuration")
    );
    expect(logReader).toContain('.from("exercise_logs")');
    expect(logReader).toContain("set_details:exercise_log_set_details(*)");
    expect(logReader).toContain("segments:exercise_log_set_segments");
    expect(logReader).toContain(
      "metric_values:exercise_log_set_segment_metric_values(*)"
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
      expect(detailsBridge).toContain(`<option value="${type}">{tr("set.${type}")}</option>`);
    }
  });

  it("preserves absent and hidden details while persisting only explicit UI intent", () => {
    expect(runtimeModel).toContain("hasSetDetails: Boolean(details)");
    expect(runtimeModel).toContain("setDetailsWriteRequired: false");
    expect(controller).toContain("buildWorkoutContextLogRows(exerciseStates)");
    expect(runtimeModel).toContain("if (!set?.hasSetDetails || row.setDetails) return row");
    expect(runtimeModel).toContain("sideMode: set.sideMode");
    expect(runtimeModel).toContain("plannedTempo: set.plannedTempo");
    expect(runtimeModel).toContain("performedTempo: set.performedTempo");
    expect(runtimeModel).toContain("tempoAdherence: set.tempoAdherence");
    expect(runtimeModel).toContain("source: detailProvenance.source");
    expect(runtimeModel).toContain("sourceProvider: detailProvenance.sourceProvider");
    expect(runtimeModel).toContain("sourceVersion: detailProvenance.sourceVersion");
    expect(runtimeModel).toContain("editableWorkoutSetProvenance(");
    expect(runtimeModel).not.toContain('set.detailSource === "backfill"');
    expect(runtimeModel).toContain("detailSource: provenance.source");
    expect(runtimeModel).toContain("source: set.detailSource");
    expect(types).toContain('Exclude<\n  WorkoutPerformanceMetricSource,\n  "backfill"');
    expect(runtimeModel).toContain("details ? details.source_provider : set.detailSourceProvider");
    expect(runtimeModel).toContain("details ? details.source_version : set.detailSourceVersion");
    expect(controller).toContain("buildCanonicalLogRows(states, { pendingOnly: true })");
    expect(controller).toContain("mountWorkoutSetAutosaveCoordinator");
    expect(controller).toContain("scheduleFlush(650)");
    expect(controller).toContain("handleSetDetailsOpenChange");
    expect(controller).toContain("validOnly: true");
    expect(runtimeModel).toContain("? isPendingSetWrite(set)");
    expect(runtimeModel).toContain(": Boolean(set.completedAt)");
    expect(runtimeModel).toContain(
      "set.logWriteRequired && Boolean(set.completedAt || set.hasPersistedLog)"
    );
    expect(runtimeModel).toContain("hasPersistedLog: false");
    expect(runtimeModel).toContain("hasPersistedLog: true");
    expect(runtimeModel).toContain("completedAt: log.completed_at ?? null");
    expect(shell).toContain('htmlFor="active-set-reps"');
    expect(shell).toContain('id="active-set-reps"');
    expect(shell).toContain('htmlFor="active-set-weight"');
    expect(shell).toContain('id="active-set-weight"');

    const completion = controller.slice(
      controller.indexOf("async function completeSession"),
      controller.indexOf("function resetWorkoutTimer")
    );
    expect(completion).toContain("buildCanonicalLogRows(exerciseStates)");
    expect(completion).toContain('sourceKind === "direct"');
    expect(completion).toContain("buildCanonicalLogRows(exerciseStates, {");
    expect(completion).toContain("pendingOnly: true");
    expect(completion).toContain("validOnly: true");
  });

  it("acknowledges only the saved snapshot and isolates invalid draft effort from strict persistence", () => {
    expect(controller).toContain("acknowledgeSetWrites(current, states)");
    expect(runtimeModel).toContain("setValuesMatch(set, saved, detailWriteKeys)");
    expect(runtimeModel).toContain("setValuesMatch(set, saved, logWriteKeys)");
    expect(runtimeModel).toContain(
      "hasSetDetails: set.hasSetDetails || saved.setDetailsWriteRequired"
    );
    expect(controller).not.toContain("setExerciseStates(acknowledgeSetWrites(nextStates))");
    expect(runtimeModel).toContain('effortMode?: "strict" | "draft-context"');
    expect(runtimeModel).toContain('const parseEffort = options.effortMode === "draft-context"');
    expect(runtimeModel).toContain(": parseWorkoutSetEffortInput");
    expect(runtimeModel).toContain('rpe: parseEffort(set.rpe, "rpe")');
    expect(runtimeModel).toContain('rir: parseEffort(set.rir, "rir")');
    expect(runtimeModel).toContain('buildCanonicalLogRows(states, { effortMode: "draft-context" })');
    expect(runtimeModel).toContain('rpe: workoutSetEffortInputForContext(set.rpe, "rpe")');
    expect(runtimeModel).toContain('rir: workoutSetEffortInputForContext(set.rir, "rir")');
    expect(runtimeModel).not.toContain('parseWorkoutSetEffortInput(set.rpe');
    expect(runtimeModel).not.toContain('parseWorkoutSetEffortInput(set.rir');
    expect(detailsBridge).toContain("aria-invalid={Boolean(activeRpeValidation.error)}");
    expect(detailsBridge).toContain("aria-invalid={Boolean(activeRirValidation.error)}");
  });

  it("fails closed when the nested structured-log read is unavailable", () => {
    const reader = legacy.slice(
      legacy.indexOf("export async function getWorkoutSessionLogs"),
      legacy.indexOf("export async function updateWorkoutSessionDuration")
    );
    expect(reader).toContain("if (error)");
    expect(reader).toContain("throw error");
    expect(reader).not.toContain("return []");
    expect(controller).toContain("setLoadFailed(true)");
    expect(controller).toContain("if (loadFailed)");
    expect(controller.indexOf("if (loadFailed)")).toBeLessThan(
      controller.indexOf("if (!exerciseStates.length)")
    );
    const hydration = controller.slice(
      controller.indexOf("const hydration = store.hydrate"),
      controller.indexOf("setSession(nextSession)")
    );
    expect(hydration).toContain("await Promise.all");
    expect(hydration).toContain("store.getSnapshot()");
    expect(controller).toContain(
      "if (isStarting || !sessionId || !executionHydratedRef.current) return;"
    );
    expect(controller).toContain(
      "if (!sessionId || isSaving || isStarting || !executionHydratedRef.current) return;"
    );
    expect(controller).toContain("setIsStarting(true)");
    expect(controller).toContain("setSession(null)");
    expect(controller).toContain("|| !executionHydratedRef.current");
  });

  it("keeps completion converged on the public AW-3B wrapper", () => {
    expect(migration).toContain(
      "alter function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)"
    );
    expect(migration).toContain(
      "rename to aw3b_core_upsert_workout_set_logs_atomic"
    );
    expect(migration).toContain(
      "pg_get_functiondef('private.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'::regprocedure)"
    );
  });
});
