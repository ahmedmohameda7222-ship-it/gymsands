import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractUrl = new URL("../lib/fixtures/train-mock-contract.json", import.meta.url);
const contract = JSON.parse(await readFile(contractUrl, "utf8"));
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const mockSource = await readFile(new URL("../lib/fixtures/train-mock.ts", import.meta.url), "utf8");
const entrySource = await readFile(new URL("./run-train-layout-qa.mjs", import.meta.url), "utf8");
const baseSource = await readFile(new URL("./run-train-layout-qa-base.mjs", import.meta.url), "utf8");
const fixtureSource = await readFile(new URL("./train-layout-qa-fixture.mjs", import.meta.url), "utf8");
const workflowSource = (
  await Promise.all([
    "../.github/workflows/pr-quality.yml",
    "../.github/workflows/quality.yml",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")))
).join("\n");
const qaSource = [entrySource, baseSource, fixtureSource].join("\n");
const componentSource = (
  await Promise.all([
    "../components/workouts/active-workout/active-workout-core-session.tsx",
    "../components/workouts/active-workout/active-workout-execution-shell.tsx",
    "../components/workouts/active-workout/active-workout-review-bridge.tsx",
  ].map((file) => readFile(new URL(file, import.meta.url), "utf8")))
).join("\n");

test("qa:train has one current canonical entrypoint", () => {
  assert.equal(packageJson.scripts["qa:train"], "node scripts/run-train-layout-qa.mjs");
  assert.match(entrySource, /import\("\.\/run-train-layout-qa-base\.mjs"\)/);
  assert.doesNotMatch(entrySource, /aw5|aw6|aw7|correction/i);
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

test("current Train base proves hydration and canonical session-store projection", () => {
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
  assert.match(fixtureSource, /const sessionId = contract\.activeSessionId/);
  assert.match(fixtureSource, /let root = \{/);
  assert.match(fixtureSource, /status: "completed"/);
  assert.match(fixtureSource, /duration_minutes: payload\?\.p_duration_minutes/);
  assert.match(fixtureSource, /workout_session_id: sessionId/);
  assert.match(fixtureSource, /user_id: contract\.userId/);
});

test("rendered sign-off uses production build and start", () => {
  assert.doesNotMatch(workflowSource, /npm run dev/);
  assert.match(workflowSource, /NEXT_PUBLIC_USE_MOCK_AUTH=true NEXT_PUBLIC_PLAIVRA_PRODUCTION_QA=true npm run build/);
  assert.match(workflowSource, /npm run start/);
  assert.match(workflowSource, /npm run qa:train/);
});
