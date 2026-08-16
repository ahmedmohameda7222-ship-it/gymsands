import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const core = readFileSync("components/workouts/active-workout/active-workout-core-session-implementation.tsx", "utf8");
const shell = readFileSync("components/workouts/active-workout/active-workout-execution-shell.tsx", "utf8");
const details = readFileSync("components/workouts/active-workout/active-workout-details-bridge.tsx", "utf8");
const review = readFileSync("components/workouts/active-workout/active-workout-review-bridge.tsx", "utf8");
const runtime = readFileSync("components/workouts/active-workout/active-workout-runtime-model.ts", "utf8");
const runtimeCore = readFileSync("components/workouts/active-workout/active-workout-runtime-model-core.ts", "utf8");
const previous = readFileSync("services/workouts/active-workout/previous-performance-server.ts", "utf8");
const previousClient = readFileSync("services/workouts/active-workout/previous-performance-client.ts", "utf8");
const records = readFileSync("app/api/workouts/active/[sessionId]/personal-records/route.ts", "utf8");
const recordsClient = readFileSync("services/workouts/active-workout/terminal-personal-records-client.ts", "utf8");

describe("Active Workout final binding redesign authority", () => {
  it("keeps broad history and display-name matching out of live execution", () => {
    expect(core).not.toContain("getWorkoutHistoryDetailed");
    expect(core).not.toContain("previousSetForExercise");
    expect(core).not.toContain("previousPerformance(history");
    expect(previous).not.toContain("exercise_name");
    expect(previous).toContain('.is("workout_sessions.deleted_at", null)');
    expect(previous).toContain(".limit(1)");
    expect(previous).toContain('"plan_activity"');
    expect(previous).toContain('"plan_exercise"');
    expect(previous).toContain('"source_workout"');
  });

  it("authenticates owner-scoped secondary API reads", () => {
    for (const client of [previousClient, recordsClient]) {
      expect(client).toContain("supabase.auth.getSession()");
      expect(client).toContain('env.useMockAuth ? "plaivra-local-qa"');
    }
    expect(previousClient).toContain("Authorization: `Bearer ${await accessToken()}`");
    expect(recordsClient).toContain("const authorization = `Bearer ${await accessToken()}`");
    expect(recordsClient).toContain("Authorization: authorization");
    expect(recordsClient).toContain("if (!refreshResponse.ok)");
  });

  it("separates session controls, canonical exercise details, exercise actions, and set details", () => {
    expect(shell).toContain("data-aw10-session-menu");
    expect(shell).toContain("data-aw10-exercise-details-trigger");
    expect(shell).toContain("data-aw10-exercise-actions");
    expect(shell).toContain("data-active-set-details-trigger");
    expect(core).toContain('tr("minimized.cancelWorkout")');
    expect(core).toContain('tr("chatGPT.ask")');
    expect(core).toContain("openCanonicalExerciseDetail");
    expect(core).toContain("activeWorkoutExerciseDetailHref");
    expect(details).toContain("data-aw10-set-details-exact");
    expect(details).not.toContain("data-aw6-details-overview");
    expect(details).not.toContain('hidden={effectiveSection !== "overview"}');
    expect(details).toContain('hidden={effectiveSection !== "current-set"}');
    expect(details).toContain('hidden={effectiveSection !== "muscle-load"}');
    expect(details.indexOf("const effectiveSection")).toBeLessThan(details.indexOf("useEffect(() =>"));
    expect(shell).toContain("data-aw10-current-target");
    expect(details).toContain("const dialogDescription");
    expect(details).not.toContain('tr("details.activeWorkoutDetailsDescription")');
    expect(core).not.toContain("aiPermitted: true");
    expect(details).not.toContain('>{legacyReopenSetLabel}<');
    expect(details).not.toContain('>{tr("actions.resetWorkoutTimer")}<');
  });

  it("preserves authoritative frozen repetition targets through the compatibility path", () => {
    expect(runtimeCore).toContain("function frozenRepetitionsTarget");
    expect(runtimeCore).toContain("item.rawCompatibilityPrescription.reps");
    expect(runtimeCore).toContain("plannedReps: frozenRepetitionsTarget(item, frozenSet)");
    expect(runtimeCore).toContain("reps: frozenRepetitionsTarget(item, firstSet)");
  });

  it("never presents local or candidate Personal Records", () => {
    expect(core).not.toContain("buildPrs");
    expect(core).not.toContain("possible_prs");
    expect(runtime).toContain("prs: []");
    expect(review).toContain("data-aw10-pr-post-save-only");
    expect(review).toContain("refreshAndReadActiveWorkoutPersonalRecords");
    expect(review).toContain('recordState === "pending" || localizedRecords.length');
    expect(records).toContain("readWorkoutHistoryPersonalRecordSessions");
    expect(records).toContain("projected.eventsBySessionId[sessionId]");
    expect(records).toContain('.select("id,status,deleted_at")');
    expect(records).not.toContain("readPersonalRecordsMain");
    expect(records).not.toContain('.from("personal_records")');
    expect(records).not.toContain("limit: 50");
    expect(records).not.toContain(".slice(0, 50)");
  });

  it("keeps completion canonical and restores final muscle analysis", () => {
    expect(core).toContain("terminal.finalProjection?.performedLogs");
    expect(review).toContain("data-aw7-final-muscle-load");
    expect(review).toContain("/workout-history/${encodeURIComponent(sessionId)}");
    expect(review).toContain('tr("completion.viewDetails")');
  });

  it("fails explicit non-Strength execution closed", () => {
    expect(core).toContain("resolveActiveWorkoutExecutionCapability");
    expect(core).toContain("data-aw10-unsupported-execution");
    expect(core).toContain("if (!executionCapability.supported)");
  });
});
