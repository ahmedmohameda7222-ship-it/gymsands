import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("scripts/run-aw10-active-workout-closure-qa.mjs", "utf8");
const entry = readFileSync("scripts/run-aw10-active-workout-closure-qa-entry.mjs", "utf8");
const fullAuthorityRunner = readFileSync("scripts/run-active-workout-full-authority-qa.mjs", "utf8");
const fixture = readFileSync("scripts/train-layout-qa-fixture.mjs", "utf8");
const workflow = readFileSync(".github/workflows/pr-quality.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const store = readFileSync("lib/workouts/active-session-store/store-core.ts", "utf8");
const coordinator = readFileSync("lib/workouts/active-session-sync/coordinator.ts", "utf8");

describe("AW-10 canonical Active Workout closure", () => {
  it("defines exactly thirty production exact-head scenarios", () => {
    expect(runner.match(/^\s*\["\d{2}-/gm)).toHaveLength(30);
    expect(runner).toContain("QA_HEAD_SHA is required for exact-head AW-10 evidence");
    expect(runner).toContain("AW-10 requires production server mode");
    for (const required of [
      "320x568", "768x1024", "1440x900", "mobile-ar-rtl", "desktop-en-dark",
      "direct-mobile", "completion-metrics", "offline-refresh", "reconnect-flush",
      "terminal-pending", "server-terminal-wins", "same-tab-explicit-continue",
      "device-conflict-readonly", "takeover-confirmation", "conflict-server", "conflict-local"
    ]) expect(runner).toContain(required);
  });

  it("uses durable fixture authority instead of DOM-only simulation", () => {
    expect(runner).toContain("indexedDB.open(\"plaivra-active-workout-v1\", 2)");
    expect(runner).toContain("set_drafts");
    expect(runner).toContain("mutateFirstOperation");
    expect(runner).toContain("mutateCachedController");
    expect(runner).toContain("fixture.setServerRootStatus(\"completed\")");
    expect(fixture).toContain("let performedLogs = []");
    expect(fixture).toContain("performedLogsSnapshot");
    expect(fixture).toContain("setServerRootStatus(status)");
    expect(fixture).toContain("function persistedExerciseLogRow");
    expect(fixture).toContain("exercise_log_id: exerciseLogId");
    expect(fixture).toContain("workout_session_id: sessionId");
    expect(fixture).toContain("user_id: userId");
    expect(fixture).toContain("segment_id: segmentId");
    expect(fixture).toContain("payload?.p_logs");
    expect(fixture).not.toContain("payload?.p_final_logs");
    expect(fixture).toContain("Those documents have no storage authority");
    expect(runner).toContain(
      'controllerCount: document.querySelectorAll("[data-active-workout-controller]").length',
    );
    expect(runner).toContain('{ name: "Finish anyway", exact: true }');
    expect(runner).toContain('operation.state !== "applied" && operation.state !== "discarded"');
    expect(runner).toContain("waitForNoPendingOperations");
    expect(runner).toContain("stableZeroObservations >= 3");
    expect(runner).toContain('setOffline(page, false, false)');
    expect(store).toContain('if (state !== "online_synced") return;');
    expect(store).toContain('sync.reconcile({ force: true })');
    expect(coordinator).toContain('stale command must not');
    expect(coordinator).toMatch(
      /ActiveSessionRevisionConflictError[\s\S]*lastErrorCode: "revision_conflict_rehydrate"[\s\S]*continue;/,
    );
    expect(coordinator).not.toContain('ifAvailable: true');
    expect(coordinator).toContain('{ mode: "exclusive" }');
    expect(coordinator).toContain('if (remaining.length) return run(force, ownsLane);');
    expect(coordinator).toContain('Both resolution choices must drain companion operations');
    expect(coordinator).toContain('Terminal server authority wins');
    expect(runner).toContain('takeoverButton instanceof HTMLButtonElement && !takeoverButton.disabled');
  });

  it("classifies only aborted Previous Performance enrichment and preserves fail-closed coverage", () => {
    expect(entry).toContain("let underlyingExitCode = 0");
    expect(entry).toContain("underlyingExitCode = Number(process.exitCode ?? 0)");
    expect(entry).toContain("AW-10 underlying runner exited with code");
    expect(entry).toContain("process.exitCode = 0");
    expect(entry).toContain('item.error !== "net::ERR_ABORTED"');
    expect(entry).toContain('url.pathname === "/api/workouts/active/previous-performance"');
    expect(entry).toContain('url.searchParams.has("kind")');
    expect(entry).toContain('url.searchParams.has("identity")');
    expect(entry).toContain("unexpectedRequests.length === 0");
    expect(entry).toContain("report.results.length !== 30");
    expect(entry).toContain("offlineDurability");
    expect(entry).toContain("terminalPending");
    expect(entry).toContain("serverTerminalWins");
    expect(entry).toContain('result.checks?.serverTerminalWins === true');
    expect(entry).toContain("conflictChoices");
    expect(entry).toContain('result.checks?.resolution === "server"');
    expect(entry).toContain('result.checks?.resolution === "local"');
    expect(entry).toContain("throw underlyingFailure");
    expect(entry).not.toContain("if (!originalFailure)");
  });

  it("runs the supplemental full-product authority only after canonical AW-10 closure", () => {
    expect(entry).toContain('await import("./run-active-workout-full-authority-qa.mjs")');
    expect(fullAuthorityRunner).toContain("QA_HEAD_SHA is required for exact-head full Active Workout authority evidence");
    expect(fullAuthorityRunner).toContain("Full Active Workout authority QA requires production mode");
    for (const required of [
      "input-blank-zero-field-validation-390x844",
      "transient-menu-mutual-exclusion-390x844",
      "canonical-exercise-detail-draft-return-390x844",
      "exercise-navigator-canonical-cursor-pause-rest-430x932",
      "replacement-intelligence-reason-aware-390x844",
      "replacement-exercise-detail-identity-390x844",
      "optimistic-complete-network-delay-390x844",
      "optimistic-hard-failure-rollback-auto-dismiss-390x844",
      "natural-rest-expiry-next-context-390x844",
      "long-exercise-title-chevron-mobile-320x568",
      "canonicalSetFailure",
      "performedLogsSnapshot",
      "data-aw5-feedback",
      "data-aw-exercise-navigator",
      "data-aw-replacement-recommendations",
    ]) expect(fullAuthorityRunner).toContain(required);
    expect(fullAuthorityRunner).toContain("active-workout-full-authority-results.json");
    expect(fullAuthorityRunner).toContain("page.screenshot");
    expect(fullAuthorityRunner).toContain("if (failures.length) throw new Error");
  });

  it("keeps the canonical npm runner stable while scoped PR Quality adds strict classification", () => {
    expect(workflow.match(/run-aw10-active-workout-closure-qa-entry\.mjs/g)).toHaveLength(1);
    expect(workflow.match(/npm run qa:active-workout:aw10/g) ?? []).toHaveLength(0);
    expect(workflow.match(/ci-reports\/active-workout-aw10-evidence/g)).toHaveLength(2);
    expect(workflow).toContain(
      "QA_AW10_EVIDENCE_DIR: ci-reports/active-workout-aw10-evidence",
    );
    expect(packageJson.scripts["qa:active-workout:aw10"]).toBe(
      "node scripts/run-aw10-active-workout-closure-qa.mjs",
    );
  });
});
