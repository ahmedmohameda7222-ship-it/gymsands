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
const ui = readFileSync(
  "components/workouts/workout-day-focus-session.tsx",
  "utf8",
);
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
      "delete from public.exercise_log_set_segments existing",
    );
  });

  it("removes runtime note-token parsing and writes only free notes", () => {
    expect(ui).not.toContain("parseSetNote");
    expect(ui).not.toContain("setNote(");
    expect(ui).not.toContain("`RPE:${");
    expect(ui).not.toContain("`RIR:${");
    expect(ui).not.toContain("`type:${");
    expect(ui).toContain("setDetails:");
    expect(ui).toContain("notes: set.notes || null");
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
    expect(ui).toContain("const details = log.set_details");
    expect(ui).toContain("details?.rpe");
    expect(ui).toContain("details?.rir");
    expect(ui).toContain("details?.set_type");
    expect(ui).toContain('notes: log.notes ?? ""');
    expect(ui).not.toContain("log.notes ?? details?.notes");
    for (const type of ["backoff", "amrap", "timed", "other"]) {
      expect(ui).toContain(`<option value="${type}">{tr("set.${type}")}</option>`);
    }
  });

  it("preserves absent and hidden details while persisting only explicit UI intent", () => {
    expect(ui).toContain("hasSetDetails: Boolean(details)");
    expect(ui).toContain("setDetailsWriteRequired: false");
    expect(ui).toContain("buildWorkoutContextLogRows(exerciseStates)");
    expect(ui).toContain("if (!set?.hasSetDetails || row.setDetails) return row");
    expect(ui).toContain("sideMode: set.sideMode");
    expect(ui).toContain("plannedTempo: set.plannedTempo");
    expect(ui).toContain("performedTempo: set.performedTempo");
    expect(ui).toContain("tempoAdherence: set.tempoAdherence");
    expect(ui).toContain("source: detailProvenance.source");
    expect(ui).toContain("sourceProvider: detailProvenance.sourceProvider");
    expect(ui).toContain("sourceVersion: detailProvenance.sourceVersion");
    expect(ui).toContain("editableWorkoutSetProvenance(");
    expect(ui).not.toContain('set.detailSource === "backfill"');
    expect(ui).toContain('detailSource: provenance.source');
    expect(ui).toContain("source: set.detailSource");
    expect(types).toContain('Exclude<\n  WorkoutPerformanceMetricSource,\n  "backfill"');
    expect(ui).toContain("details\n          ? details.source_provider");
    expect(ui).toContain("details\n          ? details.source_version");
    expect(ui).toContain("buildLogRows(states, { pendingOnly: true })");
    expect(ui).toContain("createWorkoutSetAutosaveCoordinator");
    expect(ui).toContain("scheduleFlush(650)");
    expect(ui).toContain("handleSetDetailsOpenChange");
    expect(ui).toContain("validOnly: true");
    expect(ui).toContain("? isPendingSetWrite(set)");
    expect(ui).toContain(": Boolean(set.completedAt)");
    expect(ui).toContain(
      "set.logWriteRequired && Boolean(set.completedAt || set.hasPersistedLog)",
    );
    expect(ui).toContain("hasPersistedLog: false");
    expect(ui).toContain("hasPersistedLog: true");
    expect(ui).toContain("completedAt: log.completed_at ?? null");
    expect(ui).toContain('htmlFor="active-set-reps"');
    expect(ui).toContain('id="active-set-reps"');
    expect(ui).toContain('htmlFor="active-set-weight"');
    expect(ui).toContain('id="active-set-weight"');

    const completion = ui.slice(
      ui.indexOf("async function completeSession"),
      ui.indexOf("function resetWorkoutTimer"),
    );
    expect(completion).toContain("buildLogRows(exerciseStates)");
    expect(completion).not.toContain("pendingOnly: true");
  });

  it("acknowledges only the saved snapshot and retains edits made during a request", () => {
    expect(ui).toContain(
      "acknowledgeSetWrites(current, nextStates)",
    );
    expect(ui).toContain("setValuesMatch(set, saved, detailWriteKeys)");
    expect(ui).toContain("setValuesMatch(set, saved, logWriteKeys)");
    expect(ui).toContain(
      "hasSetDetails: set.hasSetDetails || saved.setDetailsWriteRequired",
    );
    expect(ui).not.toContain("setExerciseStates(acknowledgeSetWrites(nextStates))");
    expect(ui).toContain('parseWorkoutSetEffortInput(set.rpe, "rpe")');
    expect(ui).toContain("aria-invalid={Boolean(activeRpeValidation.error)}");
    expect(ui).toContain("aria-invalid={Boolean(activeRirValidation.error)}");
  });

  it("fails closed when the nested structured-log read is unavailable", () => {
    const reader = legacy.slice(
      legacy.indexOf("export async function getWorkoutSessionLogs"),
      legacy.indexOf("export async function updateWorkoutSessionDuration"),
    );
    expect(reader).toContain("if (error)");
    expect(reader).toContain("throw error");
    expect(reader).not.toContain("return []");
    expect(ui).toContain("setLoadFailed(true)");
    expect(ui).toContain("if (loadFailed)");
    expect(ui.indexOf("if (loadFailed)")).toBeLessThan(
      ui.indexOf("if (!exerciseStates.length)"),
    );
    const hydration = ui.slice(
      ui.indexOf("getOrStartWorkoutDaySession(user.id, day)"),
      ui.indexOf(".catch((error) =>"),
    );
    expect(hydration.indexOf("getWorkoutSessionLogs(nextSession.id)")).toBeLessThan(
      hydration.indexOf("setSession(nextSession)"),
    );
    expect(ui).toContain(
      "if (isStarting || !session?.id || !executionHydratedRef.current) return;",
    );
    expect(ui).toContain(
      "if (!session || isSaving || isStarting || !executionHydratedRef.current) return;",
    );
    expect(ui).toContain("setIsStarting(true)");
    expect(ui).toContain("setSession(null)");
    expect(ui).toContain("|| !executionHydratedRef.current");
  });

  it("keeps completion converged on the public AW-3B wrapper", () => {
    expect(migration).toContain(
      "alter function public.upsert_workout_set_logs_atomic(uuid,uuid,jsonb)",
    );
    expect(migration).toContain(
      "rename to aw3b_core_upsert_workout_set_logs_atomic",
    );
    expect(migration).toContain(
      "pg_get_functiondef('private.aw2c_core_complete_workout_session_atomic(uuid,uuid,jsonb,integer,text)'::regprocedure)",
    );
  });
});
