import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(await readFile(new URL("../lib/fixtures/train-mock-contract.json", import.meta.url), "utf8"));
const mockSource = await readFile(new URL("../lib/fixtures/train-mock.ts", import.meta.url), "utf8");
const qaSource = (
  await Promise.all([
    "./run-train-layout-qa.mjs",
    "./run-train-layout-qa-base.mjs",
    "./run-aw5-correction-layout-qa.mjs"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")))
).join("\n");
const componentSource = (
  await Promise.all([
    "../components/workouts/active-workout/active-workout-core-session.tsx",
    "../components/workouts/active-workout/active-workout-execution-shell.tsx",
    "../components/workouts/active-workout/active-workout-review-bridge.tsx"
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")))
).join("\n");

test("Train mock and rendered QA share one stable persisted-set identity contract", () => {
  assert.match(contract.activeDayId, /^[0-9a-f-]{36}$/);
  assert.equal(contract.activeFirstExerciseId, contract.activeDayId);
  assert.ok(contract.activeFirstExerciseName.trim().length > 0);
  assert.match(mockSource, /train-mock-contract\.json/);
  assert.match(qaSource, /train-mock-contract\.json/);
  assert.match(qaSource, /plan_exercise_id: trainMockContract\.activeFirstExerciseId/);
  assert.match(qaSource, /exercise_name: trainMockContract\.activeFirstExerciseName/);
  assert.doesNotMatch(qaSource, /plan_exercise_id: "10000000-0000-4000-8000-000000000021"/);
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
  assert.match(qaSource, /body: JSON\.stringify\(wantsObject \? sessionRoot : \[sessionRoot\]\)/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshots/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_muscle_snapshot_items/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_prescription_sets/);
  assert.match(qaSource, /\/rest\/v1\/workout_session_prescription_metric_targets/);
  assert.match(qaSource, /\/rest\/v1\/workout_performance_metric_definitions/);
});

test("AW-5 correction QA covers deterministic states, clean production chrome, and geometry", () => {
  for (const state of [
    "plan-day-set-entry-en-320x568",
    "plan-day-set-entry-en-390x844",
    "plan-day-rest-en-390x844",
    "plan-day-paused-en-390x844",
    "plan-day-busy-en-390x844",
    "plan-day-validation-error-en-390x844",
    "direct-set-entry-en-390x844",
    "direct-set-entry-en-1440x900",
    "plan-day-details-ar-390x844",
    "plan-day-details-dark-en-1440x900",
    "plan-day-session-review-en-1440x900",
    "plan-day-completed-summary-en-1440x900"
  ]) {
    assert.match(qaSource, new RegExp(state));
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
    "data-aw5-completed-summary"
  ]) {
    assert.match(componentSource + qaSource, new RegExp(selector));
  }
  assert.match(qaSource, /framework overlay detected/);
  assert.match(qaSource, /session CTA leaves an unnecessary mobile-navigation gap/);
  assert.match(qaSource, /focused .* input cannot be scrolled above the sticky CTA/);
  assert.match(qaSource, /aw5-correction-layout-qa-results\.json/);
});
