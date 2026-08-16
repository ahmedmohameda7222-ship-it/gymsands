import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../lib/fixtures/train-mock-contract.json", import.meta.url);
const contract = JSON.parse(await readFile(contractUrl, "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const mockSource = await readFile(new URL("../lib/fixtures/train-mock.ts", import.meta.url), "utf8");
const entrySource = await readFile(new URL("./run-train-layout-qa.mjs", import.meta.url), "utf8");
const baseSource = await readFile(new URL("./run-train-layout-qa-base.mjs", import.meta.url), "utf8");
const redesignRunner = await readFile(new URL("./run-aw5-correction-layout-qa.mjs", import.meta.url), "utf8");
const sharedSource = await readFile(new URL("./aw5-correction-qa-shared.mjs", import.meta.url), "utf8");
const fixtureSource = await readFile(new URL("./train-layout-qa-fixture.mjs", import.meta.url), "utf8");
const workflowSource = (
  await Promise.all([
    "../.github/workflows/pr-quality.yml",
    "../.github/workflows/quality.yml",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")))
).join("\n");
const qaSource = [entrySource, baseSource, redesignRunner, sharedSource, fixtureSource].join("\n");
const componentSource = (
  await Promise.all([
    "../components/workouts/active-workout/active-workout-core-session.tsx",
    "../components/workouts/active-workout/active-workout-execution-shell.tsx",
    "../components/workouts/active-workout/active-workout-review-bridge.tsx",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")))
).join("\n");

async function fileIsMissing(relativePath) {
  try {
    await access(new URL(relativePath, import.meta.url));
    return false;
  } catch (error) {
    return error?.code === "ENOENT";
  }
}

test("qa:train keeps one entrypoint, the established base matrix, and one redesign owner", async () => {
  assert.equal(packageJson.scripts["qa:train"], "node scripts/run-train-layout-qa.mjs");
  assert.match(entrySource, /import\("\.\/run-train-layout-qa-base\.mjs"\)/);
  assert.match(entrySource, /import\("\.\/run-aw5-correction-layout-qa\.mjs"\)/);
  assert.equal(await fileIsMissing("./run-aw5-correction-layout-qa-v2.mjs"), true);
});

test("Train mock and rendered QA share one stable persisted-set identity contract", () => {
  assert.match(contract.activeDayId, /^[0-9a-f-]{36}$/);
  assert.equal(contract.activeFirstExerciseId, contract.activeDayId);
  assert.ok(contract.activeFirstExerciseName.trim().length > 0);
  assert.match(contract.activeSessionId, /^[0-9a-f-]{36}$/);
  assert.match(contract.activeExerciseLogId, /^[0-9a-f-]{36}$/);
  assert.match(mockSource, /train-mock-contract\.json/);
  assert.match(qaSource, /train-mock-contract\.json/);
  assert.doesNotMatch(qaSource, /function nextId/);
});

test("established Train base still proves hydration and canonical session-store projection", () => {
  assert.match(componentSource, /data-active-set-state/);
  assert.match(componentSource, /data-active-set-persisted/);
  assert.match(componentSource, /data-active-set-completed/);
  assert.match(componentSource, /data-active-set-has-details/);
  assert.match(baseSource, /hydrationPrecondition/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshots/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshot_items/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_prescription_sets/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_prescription_metric_targets/);
  assert.match(qaSource, /\/rest\/v1\/workout_performance_metric_definitions/);
});

test("rendered fixture isolates verified-record refresh and preserves one mutable authoritative root", () => {
  assert.match(fixtureSource, /fulfilled:verified-records/);
  assert.match(fixtureSource, /aw5-empty-verified-records/);
  assert.match(fixtureSource, /const sessionId = contract\.activeSessionId/);
  assert.match(fixtureSource, /let root = \{/);
  assert.match(fixtureSource, /status: "completed"/);
  assert.match(fixtureSource, /duration_minutes: payload\?\.p_duration_minutes/);
  assert.match(fixtureSource, /workout_session_id: sessionId/);
  assert.match(fixtureSource, /user_id: contract\.userId/);
});

test("final redesign runner is exact-head production QA with screenshot evidence", () => {
  assert.match(redesignRunner, /QA_HEAD_SHA is required for exact-head Active Workout evidence/);
  assert.match(redesignRunner, /requires production mode/);
  assert.match(redesignRunner, /active-workout-redesign-evidence\.json/);
  assert.match(redesignRunner, /page\.screenshot/);
  assert.match(redesignRunner, /await writeReport\(\)/);
  assert.match(redesignRunner, /throw new Error\(`Active Workout redesign rendered QA failed/);
  assert.match(redesignRunner, /finally \{\s*await browser\.close\(\)/);
});

test("final redesign runner covers the binding viewport, locale, theme, accessibility, and state matrix", () => {
  for (const token of [
    "390x844",
    "393x852",
    "430x932",
    "768x1024",
    "1024x768",
    "1280x800",
    "1440x900",
    "1728x1000",
    "320x568",
    '"en"',
    '"de"',
    '"ar"',
    '"dark"',
    'reducedMotion: "reduce"',
    'document.documentElement.style.fontSize = "200%"',
    "plan-day-session-menu",
    "plan-day-details",
    "plan-day-set-details",
    "plan-day-exercise-actions",
    "plan-day-previous-performance",
    "plan-day-previous-failure",
    "plan-day-rest",
    "plan-day-paused",
    "plan-day-session-review",
    "plan-day-completed-summary",
    "plan-day-keyboard-reps",
    "plan-day-unsupported-nonstrength",
  ]) assert.ok(redesignRunner.includes(token), `missing final rendered-QA token: ${token}`);
});

test("final redesign runner validates the binding interaction hierarchy and fail-soft secondary reads", () => {
  for (const token of [
    "data-aw10-session-menu",
    "data-aw10-exercise-details-trigger",
    "data-aw10-exercise-actions",
    "data-active-set-details-trigger",
    "data-aw10-set-details-exact",
    "data-aw10-previous-performance",
    "data-aw10-rest-state",
    "data-aw10-paused-state",
    "data-aw7-review-surface",
    "data-aw10-pr-post-save-only",
    "data-aw7-final-muscle-load",
    "data-aw10-unsupported-execution",
    "Previous Performance failure blocked execution",
    "Personal Records failure invalidated completion",
    "does not use Ask ChatGPT member-facing branding",
    "Set Details contains an unrelated button/action",
  ]) assert.ok(redesignRunner.includes(token), `missing final interaction assertion: ${token}`);
  assert.match(redesignRunner, /response: 503|status: 503/);
  assert.match(redesignRunner, /metric_key: "distance_meters"/);
  assert.match(redesignRunner, /assertNoHorizontalOverflow/);
});

test("final redesign runner proves one Rest control group and dominant CTA without selector masking", () => {
  assert.match(componentSource, /data-aw5-rest-presets/);
  assert.match(componentSource, /onClick=\{onAddThirtySeconds\}/);
  assert.match(redesignRunner, /Rest does not expose \+30 seconds and required presets/);
  assert.match(redesignRunner, /dominant primary action is not visible/);
  assert.doesNotMatch(redesignRunner, /getByRole\([^\n]+\)\.last\(\).*30/);
});

test("rendered sign-off uses production build/start and exact-head CI artifact metadata", () => {
  assert.doesNotMatch(workflowSource, /npm run dev/);
  assert.match(workflowSource, /NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build/);
  assert.match(workflowSource, /npm run start/);
  assert.match(workflowSource, /pr-quality-rendered-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  for (const token of ["serverMode", "buildCommand", "startCommand", "mockAuthBuildValue", "headSha", "workflowRunId"]) {
    assert.match(sharedSource, new RegExp(token));
  }
});