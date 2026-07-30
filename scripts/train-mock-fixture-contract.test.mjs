import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL(
  "../lib/fixtures/train-mock-contract.json",
  import.meta.url,
);
const contract = JSON.parse(await readFile(contractUrl, "utf8"));
const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const mockSource = await readFile(
  new URL("../lib/fixtures/train-mock.ts", import.meta.url),
  "utf8",
);
const entrySource = await readFile(
  new URL("./run-train-layout-qa.mjs", import.meta.url),
  "utf8",
);
const baseSource = await readFile(
  new URL("./run-train-layout-qa-base.mjs", import.meta.url),
  "utf8",
);
const correctionRunnerSource = await readFile(
  new URL("./run-aw5-correction-layout-qa.mjs", import.meta.url),
  "utf8",
);
const correctionSharedSource = await readFile(
  new URL("./aw5-correction-qa-shared.mjs", import.meta.url),
  "utf8",
);
const correctionFixtureSource = await readFile(
  new URL("./train-layout-qa-fixture.mjs", import.meta.url),
  "utf8",
);
const correctionDiagnosticsSource = await readFile(
  new URL("./aw5-correction-qa-diagnostics.mjs", import.meta.url),
  "utf8",
);
const correctionSource = [
  correctionRunnerSource,
  correctionSharedSource,
  correctionFixtureSource,
  correctionDiagnosticsSource,
].join("\n");
const workflowSource = (
  await Promise.all(
    [
      "../.github/workflows/pr-quality.yml",
      "../.github/workflows/quality.yml",
    ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  )
).join("\n");
const qaSource = [entrySource, baseSource, correctionSource].join("\n");
const componentSource = (
  await Promise.all(
    [
      "../components/workouts/active-workout/active-workout-core-session.tsx",
      "../components/workouts/active-workout/active-workout-execution-shell.tsx",
      "../components/workouts/active-workout/active-workout-review-bridge.tsx",
    ].map((file) => readFile(new URL(file, import.meta.url), "utf8")),
  )
).join("\n");

async function fileIsMissing(relativePath) {
  try {
    await access(new URL(relativePath, import.meta.url));
    return false;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

test("qa:train keeps one entrypoint, the established base matrix, and one AW-5 correction owner", async () => {
  assert.equal(
    packageJson.scripts["qa:train"],
    "node scripts/run-train-layout-qa.mjs",
  );
  assert.match(entrySource, /import\("\.\/run-train-layout-qa-base\.mjs"\)/);
  assert.match(
    entrySource,
    /import\("\.\/run-aw5-correction-layout-qa\.mjs"\)/,
  );
  assert.doesNotMatch(entrySource, /run-aw5-correction-layout-qa-v2/);
  assert.equal(
    await fileIsMissing("./run-aw5-correction-layout-qa-v2.mjs"),
    true,
  );
});

test("Train mock and rendered QA share one stable persisted-set identity contract", () => {
  assert.match(contract.activeDayId, /^[0-9a-f-]{36}$/);
  assert.equal(contract.activeFirstExerciseId, contract.activeDayId);
  assert.ok(contract.activeFirstExerciseName.trim().length > 0);
  assert.match(contract.activeSessionId, /^[0-9a-f-]{36}$/);
  assert.match(contract.activeExerciseLogId, /^[0-9a-f-]{36}$/);
  assert.match(mockSource, /train-mock-contract\.json/);
  assert.match(qaSource, /train-mock-contract\.json/);
  assert.match(
    qaSource,
    /plan_exercise_id: trainMockContract\.activeFirstExerciseId/,
  );
  assert.match(
    qaSource,
    /exercise_name: trainMockContract\.activeFirstExerciseName/,
  );
  assert.doesNotMatch(
    qaSource,
    /plan_exercise_id: "10000000-0000-4000-8000-000000000021"/,
  );
});

test("AW-3B rendered QA proves hydration before asserting autosave", () => {
  assert.match(componentSource, /data-active-set-state/);
  assert.match(componentSource, /data-active-set-persisted/);
  assert.match(componentSource, /data-active-set-completed/);
  assert.match(componentSource, /data-active-set-has-details/);
  assert.match(qaSource, /AW-3B autosave fixture hydration failed/);
  assert.match(qaSource, /const autosaveSmoke = await openScenario/);
  assert.match(qaSource, /hydrationPrecondition\?\.passed/);
});

test("AW-4 rendered QA hydrates the complete official session-store projection", () => {
  assert.match(qaSource, /const sessionRoot = directSession/);
  assert.match(qaSource, /const hasOpenSession = scenario === "active"/);
  assert.match(
    qaSource,
    /hasOpenSession\s*\?\s*\(wantsObject \? sessionRoot : \[sessionRoot\]\)\s*:\s*\[\]/,
  );
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshots/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshot_items/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_prescription_sets/);
  assert.match(
    qaSource,
    /\/rest\/v1\/workout_session_prescription_metric_targets/,
  );
  assert.match(qaSource, /\/rest\/v1\/workout_performance_metric_definitions/);
});

test("AW-5 correction harness uses the canonical session identity and no per-context generator", () => {
  assert.match(correctionSource, /const sessionId = contract\.activeSessionId/);
  assert.match(correctionSource, /activeSessionId: contract\.activeSessionId/);
  assert.match(
    correctionSource,
    /activeExerciseLogId: contract\.activeExerciseLogId/,
  );
  assert.doesNotMatch(correctionSource, /function nextId/);
  assert.doesNotMatch(correctionSource, /const sessionId = nextId/);
  assert.match(correctionSource, /workout_session_id: sessionId/);
  assert.match(correctionSource, /user_id: contract\.userId/);
});

test("AW-5 correction harness records bootstrap evidence before process failure", () => {
  for (const token of [
    "currentUrl",
    "documentTitle",
    "bodyText",
    "visibleHeadings",
    "loadingState",
    "errorState",
    "toastText",
    "executionShell",
    "activeSetState",
    "pageErrors",
    "consoleErrors",
    "consoleWarnings",
    "requestFailures",
    "requestHistory",
  ]) {
    assert.match(correctionSource, new RegExp(token));
  }
  assert.match(correctionSource, /\[AW5-QA\] START/);
  assert.match(correctionSource, /\[AW5-QA\] PASS/);
  assert.match(correctionSource, /\[AW5-QA\] FAIL/);
  assert.match(correctionSource, /await writeReport\(\)/);
  assert.match(correctionSource, /finally \{/);
  assert.match(correctionSource, /context\?\.close\(\)/);
  assert.match(correctionSource, /browser\?\.close\(\)/);
  assert.match(correctionSource, /process\.exitCode = 1/);
});

test("AW-5 correction QA covers real interaction states and required geometry", () => {
  for (const state of [
    "plan-day-set-entry-en-320x568",
    "plan-day-set-entry-en-390x844",
    "direct-set-entry-en-390x844",
    "direct-set-entry-en-1440x900",
    "plan-day-set-entry-de-390x844",
    "plan-day-set-entry-ar-390x844",
    "plan-day-set-entry-dark-en-1440x900",
    "plan-day-validation-error-en-390x844",
    "plan-day-busy-en-390x844",
    "plan-day-rest-en-390x844",
    "plan-day-rest-en-320x568",
    "plan-day-rest-en-1440x900",
    "plan-day-paused-en-390x844",
    "plan-day-details-ar-390x844",
    "plan-day-details-dark-en-1440x900",
    "plan-day-session-review-en-390x844",
    "plan-day-session-review-en-1440x900",
    "plan-day-partial-review-en-390x844",
    "plan-day-completed-summary-en-320x568",
    "plan-day-completed-summary-en-390x844",
    "plan-day-completed-summary-en-1440x900",
    "plan-day-keyboard-${keyboard}-en-390x844",
  ]) {
    assert.match(
      correctionSource,
      new RegExp(state.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  for (const selector of [
    "data-workout-session-close",
    "data-aw5-mini-heat-map-slot",
    "data-aw5-session-title",
    "data-aw5-metadata",
    "data-aw5-pause-resume",
    "data-aw5-sticky-actions",
    "data-aw5-set-path",
    "data-aw5-rest-presets",
    "data-aw5-feedback",
    "data-aw5-completed-summary",
  ]) {
    assert.match(componentSource + correctionSource, new RegExp(selector));
  }
  assert.match(
    correctionSource,
    /validation error advanced the canonical cursor/,
  );
  assert.match(correctionSource, /aria-busy/);
  assert.match(correctionSource, /data-aw5-session-state=\\?"rest/);
  assert.match(correctionSource, /data-aw5-session-state=\\?"paused/);
  assert.match(correctionSource, /save\.\*finish/);
  assert.match(
    correctionSource,
    /session CTA leaves an unnecessary mobile-navigation gap/,
  );
  assert.match(
    correctionSource,
    /focused .* input cannot be scrolled above the sticky CTA/,
  );
  assert.match(correctionSource, /framework overlay detected/);
  assert.match(correctionSource, /aw5-correction-layout-qa-results\.json/);
});

test("AW-5 geometry enforcement is unconditional and self-consistent", () => {
  assert.match(correctionDiagnosticsSource, /metrics\.restPresets\.forEach/);
  assert.doesNotMatch(correctionDiagnosticsSource, /options\.restPresets/);
  assert.match(correctionDiagnosticsSource, /depth > 1/);
  assert.match(correctionDiagnosticsSource, /toFixed\(2\).*px/);
  assert.match(correctionSharedSource, /consistencyFailures/);
  assert.match(correctionSharedSource, /unreported intersection/);
  assert.match(correctionSharedSource, /interactiveControls/);
});

test("AW-5 completion fixture owns one mutable authoritative root without page hacks", () => {
  assert.match(correctionFixtureSource, /let root = \{/);
  assert.match(correctionFixtureSource, /root = \{[\s\S]*status: "completed"/);
  assert.match(
    correctionFixtureSource,
    /duration_minutes: payload\?\.p_duration_minutes/,
  );
  assert.doesNotMatch(
    correctionRunnerSource,
    /page\.route\([\s\S]*workout_sessions/,
  );
  assert.doesNotMatch(
    correctionRunnerSource,
    /localStorage\.setItem\("plaivra\.qa\.train-scenario",\s*"rest"\)/,
  );
});

test("AW-5 rendered sign-off uses production build and start metadata", () => {
  assert.doesNotMatch(workflowSource, /npm run dev/);
  assert.match(
    workflowSource,
    /NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build/,
  );
  assert.match(workflowSource, /npm run start/);
  assert.match(
    workflowSource,
    /pr-quality-rendered-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
  for (const token of [
    "serverMode",
    "buildCommand",
    "startCommand",
    "mockAuthBuildValue",
    "headSha",
    "workflowRunId",
  ]) {
    assert.match(correctionSharedSource, new RegExp(token));
  }
  assert.doesNotMatch(
    correctionRunnerSource,
    /clearKnownNextDevelopmentPortal/,
  );
  assert.doesNotMatch(
    correctionRunnerSource,
    /expectedDevelopmentConsoleError/,
  );
});

test("AW-5 rendered QA counts the contextual Add 30 control without last-match masking", () => {
  assert.match(componentSource, /data-aw5-add-thirty/);
  assert.match(correctionRunnerSource, /visible Add 30 control count/);
  assert.doesNotMatch(
    correctionRunnerSource,
    /getByRole\("button", \{ name: \/30\/ \}\)\.last\(\)/,
  );
});
