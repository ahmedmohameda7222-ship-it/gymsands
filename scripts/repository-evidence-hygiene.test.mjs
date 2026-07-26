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

function callArguments(source, callName) {
  const calls = [];
  const needle = `${callName}(`;
  let searchFrom = 0;
  while (searchFrom < source.length) {
    const start = source.indexOf(needle, searchFrom);
    if (start < 0) break;
    const open = start + needle.length - 1;
    let depth = 1;
    let quote = null;
    let escaped = false;
    for (let index = open + 1; index < source.length; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (character === "\\") {
          escaped = true;
          continue;
        }
        if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(open + 1, index));
          searchFrom = index + 1;
          break;
        }
      }
      if (index === source.length - 1) searchFrom = source.length;
    }
    if (searchFrom <= start) searchFrom = open + 1;
  }
  return calls;
}

function readsMarkdownProse(source) {
  const calls = [
    ...callArguments(source, "readFileSync"),
    ...callArguments(source, "readFile")
  ];
  return calls.some((call) => {
    const directPath = /docs[\\/][^"'`]*\.md/i.test(call);
    const segmentedPath = /["'`]docs["'`][\s\S]{0,320}?["'`][^"'`]*\.md["'`]/i.test(call);
    return directPath || segmentedPath;
  });
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

  const proseCoupling = testSources.filter((path) => readsMarkdownProse(readFileSync(path, "utf8")));

  assert.deepEqual(proseCoupling, []);
});
