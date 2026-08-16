import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  REQUIRED_CANONICAL_FILES,
  REQUIRED_QUALITY_GATES,
} from "./quality-evidence-contract.mjs";

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const prQuality = readFileSync(".github/workflows/pr-quality.yml", "utf8");
const quality = readFileSync(".github/workflows/quality.yml", "utf8");

test("dedicated Workout History commands remain explicit", () => {
  for (const command of [
    "test:workout-history",
    "test:workout-history:integration",
    "qa:workout-history",
    "measure:workout-history",
  ]) {
    assert.equal(typeof packageJson.scripts[command], "string", command);
  }
  assert.match(
    packageJson.scripts["qa:workout-history"],
    /run-workout-history-qa\.mjs/u,
  );
  assert.match(
    packageJson.scripts["measure:workout-history"],
    /measure-workout-history-performance\.mjs/u,
  );
});

test("PR Quality retains existing QA and adds focused History evidence", () => {
  assert.match(prQuality, /npm run qa:rendered/u);
  assert.match(prQuality, /npm run qa:train/u);
  assert.match(
    prQuality,
    /node scripts\/run-aw10-active-workout-closure-qa-entry\.mjs/u,
  );
  assert.match(prQuality, /npm run qa:workout-history/u);
  assert.match(prQuality, /workout-history-qa-evidence\//u);
  assert.match(prQuality, /npm run test:workout-history:integration/u);
  assert.match(prQuality, /node scripts\/run-database-verification\.mjs/u);
});

test("canonical Quality records History tests, database, performance, render inspection, and acceptance", () => {
  assert.equal(
    REQUIRED_QUALITY_GATES.workoutHistoryTests,
    "workout-history-tests",
  );
  assert.equal(
    REQUIRED_QUALITY_GATES.workoutHistoryIntegration,
    "workout-history-integration",
  );
  assert.equal(
    REQUIRED_QUALITY_GATES.workoutHistoryPerformance,
    "workout-history-performance",
  );
  assert.equal(
    REQUIRED_CANONICAL_FILES.includes(
      "workout-history-performance/report.json",
    ),
    true,
  );
  assert.equal(
    REQUIRED_CANONICAL_FILES.includes(
      "workout-history-qa-evidence/workout-history-qa-results.json",
    ),
    true,
  );
  for (const command of [
    "npm run test:workout-history",
    "npm run test:workout-history:integration",
    "npm run measure:workout-history",
    "npm run qa:workout-history",
  ]) {
    assert.match(quality, new RegExp(command.replaceAll(":", "\\:")));
  }
  assert.match(quality, /quality-reports\/workout-history-integration\.log/u);
});
