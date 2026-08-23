import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/pr-quality.yml", import.meta.url);
const workflow = await readFile(workflowUrl, "utf8");

function jobSection(key, nextKey) {
  const start = workflow.indexOf(`\n  ${key}:\n`);
  assert.notEqual(start, -1, `Missing ${key} job.`);
  const end = nextKey ? workflow.indexOf(`\n  ${nextKey}:\n`, start + 1) : workflow.length;
  assert.notEqual(end, -1, `Missing boundary after ${key} job.`);
  return workflow.slice(start, end);
}

function stepSection(job, name) {
  const start = job.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `Missing ${name}.`);
  const next = job.indexOf("\n      - name:", start + 1);
  return job.slice(start, next === -1 ? job.length : next);
}

function occurrences(value, fragment) {
  return value.split(fragment).length - 1;
}

test("PR Quality identity, trigger and concurrency remain stable", () => {
  assert.match(workflow, /^name: PR Quality$/m);
  assert.match(workflow, /^on:\n  pull_request:\n    branches:\n      - main$/m);
  assert.match(workflow, /group: pr-quality-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test("exact PR head checkout and stable job names remain present", () => {
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  for (const name of [
    "scope",
    "integrity",
    "core",
    "database",
    "ui-and-i18n",
    "ci-contracts",
    "build",
    "dependency-audit",
    "required-summary",
  ]) assert.match(workflow, new RegExp(`name: ${name.replaceAll("-", "\\-")}`));
});

test("scope exposes all rendered selector outputs", () => {
  const classify = jobSection("classify", "integrity");
  for (const output of [
    "rendered_general",
    "rendered_train",
    "rendered_active_workout",
    "rendered_workout_history",
  ]) {
    assert.match(classify, new RegExp(`${output}: \\$\\{\\{ steps\\.scope\\.outputs\\.${output} \\}\\}`));
  }
});

test("automatic PR Quality owns one complete unit suite with isolated heavy identity coverage", () => {
  const core = jobSection("core", "database");
  const heavyTest = "components/workouts/active-workout/active-workout-core-session.identity.test.tsx";
  assert.equal(occurrences(core, `heavy_test=\"${heavyTest}\"`), 1);
  assert.equal(occurrences(core, "--name unit-active-workout-core-identity"), 1);
  assert.match(core, /for shard in \$\(seq 1 32\)/);
  assert.match(core, /--exclude "\$heavy_test" --shard="\$\{shard\}\/32"/);
  assert.doesNotMatch(core, /--filesOnly|--static-parse|heap out of memory|\|\|\s*true/);
});

test("rendered selection uses current canonical runners only", () => {
  const ui = jobSection("ui", "ci-contracts");
  const general = stepSection(ui, "General rendered QA");
  const train = stepSection(ui, "Train and Active Workout rendered QA");
  const history = stepSection(ui, "Workout History rendered QA");

  assert.match(general, /needs\.classify\.outputs\.rendered_general/);
  assert.equal(occurrences(general, "npm run qa:rendered"), 1);

  for (const output of ["rendered_general", "rendered_train", "rendered_active_workout"]) {
    assert.match(train, new RegExp(`needs\\.classify\\.outputs\\.${output}`));
  }
  assert.equal(occurrences(train, "npm run qa:train"), 1);

  for (const output of ["rendered_general", "rendered_workout_history"]) {
    assert.match(history, new RegExp(`needs\\.classify\\.outputs\\.${output}`));
  }
  assert.equal(occurrences(history, "npm run qa:workout-history"), 1);

  assert.doesNotMatch(ui, /run-aw10-active-workout-closure|QA_AW10_EVIDENCE_DIR|active-workout-aw10-evidence/);
  assert.doesNotMatch(ui, /\beval\b/);
});

test("one build, one server and one wait are shared by selected rendered suites", () => {
  const ui = jobSection("ui", "ci-contracts");
  assert.equal(occurrences(ui, "npm run build"), 1);
  assert.equal(occurrences(ui, "npm run start"), 1);
  assert.equal(occurrences(ui, "- name: Build mock-auth QA application"), 1);
  assert.equal(occurrences(ui, "- name: Start production QA server"), 1);
  assert.equal(occurrences(ui, "- name: Wait for production QA server"), 1);
  assert.equal(occurrences(ui, "npx playwright install --with-deps chromium"), 1);
  assert.match(ui, /- name: Stop production QA server\n        if: always\(\)/);
});

test("rendered evidence and focused diagnostics remain bounded", () => {
  const ui = jobSection("ui", "ci-contracts");
  assert.match(ui, /name: pr-quality-rendered-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(ui, /ci-reports\/rendered-qa-evidence\//);
  assert.match(ui, /ci-reports\/train-qa-evidence\//);
  assert.match(ui, /ci-reports\/workout-history-qa-evidence\//);
  assert.doesNotMatch(ui, /active-workout-aw10-evidence/);
  assert.match(ui, /if-no-files-found: error/);
  assert.match(ui, /name: pr-quality-ui-failure-\$\{\{ github\.run_id \}\}/);
});

test("required summary remains always-run", () => {
  const summary = jobSection("summary");
  assert.match(summary, /name: required-summary\n    if: always\(\)/);
});

test("PR workflow introduces no Production credential secrets", () => {
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(workflow, /PLAIVRA_SMOKE_(?:POPULATED|EMPTY)_(?:EMAIL|PASSWORD)/);
  assert.doesNotMatch(workflow, /PRODUCTION_AUTH|PRODUCTION_PASSWORD|PRODUCTION_TOKEN/);
});
