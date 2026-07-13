import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const fullSha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";

function runScript(script, args, environment = {}) {
  return spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    env: { ...process.env, ...environment },
    encoding: "utf8"
  });
}

test("next.config bundles deterministic release and migration metadata", async () => {
  process.env.PLAIVRA_COMMIT_SHA = fullSha;
  process.env.PLAIVRA_BUILD_TIMESTAMP = "2026-07-14T01:02:03.000Z";
  process.env.PLAIVRA_RELEASE_ENVIRONMENT = "production";
  process.env.PLAIVRA_SCHEMA_COMPATIBILITY_VERSION = "2";

  const moduleUrl = new URL(`../next.config.mjs?test=${Date.now()}`, import.meta.url);
  const { default: config, releaseMetadata } = await import(moduleUrl.href);
  const ledger = JSON.parse(readFileSync(resolve(root, "supabase/migration-ledger.json"), "utf8"));

  assert.equal(releaseMetadata.commitSha, fullSha);
  assert.equal(releaseMetadata.buildTimestamp, "2026-07-14T01:02:03.000Z");
  assert.equal(releaseMetadata.environment, "production");
  assert.equal(releaseMetadata.migrationLedgerReconciliationState, ledger.historyRepair.state);
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, String(ledger.schemaVerifiedUntrackedCount));
  assert.match(releaseMetadata.expectedDatabaseMigrationVersion, /^\d{12,14}$/);
  assert.deepEqual(config.env.PLAIVRA_COMMIT_SHA, fullSha);
  assert.deepEqual(config.env.PLAIVRA_BUILD_TIMESTAMP, "2026-07-14T01:02:03.000Z");
  assert.equal(config.env.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION, releaseMetadata.expectedDatabaseMigrationVersion);
});

test("post-deploy smoke rejects abbreviated release SHAs before network access", () => {
  const result = runScript("scripts/post-deploy-smoke.mjs", [
    "--url", "https://example.invalid",
    "--expected-commit", "60a204d",
    "--expected-migration", "20260711014500"
  ]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /exact 40-character/i);
});

test("release manifest rejects abbreviated release SHAs", () => {
  const result = runScript("scripts/create-release-manifest.mjs", [
    "--commit", "60a204d",
    "--build-timestamp", "2026-07-14T01:02:03.000Z",
    "--environment", "production",
    "--schema-compatibility", "2"
  ]);
  assert.notEqual(result.status, 0);
  assert.match(`${result.stdout}\n${result.stderr}`, /exact 40-character/i);
});

test("production release gates reject nonstandard SHA lengths", () => {
  const result = runScript("scripts/vercel-production-release-gate.mjs", [], {
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_GIT_COMMIT_REF: "main",
    VERCEL_GIT_COMMIT_SHA: `${fullSha}00`,
    PLAIVRA_PRODUCTION_RELEASE_SHA: `${fullSha}00`
  });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /held/i);
});
