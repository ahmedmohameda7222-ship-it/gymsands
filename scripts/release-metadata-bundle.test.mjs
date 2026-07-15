import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { validateBuiltReleaseMetadata } from "./verify-built-release-metadata.mjs";

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
  assert.equal(releaseMetadata.pendingMigrationCount, String(ledger.pendingCount));
  assert.equal(releaseMetadata.schemaAppliedUntrackedCount, String(ledger.schemaVerifiedUntrackedCount));
  assert.equal(releaseMetadata.unresolvedMigrationCount, String(ledger.unresolvedCount));
  assert.match(releaseMetadata.expectedDatabaseMigrationVersion, /^\d{12,14}$/);
  assert.equal(config.env.PLAIVRA_COMMIT_SHA, fullSha);
  assert.equal(config.env.PLAIVRA_BUILD_TIMESTAMP, "2026-07-14T01:02:03.000Z");
  assert.equal(config.env.PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION, releaseMetadata.expectedDatabaseMigrationVersion);
});

test("post-deploy smoke rejects abbreviated release SHAs before network access", () => {
  const result = runScript("scripts/post-deploy-smoke.mjs", [
    "--url", "https://example.invalid",
    "--expected-commit", "60a204d",
    "--expected-migration", "20260715010000"
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

test("release manifest records exact installed runtime versions and lockfile identity", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "plaivra-release-manifest-"));
  const output = resolve(directory, "release-manifest.json");
  try {
    const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const result = runScript("scripts/create-release-manifest.mjs", [
      "--commit", commit,
      "--build-timestamp", "2026-07-14T01:02:03.000Z",
      "--environment", "test",
      "--schema-compatibility", "2",
      "--output", output
    ]);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const manifest = JSON.parse(readFileSync(output, "utf8"));
    const ledger = JSON.parse(readFileSync(resolve(root, "supabase/migration-ledger.json"), "utf8"));
    const installedNext = JSON.parse(readFileSync(resolve(root, "node_modules/next/package.json"), "utf8")).version;
    const packageLock = readFileSync(resolve(root, "package-lock.json"));
    const npmVersion = process.platform === "win32"
      ? execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm --version"], { cwd: root, encoding: "utf8" }).trim()
      : execFileSync("npm", ["--version"], { cwd: root, encoding: "utf8" }).trim();

    assert.equal(manifest.runtime.nextVersion, installedNext);
    assert.doesNotMatch(manifest.runtime.nextVersion, /^[~^<>=]/);
    assert.equal(manifest.runtime.nodeVersion, process.version);
    assert.equal(manifest.runtime.npmVersion, npmVersion);
    assert.equal(manifest.runtime.lockfileSha256, createHash("sha256").update(packageLock).digest("hex"));
    assert.equal(manifest.release.pendingMigrationCount, ledger.pendingCount);
    assert.equal(manifest.release.schemaAppliedUntrackedCount, ledger.schemaVerifiedUntrackedCount);
    assert.equal(manifest.release.unresolvedMigrationCount, ledger.unresolvedCount);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("built metadata verification accepts reconciled ledger metadata while runtime readiness remains fail-closed", () => {
  const expected = {
    commitSha: fullSha,
    buildTimestamp: "2026-07-14T01:02:03.000Z",
    environment: "ci",
    expectedDatabaseMigrationVersion: "20260715010000",
    migrationLedgerReconciliationState: "reconciled",
    pendingMigrationCount: 0,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 0
  };
  const body = { ...expected, artifactIdentityValid: true, releaseReady: false };
  assert.equal(validateBuiltReleaseMetadata({ body, status: 503, expected }), true);
  assert.throws(
    () => validateBuiltReleaseMetadata({ body: { ...body, commitSha: "0".repeat(40) }, status: 503, expected }),
    /commitSha/
  );
  assert.throws(
    () => validateBuiltReleaseMetadata({ body: { ...body, releaseReady: true }, status: 503, expected }),
    /fail-closed/
  );
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
