import assert from "node:assert/strict";
import test from "node:test";
import { changedPathDiffArgs, classifyChangedPaths } from "./ci-change-scope.mjs";

test("documentation-only changes run only integrity and summary", () => {
  const scope = classifyChangedPaths(["README.md", "docs/architecture/example.md"]);
  assert.equal(scope.docsOnly, true);
  assert.equal(scope.core, false);
  assert.equal(scope.database, false);
  assert.equal(scope.integration, false);
  assert.equal(scope.ui, false);
  assert.equal(scope.ci, false);
  assert.equal(scope.build, false);
});

test("database changes select database, core and build conservatively", () => {
  const scope = classifyChangedPaths([
    "supabase/migrations/20260727000000_example.sql",
    "services/database/example.ts",
  ]);
  assert.equal(scope.docsOnly, false);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.build, true);
});

test("central database verification changes select the database gate", () => {
  const scope = classifyChangedPaths(["scripts/run-database-verification.mjs"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, false);
});

test("UI changes select UI, core and build without database replay", () => {
  const scope = classifyChangedPaths([
    "components/workouts/example.tsx",
    "messages/en.json",
  ]);
  assert.equal(scope.core, true);
  assert.equal(scope.ui, true);
  assert.equal(scope.database, false);
  assert.equal(scope.integration, false);
  assert.equal(scope.build, true);
});

test("test-only source changes avoid build and rendered browser QA", () => {
  const scope = classifyChangedPaths([
    "components/workouts/example.test.tsx",
    "lib/i18n/example.spec.ts",
  ]);
  assert.equal(scope.core, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.ui, false);
  assert.equal(scope.build, false);
  assert.equal(scope.fallback, false);
});

test("non-database integration-test changes select the integration suite", () => {
  const scope = classifyChangedPaths(["lib/release/version-route.integration.test.ts"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, false);
  assert.equal(scope.integration, true);
  assert.equal(scope.ui, false);
  assert.equal(scope.build, false);
  assert.equal(scope.fallback, false);
});

test("database integration-test changes stay on the database job", () => {
  const scope = classifyChangedPaths(["services/database/example.integration.test.ts"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.build, true);
});

test("workflow and generic script changes select CI contracts", () => {
  const scope = classifyChangedPaths([
    ".github/workflows/pr-quality.yml",
    "scripts/run-ci-check.mjs",
  ]);
  assert.equal(scope.core, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.database, false);
  assert.equal(scope.integration, false);
  assert.equal(scope.ui, false);
});

test("dependency changes select audit and build", () => {
  const scope = classifyChangedPaths(["package.json", "package-lock.json"]);
  assert.equal(scope.dependencies, true);
  assert.equal(scope.build, true);
  assert.equal(scope.ci, true);
});

test("deleted runtime paths cannot be hidden by accompanying documentation", () => {
  const scope = classifyChangedPaths(["docs/change.md", "lib/runtime/removed.ts"]);
  assert.equal(scope.docsOnly, false);
  assert.equal(scope.core, true);
  assert.equal(scope.build, true);
});

test("git diff includes deletions and emits both sides of renames", () => {
  const base = "1".repeat(40);
  const head = "2".repeat(40);
  assert.deepEqual(changedPathDiffArgs(base, head), [
    "diff",
    "--name-only",
    "--no-renames",
    "--diff-filter=ACMRD",
    `${base}...${head}`,
  ]);
});

test("unknown non-document paths fail safe to the broad affected scopes", () => {
  const scope = classifyChangedPaths(["unknown-surface/example.custom"]);
  assert.equal(scope.fallback, true);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
});

test("empty diffs fail safe instead of silently skipping validation", () => {
  const scope = classifyChangedPaths([]);
  assert.equal(scope.fallback, true);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.integration, false);
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
});
