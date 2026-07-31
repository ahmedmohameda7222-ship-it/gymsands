const { readFileSync, writeFileSync, mkdirSync } = require('node:fs');

function replaceOnce(path, before, after) {
  const source = readFileSync(path, 'utf8');
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one replacement target`);
  }
  writeFileSync(path, source.replace(before, after), 'utf8');
}

const fixturePath = 'scripts/train-layout-qa-fixture.mjs';
replaceOnce(
  fixturePath,
  `  };
  let muscleRequestCount = 0;`,
  `  };
  let performedLogs = [];
  let muscleRequestCount = 0;`,
);
replaceOnce(
  fixturePath,
  `    if (method === "GET" && (
      pathname.includes("/rest/v1/workout_session_prescription_metric_targets")
      || pathname.includes("/rest/v1/workout_performance_metric_definitions")
      || pathname.includes("/rest/v1/exercise_logs")
      || pathname.includes("/rest/v1/user_exercise_alternatives")`,
  `    if (method === "GET" && pathname.includes("/rest/v1/exercise_logs")) {
      return respond(performedLogs, 200, {
        "content-range": performedLogs.length
          ? "0-" + (performedLogs.length - 1) + "/" + performedLogs.length
          : "*/0"
      });
    }
    if (method === "GET" && (
      pathname.includes("/rest/v1/workout_session_prescription_metric_targets")
      || pathname.includes("/rest/v1/workout_performance_metric_definitions")
      || pathname.includes("/rest/v1/user_exercise_alternatives")`,
);

const mergeBody = `      const incoming = Array.isArray(payload?.p_logs) ? payload.p_logs : [];
      for (const log of incoming) {
        const exerciseIdentity = log.plan_exercise_id
          ?? String(log.exercise_order ?? "none") + ":" + String(log.exercise_name ?? "").trim().toLowerCase();
        const identity = exerciseIdentity + ":set:" + log.set_number;
        const row = {
          id: log.id
            ?? "25000000-0000-4000-8000-" + String(log.set_number ?? 0).padStart(12, "0"),
          workout_session_id: sessionId,
          user_id: contract.userId,
          plan_exercise_id: log.plan_exercise_id ?? null,
          exercise_order: log.exercise_order ?? null,
          exercise_name: log.exercise_name,
          exercise_category: log.exercise_category ?? null,
          planned_sets: log.planned_sets ?? null,
          planned_reps: log.planned_reps ?? null,
          planned_rest_seconds: log.planned_rest_seconds ?? null,
          set_number: log.set_number,
          reps: log.reps ?? null,
          weight_kg: log.weight_kg ?? null,
          notes: log.notes ?? null,
          completed_at: log.completed_at ?? null,
          set_details: log.set_details ?? null,
          performance_metrics: log.performance_metrics ?? [],
          segments: log.segments ?? []
        };
        const index = performedLogs.findIndex((existing) => {
          const existingExercise = existing.plan_exercise_id
            ?? String(existing.exercise_order ?? "none") + ":" + String(existing.exercise_name ?? "").trim().toLowerCase();
          return existingExercise + ":set:" + existing.set_number === identity;
        });
        if (index >= 0) performedLogs[index] = row;
        else performedLogs.push(row);
      }`;

replaceOnce(
  fixturePath,
  `    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {
      if (delayCanonical) await delayedCanonical.promise;
      const payload = request.postDataJSON();
      await respond({ saved: payload?.p_logs?.length ?? 1, deleted: 0 });
      canonicalFinished.resolve();
      return;
    }`,
  `    if (method === "POST" && pathname.includes("/rest/v1/rpc/upsert_workout_set_logs_atomic")) {
      if (delayCanonical) await delayedCanonical.promise;
      const payload = request.postDataJSON();
${mergeBody}
      await respond({ saved: incoming.length, deleted: 0 });
      canonicalFinished.resolve();
      return;
    }`,
);

const finalMergeBody = mergeBody
  .replace('const incoming = Array.isArray(payload?.p_logs) ? payload.p_logs : [];',
    'const incoming = Array.isArray(payload?.p_final_logs) ? payload.p_final_logs : [];');
replaceOnce(
  fixturePath,
  `    if (method === "POST" && pathname.includes("/rest/v1/rpc/complete_workout_session_atomic")) {
      const payload = request.postDataJSON();
      root = {`,
  `    if (method === "POST" && pathname.includes("/rest/v1/rpc/complete_workout_session_atomic")) {
      const payload = request.postDataJSON();
${finalMergeBody}
      root = {`,
);
replaceOnce(
  fixturePath,
  `  return {
    sessionId,
    muscleRequestCount: () => muscleRequestCount,`,
  `  return {
    sessionId,
    setServerRootStatus(status) {
      root = {
        ...root,
        status,
        completed_at: status === "completed"
          ? root.completed_at ?? "2026-07-27T09:00:00.000Z"
          : null
      };
    },
    performedLogsSnapshot: () => JSON.parse(JSON.stringify(performedLogs)),
    muscleRequestCount: () => muscleRequestCount,`,
);

const workflowPath = '.github/workflows/pr-quality.yml';
replaceOnce(
  workflowPath,
  `  ui:
    name: ui-and-i18n
    needs: classify
    if: needs.classify.outputs.ui == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 45`,
  `  ui:
    name: ui-and-i18n
    needs: classify
    if: needs.classify.outputs.ui == 'true'
    runs-on: ubuntu-latest
    timeout-minutes: 60`,
);
replaceOnce(
  workflowPath,
  `          QA_SERVER_MODE=production QA_BUILD_COMMAND="NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build" QA_START_COMMAND="npm run start" QA_MOCK_AUTH_BUILD_VALUE=true QA_HEAD_SHA="\${{ github.event.pull_request.head.sha }}" QA_WORKFLOW_RUN_ID="$GITHUB_RUN_ID" QA_BASE_URL=http://localhost:3000 QA_TRAIN_EVIDENCE_DIR=ci-reports/train-qa-evidence npm run qa:train'`,
  `          QA_SERVER_MODE=production QA_BUILD_COMMAND="NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build" QA_START_COMMAND="npm run start" QA_MOCK_AUTH_BUILD_VALUE=true QA_HEAD_SHA="\${{ github.event.pull_request.head.sha }}" QA_WORKFLOW_RUN_ID="$GITHUB_RUN_ID" QA_BASE_URL=http://localhost:3000 QA_TRAIN_EVIDENCE_DIR=ci-reports/train-qa-evidence npm run qa:train;
          QA_SERVER_MODE=production QA_BUILD_COMMAND="NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build" QA_START_COMMAND="npm run start" QA_MOCK_AUTH_BUILD_VALUE=true QA_HEAD_SHA="\${{ github.event.pull_request.head.sha }}" QA_WORKFLOW_RUN_ID="$GITHUB_RUN_ID" QA_BASE_URL=http://localhost:3000 QA_AW10_EVIDENCE_DIR=ci-reports/active-workout-aw10-evidence npm run qa:active-workout:aw10'`,
);
replaceOnce(
  workflowPath,
  `            ci-reports/rendered-qa-evidence/
            ci-reports/train-qa-evidence/`,
  `            ci-reports/rendered-qa-evidence/
            ci-reports/train-qa-evidence/
            ci-reports/active-workout-aw10-evidence/`,
);

const packagePath = 'package.json';
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));
const suite = 'test:active-workout:aw8-aw10';
const testPath = 'lib/product/active-workout-aw10-closure.test.ts';
if (!packageJson.scripts?.[suite]) throw new Error(`Missing ${suite}.`);
if (!packageJson.scripts[suite].includes(testPath)) {
  packageJson.scripts[suite] += ` ${testPath}`;
}
writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, 'utf8');

mkdirSync('lib/product', { recursive: true });
writeFileSync(testPath, `import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const runner = readFileSync("scripts/run-aw10-active-workout-closure-qa.mjs", "utf8");
const fixture = readFileSync("scripts/train-layout-qa-fixture.mjs", "utf8");
const workflow = readFileSync(".github/workflows/pr-quality.yml", "utf8");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));

describe("AW-10 canonical Active Workout closure", () => {
  it("defines exactly thirty production exact-head scenarios", () => {
    expect(runner.match(/^\\s*\\["\\d{2}-/gm)).toHaveLength(30);
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
    expect(runner).toContain("indexedDB.open(\\\"plaivra-active-workout-v1\\\", 1)");
    expect(runner).toContain("mutateFirstOperation");
    expect(runner).toContain("mutateCachedController");
    expect(runner).toContain("fixture.setServerRootStatus(\\\"completed\\\")");
    expect(fixture).toContain("let performedLogs = []");
    expect(fixture).toContain("performedLogsSnapshot");
    expect(fixture).toContain("setServerRootStatus(status)");
  });

  it("runs once in canonical PR Quality and uploads the same evidence artifact", () => {
    expect(workflow.match(/npm run qa:active-workout:aw10/g)).toHaveLength(1);
    expect(workflow.match(/ci-reports\\/active-workout-aw10-evidence\\//g)).toHaveLength(2);
    expect(workflow).toContain("QA_AW10_EVIDENCE_DIR=ci-reports/active-workout-aw10-evidence");
    expect(packageJson.scripts["qa:active-workout:aw10"]).toBe(
      "node scripts/run-aw10-active-workout-closure-qa.mjs",
    );
  });
});
`, 'utf8');