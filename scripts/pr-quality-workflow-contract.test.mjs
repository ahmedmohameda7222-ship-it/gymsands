import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowUrl = new URL("../.github/workflows/pr-quality.yml", import.meta.url);
const workflow = await readFile(workflowUrl, "utf8");

function jobSection(key, nextKey) {
  const start = workflow.indexOf(`\n  ${key}:\n`);
  assert.notEqual(start, -1, `Missing ${key} job.`);
  const end = nextKey
    ? workflow.indexOf(`\n  ${nextKey}:\n`, start + 1)
    : workflow.length;
  assert.notEqual(end, -1, `Missing boundary after ${key} job.`);
  return workflow.slice(start, end);
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
  ]) {
    assert.match(workflow, new RegExp(`name: ${name.replaceAll("-", "\\-")}`));
  }
});

test("scope exposes all rendered selector outputs", () => {
  const classify = jobSection("classify", "integrity");
  for (const output of [
    "rendered_general",
    "rendered_train",
    "rendered_active_workout",
    "rendered_workout_history",
  ]) {
    assert.match(
      classify,
      new RegExp(`${output}: \\$\\{\\{ steps\\.scope\\.outputs\\.${output} \\}\\}`),
    );
  }
});

test("UI job is selected only by rendered outputs", () => {
  const ui = jobSection("ui", "ci-contracts");
  for (const output of [
    "rendered_general",
    "rendered_train",
    "rendered_active_workout",
    "rendered_workout_history",
  ]) {
    assert.match(ui, new RegExp(`needs\\.classify\\.outputs\\.${output}`));
  }
  assert.doesNotMatch(ui, /if: needs\.classify\.outputs\.ui == 'true'/);
});

test("automatic PR Quality owns no duplicated unit subsets", () => {
  const core = jobSection("core", "database");
  const ui = jobSection("ui", "ci-contracts");
  assert.match(core, /npm run test:unit/);
  assert.doesNotMatch(workflow, /npm run test:i18n/);
  assert.doesNotMatch(workflow, /npm run test:workout-history(?:\s|$)/);
  assert.doesNotMatch(workflow, /Legacy workflow-text contracts/);
  assert.doesNotMatch(ui, /npm run test:i18n/);
  assert.doesNotMatch(ui, /npm run test:workout-history(?:\s|$)/);
  assert.doesNotMatch(ui, /Message contracts/);
  assert.doesNotMatch(ui, /Workout History focused tests/);
  assert.match(workflow, /npm run test:workout-history:integration/);
});

test("all rendered commands remain explicit and individually conditional", () => {
  const ui = jobSection("ui", "ci-contracts");
  const commands = [
    ["General rendered QA", "rendered_general", "npm run qa:rendered"],
    ["Train rendered QA", "rendered_train", "npm run qa:train"],
    ["Active Workout rendered QA", "rendered_active_workout", "npm run qa:active-workout:aw10"],
    ["Workout History rendered QA", "rendered_workout_history", "npm run qa:workout-history"],
  ];
  for (const [stepName, output, command] of commands) {
    const start = ui.indexOf(`- name: ${stepName}`);
    assert.notEqual(start, -1, `Missing ${stepName}.`);
    const next = ui.indexOf("\n      - name:", start + 1);
    const step = ui.slice(start, next === -1 ? ui.length : next);
    assert.match(step, new RegExp(`needs\\.classify\\.outputs\\.${output}`));
    assert.equal(occurrences(step, command), 1);
  }
  assert.doesNotMatch(ui, /\beval\b/);
});

test("Active Workout evidence uses declarative YAML environment authority", () => {
  const ui = jobSection("ui", "ci-contracts");
  const start = ui.indexOf("- name: Active Workout rendered QA");
  assert.notEqual(start, -1, "Missing Active Workout rendered QA step.");
  const next = ui.indexOf("\n      - name:", start + 1);
  const step = ui.slice(start, next === -1 ? ui.length : next);
  assert.match(
    step,
    /env:\n          QA_AW10_EVIDENCE_DIR: ci-reports\/active-workout-aw10-evidence/,
  );
  assert.doesNotMatch(
    step,
    /run:\s+QA_AW10_EVIDENCE_DIR=ci-reports\/active-workout-aw10-evidence/,
  );
});

test("one build, one server and one wait are shared by selected suites", () => {
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
  assert.match(
    ui,
    /name: pr-quality-rendered-evidence-\$\{\{ github\.event\.pull_request\.head\.sha \}\}/,
  );
  assert.match(ui, /if-no-files-found: error/);
  assert.match(ui, /name: pr-quality-ui-failure-\$\{\{ github\.run_id \}\}/);
  assert.match(ui, /if: failure\(\)/);
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
