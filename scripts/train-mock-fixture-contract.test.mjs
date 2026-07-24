import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contract = JSON.parse(await readFile(new URL("../lib/fixtures/train-mock-contract.json", import.meta.url), "utf8"));
const mockSource = await readFile(new URL("../lib/fixtures/train-mock.ts", import.meta.url), "utf8");
const qaSource = await readFile(new URL("./run-train-layout-qa.mjs", import.meta.url), "utf8");
const componentSource = await readFile(new URL("../components/workouts/workout-day-focus-session.tsx", import.meta.url), "utf8");

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
