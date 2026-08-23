import assert from "node:assert/strict";
import test from "node:test";
import {
  changedPathDiffArgs,
  classifyChangedPaths,
  dependencyManifestChanged,
  qaValidationScriptsChanged,
} from "./ci-change-scope.mjs";

function assertRendered(scope, expected) {
  assert.deepEqual(
    {
      general: scope.renderedGeneral,
      train: scope.renderedTrain,
      active: scope.renderedActiveWorkout,
      history: scope.renderedWorkoutHistory,
    },
    expected,
  );
  if (Object.values(expected).some(Boolean)) {
    assert.equal(scope.ui, true);
    assert.equal(scope.core, true);
    assert.equal(scope.build, true);
  }
}

test("ordinary documentation-only changes run only integrity and summary", () => {
  const scope = classifyChangedPaths(["CHANGELOG.md", "docs/guides/example.md"]);
  assert.equal(scope.docsOnly, true);
  assert.equal(scope.core, false);
  assert.equal(scope.database, false);
  assert.equal(scope.ui, false);
  assert.equal(scope.ci, false);
  assert.equal(scope.build, false);
  assertRendered(scope, { general: false, train: false, active: false, history: false });
});

test("release prose stays lightweight because executable policy is source-authoritative", () => {
  for (const path of ["docs/release/README.md", "docs/operations/launch-runbook.md"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.docsOnly, true);
    assert.equal(scope.core, false);
    assert.equal(scope.database, false);
    assert.equal(scope.ui, false);
    assert.equal(scope.ci, false);
    assert.equal(scope.build, false);
    assert.equal(scope.fallback, false);
    assertRendered(scope, { general: false, train: false, active: false, history: false });
  }
});

test("migration ledger documentation executes database validation", () => {
  for (const path of ["README.md", "docs/architecture/migration-ledger-reconciliation.md"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.docsOnly, false);
    assert.equal(scope.core, true);
    assert.equal(scope.database, true);
    assert.equal(scope.ui, false);
    assert.equal(scope.ci, false);
    assert.equal(scope.build, false);
    assert.equal(scope.fallback, false);
    assertRendered(scope, { general: false, train: false, active: false, history: false });
  }
});

test("machine-readable documentation contracts execute core validation", () => {
  for (const path of [
    "docs/chatgpt-app/public-tool-catalog.json",
    "docs/contracts/example.yaml",
  ]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.docsOnly, false);
    assert.equal(scope.core, true);
    assert.equal(scope.database, false);
    assert.equal(scope.ui, false);
    assert.equal(scope.build, false);
    assert.equal(scope.fallback, false);
    assertRendered(scope, { general: false, train: false, active: false, history: false });
  }
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

test("both migration replay helpers execute live database validation", () => {
  for (const path of [
    "scripts/replay-local-migration-chain.mjs",
    "scripts/replay-local-migration-chain-legacy.mjs",
  ]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.core, true);
    assert.equal(scope.database, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.build, false);
    assert.equal(scope.fallback, false);
  }
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
  assertRendered(scope, { general: true, train: true, active: true, history: true });
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
    assertRendered(scope, { general: true, train: true, active: true, history: true });
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
  assertRendered(scope, { general: false, train: false, active: false, history: false });
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
    assertRendered(scope, { general: true, train: true, active: true, history: true });
  }
});

