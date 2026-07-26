import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function filesUnder(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) files.push(...filesUnder(path));
    else files.push(path.replaceAll("\\", "/"));
  }
  return files;
}

test("completed implementation evidence stays out of the active source tree", () => {
  const topLevelReports = readdirSync(root)
    .filter((entry) => /^plaivra_.*(?:implementation|qaqc|quality|audit|reconciliation).*\.(?:md|json)$/i.test(entry))
    .sort();
  assert.deepEqual(topLevelReports, []);

  const committedReportSnapshots = filesUnder(join(root, "docs", "reports"))
    .filter((path) => /\.(?:md|json)$/i.test(path))
    .sort();
  assert.deepEqual(committedReportSnapshots, []);

  for (const obsoletePointer of [
    "docs/architecture.md",
    "docs/privacy/active-workout-command-receipts.md",
    "release/prelaunch-handoff-manifest.json",
    "plaivra_production_migration_reconciliation_plan.md",
    ".github/workflows/aw3c-repository-cleanup.yml",
  ]) {
    assert.equal(existsSync(join(root, obsoletePointer)), false, `${obsoletePointer} must remain absent`);
  }
});

test("current authority remains present after evidence cleanup", () => {
  for (const authority of [
    "README.md",
    "docs/architecture/canonical-domain-model.md",
    "docs/architecture/migration-ledger-reconciliation.md",
    "docs/platform-roadmap/README.md",
    "docs/release/README.md",
    "supabase/migration-ledger.json",
  ]) {
    assert.equal(existsSync(join(root, authority)), true, `${authority} is required authority`);
  }
});

test("tests enforce code and structured contracts instead of Markdown prose", () => {
  const testSources = ["app", "components", "lib", "services", "scripts"]
    .flatMap((directory) => filesUnder(join(root, directory)))
    .filter((path) => /(?:^|\/)[^/]+\.(?:test|spec)\.(?:ts|tsx|js|mjs|cjs)$/i.test(path));

  const proseCoupling = testSources.filter((path) => {
    const source = readFileSync(path, "utf8");
    return /readFileSync\(\s*["']docs\/[^"']+\.md["']/i.test(source);
  });

  assert.deepEqual(proseCoupling, []);
});
