import assert from "node:assert/strict";
import test from "node:test";
import { changedPathDiffArgs, classifyChangedPaths } from "./ci-change-scope.mjs";

test("documentation-only changes run only integrity and summary", () => {
  const scope = classifyChangedPaths(["README.md", "docs/architecture/example.md"]);
  assert.equal(scope.docsOnly, true);
  assert.equal(scope.core, false);
  assert.equal(scope.database, false);
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
  assert.equal(scope.build, true);
});

test("central database verification changes select the database gate", () => {
  const scope = classifyChangedPaths(["scripts/run-database-verification.mjs"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
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
  assert.equal(scope.build, true);
});

test("styling build configuration selects rendered UI QA and production build", () => {
  for (const path of ["tailwind.config.ts", "postcss.config.mjs"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.ui, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.build, true);
    assert.equal(scope.database, false);
    assert.equal(scope.fallback, false);
  }
});

test("build authority scripts execute the production build gate", () => {
  for (const path of ["scripts/validate-production-env.mjs", "scripts/verify-built-release-metadata.mjs"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.build, true);
    assert.equal(scope.database, false);
  }
});

test("test-only source changes avoid build and rendered browser QA", () => {
  const scope = classifyChangedPaths([
    "components/workouts/example.test.tsx",
    "lib/i18n/example.spec.ts",
  ]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, false);
  assert.equal(scope.ui, false);
  assert.equal(scope.build, false);
  assert.equal(scope.fallback, false);
});

test("non-database integration-test changes select the job that runs the integration suite", () => {
  const scope = classifyChangedPaths(["lib/release/version-route.integration.test.ts"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.ui, false);
  assert.equal(scope.build, false);
  assert.equal(scope.fallback, false);
});

test("database integration-test changes remain on database validation without a build", () => {
  const scope = classifyChangedPaths(["services/database/example.integration.test.ts"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.build, false);
});

test("integration runner and configuration changes execute live database integration", () => {
  for (const path of ["scripts/run-integration-tests.mjs", "vitest.integration.config.mjs"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.database, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.ui, false);
    assert.equal(scope.build, false);
    assert.equal(scope.fallback, false);
  }
});

test("central workflow and CI wrapper changes exercise every live affected gate", () => {
  for (const path of [".github/workflows/pr-quality.yml", "scripts/ci-change-scope.mjs", "scripts/run-ci-check.mjs"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.database, true);
    assert.equal(scope.ui, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.build, true);
    assert.equal(scope.fallback, false);
  }
});

test("dependency changes select audit, integration and build", () => {
  const scope = classifyChangedPaths(["package.json", "package-lock.json"]);
  assert.equal(scope.dependencies, true);
  assert.equal(scope.database, true);
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
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
});

test("empty diffs fail safe instead of silently skipping validation", () => {
  const scope = classifyChangedPaths([]);
  assert.equal(scope.fallback, true);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
});