test("unclassified execution scripts fail safe to all live validation gates", () => {
  const scope = classifyChangedPaths(["scripts/new-release-authority.mjs"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
  assert.equal(scope.fallback, true);
  assertRendered(scope, { general: true, train: true, active: true, history: true });
});

test("script test files remain lightweight and do not trigger broad fallback", () => {
  const scope = classifyChangedPaths(["scripts/new-release-authority.test.mjs"]);
  assert.equal(scope.core, true);
  assert.equal(scope.database, false);
  assert.equal(scope.ui, false);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, false);
  assert.equal(scope.fallback, false);
  assertRendered(scope, { general: false, train: false, active: false, history: false });
});

test("package manifest comparison distinguishes scripts from dependencies", () => {
  const base = JSON.stringify({
    scripts: { test: "node --test", "qa:rendered": "node old.mjs" },
    dependencies: { next: "16.2.11" },
    devDependencies: { vitest: "4.1.9" },
    overrides: { postcss: "8.5.22" },
  });
  const scriptOnly = JSON.stringify({
    scripts: { test: "node --test", "qa:rendered": "node old.mjs", measure: "node measure.mjs" },
    dependencies: { next: "16.2.11" },
    devDependencies: { vitest: "4.1.9" },
    overrides: { postcss: "8.5.22" },
  });
  const qaEdit = JSON.stringify({
    scripts: { test: "node --test", "qa:rendered": "node new.mjs" },
    dependencies: { next: "16.2.11" },
    devDependencies: { vitest: "4.1.9" },
    overrides: { postcss: "8.5.22" },
  });
  const dependencyEdit = JSON.stringify({
    scripts: { test: "node --test", "qa:rendered": "node old.mjs" },
    dependencies: { next: "16.3.0" },
    devDependencies: { vitest: "4.1.9" },
    overrides: { postcss: "8.5.22" },
  });
  assert.equal(dependencyManifestChanged(base, scriptOnly), false);
  assert.equal(dependencyManifestChanged(base, dependencyEdit), true);
  assert.equal(qaValidationScriptsChanged(base, scriptOnly), false);
  assert.equal(qaValidationScriptsChanged(base, qaEdit), true);
  assert.throws(
    () => dependencyManifestChanged("not-json", dependencyEdit),
    /not valid JSON/,
  );
});

test("QA or validation package script changes select all rendered suites", () => {
  const scope = classifyChangedPaths(
    ["package.json"],
    {
      dependencyManifestChanged: false,
      qaValidationScriptsChanged: true,
    },
  );
  assertRendered(scope, { general: true, train: true, active: true, history: true });
  assert.equal(scope.ci, true);
  assert.equal(scope.database, false);
});

test("dependency changes select audit, integration and build", () => {
  const scope = classifyChangedPaths(
    ["package.json", "package-lock.json"],
    { dependencyManifestChanged: true },
  );
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
  assertRendered(scope, { general: true, train: true, active: true, history: true });
});

test("empty diffs fail safe instead of silently skipping validation", () => {
  const scope = classifyChangedPaths([]);
  assert.equal(scope.fallback, true);
  assert.equal(scope.core, true);
  assert.equal(scope.database, true);
  assert.equal(scope.ui, true);
  assert.equal(scope.ci, true);
  assert.equal(scope.build, true);
  assertRendered(scope, { general: true, train: true, active: true, history: true });
});

test("Workout History implementation paths select only History rendered QA", () => {
  for (const path of [
    "components/workouts/history/history-list.tsx",
    "lib/workouts/history/query.ts",
    "services/workouts/history/client.ts",
    "app/api/workouts/history/route.ts",
    "app/(private)/workout-history/page.tsx",
    "scripts/run-workout-history-qa.mjs",
  ]) {
    assertRendered(classifyChangedPaths([path]), {
      general: false,
      train: false,
      active: false,
      history: true,
    });
  }
});

test("Active Workout implementation paths select only Active Workout rendered QA", () => {
  for (const path of [
    "components/workouts/active-workout/session.tsx",
    "components/workouts/active-workout-minimized-bar.tsx",
    "lib/workouts/session-engine/reducer.ts",
    "lib/workouts/active-session-store/store.ts",
    "lib/workouts/active-session-sync/leadership.ts",
    "services/database/active-session-reader.ts",
    "services/database/workout-session-execution.ts",
    "app/(private)/active-workout/page.tsx",
  ]) {
    assertRendered(classifyChangedPaths([path]), {
      general: false,
      train: false,
      active: true,
      history: false,
    });
  }
});

test("Train implementation paths select only Train rendered QA", () => {
  for (const path of [
    "components/train/train-shell.tsx",
    "lib/train/exercise-display.ts",
    "app/(private)/train/page.tsx",
    "scripts/run-train-layout-qa.mjs",
  ]) {
    assertRendered(classifyChangedPaths([path]), {
      general: false,
      train: true,
      active: false,
      history: false,
    });
  }
});

test("shared layouts select every rendered suite", () => {
  for (const path of [
    "app/layout.tsx",
    "app/(private)/layout.tsx",
    "app/error.tsx",
    "components/layout/app-shell.tsx",
  ]) {
    assertRendered(classifyChangedPaths([path]), {
      general: true,
      train: true,
      active: true,
      history: true,
    });
  }
});

test("messages select every rendered suite", () => {
  assertRendered(classifyChangedPaths(["messages/en.json"]), {
    general: true,
    train: true,
    active: true,
    history: true,
  });
});

test("global styles select every rendered suite", () => {
  for (const path of ["app/globals.css", "tailwind.config.ts"]) {
    assertRendered(classifyChangedPaths([path]), {
      general: true,
      train: true,
      active: true,
      history: true,
    });
  }
});

test("test-only domain paths do not activate rendered QA", () => {
  for (const path of [
    "components/workouts/history/history-list.test.tsx",
    "components/workouts/active-workout/session.spec.tsx",
    "components/train/train-shell.test.tsx",
    "lib/workouts/history/query.test.ts",
    "lib/workouts/session-engine/reducer.test.ts",
    "lib/train/exercise-display.test.ts",
  ]) {
    assertRendered(classifyChangedPaths([path]), {
      general: false,
      train: false,
      active: false,
      history: false,
    });
  }
});

test("mixed History and Active paths union only those rendered scopes", () => {
  const scope = classifyChangedPaths([
    "components/workouts/history/history-list.tsx",
    "components/workouts/active-workout/session.tsx",
  ]);
  assertRendered(scope, {
    general: false,
    train: false,
    active: true,
    history: true,
  });
});

test("unknown runtime UI paths fail closed to all rendered suites", () => {
  const scope = classifyChangedPaths(["components/new-product/surface.tsx"]);
  assert.equal(scope.fallback, false);
  assertRendered(scope, {
    general: true,
    train: true,
    active: true,
    history: true,
  });
});

test("unknown non-runtime execution authority keeps broad safe lanes", () => {
  const scope = classifyChangedPaths(["scripts/new-ci-authority.mjs"]);
  assert.equal(scope.fallback, true);
  assert.equal(scope.database, true);
  assert.equal(scope.ci, true);
  assertRendered(scope, {
    general: true,
    train: true,
    active: true,
    history: true,
  });
});
