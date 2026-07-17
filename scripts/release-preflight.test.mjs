import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReleasePreflight, resolvePreflightMode } from "./release-preflight.mjs";

const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const buildTimestamp = "2026-07-14T01:00:00.000Z";
const evidenceTimestamp = "2026-07-14T01:01:00.000Z";
const requiredGates = [
  "repositoryIntegrity", "fullMigrationChain", "databaseLint", "databasePreflight",
  "migrationLedger", "dependencyAudit", "lint", "typecheck", "unitTests",
  "integrationTests", "scriptTests", "telemetryTests", "environmentValidation",
  "releaseMetadata", "productionBuild", "renderedBrowserQa"
];

function validInput() {
  return {
    expectedCommit: sha,
    checkedOutCommit: sha,
    expectedRepository: "ahmedmohameda7222-ship-it/gymsands",
    remoteUrl: "https://github.com/ahmedmohameda7222-ship-it/gymsands.git",
    packageJson: { engines: { node: "24.x" } },
    nodeVersion: "v24.1.0",
    nvmVersion: "24\n",
    nodeFileVersion: "24\n",
    installedNextVersion: "16.2.10",
    migrationState: {
      reconciliationState: "reconciled",
      pendingCount: 0,
      schemaAppliedUntrackedCount: 0,
      unresolvedCount: 0,
      latestAppliedMigrationVersion: "20260715010000",
      releaseReady: true
    },
    manifest: {
      release: {
        commitSha: sha,
        buildTimestamp,
        expectedDatabaseMigrationVersion: "20260715010000",
        migrationLedgerReconciliationState: "reconciled",
        pendingMigrationCount: 0,
        schemaAppliedUntrackedCount: 0,
        unresolvedMigrationCount: 0
      },
      runtime: { nextVersion: "16.2.10" },
      qualityGates: Object.fromEntries(requiredGates.map((gate) => [gate, {
        status: "passed",
        evidence: `${gate}.log`,
        commitSha: sha,
        capturedAt: evidenceTimestamp,
        stale: false
      }]))
    }
  };
}

function pendingInput() {
  const input = validInput();
  input.migrationState = {
    ...input.migrationState,
    reconciliationState: "pending",
    pendingCount: 2,
    schemaAppliedUntrackedCount: 0,
    unresolvedCount: 2,
    releaseReady: false
  };
  input.manifest.release = {
    ...input.manifest.release,
    migrationLedgerReconciliationState: "pending",
    pendingMigrationCount: 2,
    schemaAppliedUntrackedCount: 0,
    unresolvedMigrationCount: 2
  };
  return input;
}

test("defaults programmatic evaluation to strict release mode", () => {
  const result = evaluateReleasePreflight(validInput());
  assert.equal(result.mode, "release");
  assert.equal(result.ready, true);
  assert.equal(result.reviewReady, true);
  assert.equal(result.releaseReady, true);
  assert.deepEqual(result.releaseBlockers, []);
  assert.deepEqual(result.failures, []);
});

test("selects review only for a pull-request workflow when no explicit mode is supplied", () => {
  assert.equal(resolvePreflightMode(undefined, "pull_request"), "review");
  assert.equal(resolvePreflightMode(undefined, "push"), "release");
  assert.equal(resolvePreflightMode("release", "pull_request"), "release");
});

test("strict release mode rejects a valid pending-only migration state", () => {
  const result = evaluateReleasePreflight({ ...pendingInput(), mode: "release" });
  assert.equal(result.ready, false);
  assert.equal(result.reviewReady, true);
  assert.equal(result.releaseReady, false);
  assert.deepEqual(result.failures, ["migration_ledger_not_reconciled"]);
  assert.deepEqual(result.releaseBlockers, ["migration_ledger_not_reconciled"]);
});

test("review mode accepts a valid pending-only migration state without claiming release readiness", () => {
  const result = evaluateReleasePreflight({ ...pendingInput(), mode: "review" });
  assert.equal(result.ready, true);
  assert.equal(result.reviewReady, true);
  assert.equal(result.releaseReady, false);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.releaseBlockers, ["migration_ledger_not_reconciled"]);
});

test("review mode rejects schema-applied-untracked migration state", () => {
  const input = pendingInput();
  input.migrationState.schemaAppliedUntrackedCount = 1;
  input.manifest.release.schemaAppliedUntrackedCount = 1;
  const result = evaluateReleasePreflight({ ...input, mode: "review" });
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes("migration_schema_applied_untracked"));
});

test("review mode rejects unresolved counts that differ from pending counts", () => {
  const input = pendingInput();
  input.migrationState.unresolvedCount = 3;
  input.manifest.release.unresolvedMigrationCount = 3;
  const result = evaluateReleasePreflight({ ...input, mode: "review" });
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes("migration_unresolved_count_mismatch"));
});

test("both modes reject an old deployment artifact as a substitute for the reviewed SHA", () => {
  for (const mode of ["release", "review"]) {
    const input = validInput();
    input.checkedOutCommit = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
    const result = evaluateReleasePreflight({ ...input, mode });
    assert.equal(result.ready, false);
    assert.ok(result.failures.includes("checkout_commit_mismatch"));
  }
});

test("both modes reject manifest count drift", () => {
  for (const [field, code] of [
    ["pendingMigrationCount", "release_manifest_pending_count_mismatch"],
    ["schemaAppliedUntrackedCount", "release_manifest_untracked_count_mismatch"],
    ["unresolvedMigrationCount", "release_manifest_unresolved_count_mismatch"]
  ]) {
    for (const mode of ["release", "review"]) {
      const input = validInput();
      input.manifest.release[field] = 1;
      const result = evaluateReleasePreflight({ ...input, mode });
      assert.ok(result.failures.includes(code));
    }
  }
});

test("review mode still distinguishes missing and failed quality evidence", () => {
  const input = pendingInput();
  input.manifest.qualityGates.productionBuild = { status: "passed", evidence: null };
  const result = evaluateReleasePreflight({ ...input, mode: "review" });
  assert.ok(result.failures.includes("quality_gate_productionBuild_missing"));

  const browserInput = pendingInput();
  browserInput.manifest.qualityGates.renderedBrowserQa.status = "failed";
  expectFailure(browserInput, "quality_gate_renderedBrowserQa_failed", "review");
});

test("review mode still rejects commit-mismatched and stale quality evidence", () => {
  const commitInput = pendingInput();
  commitInput.manifest.qualityGates.unitTests.commitSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
  expectFailure(commitInput, "quality_gate_unitTests_commit_mismatch", "review");

  const staleInput = pendingInput();
  staleInput.manifest.qualityGates.integrationTests.capturedAt = "2026-07-14T00:59:59.000Z";
  expectFailure(staleInput, "quality_gate_integrationTests_stale", "review");
});

test("reconciled state passes both review and release modes", () => {
  for (const mode of ["release", "review"]) {
    const result = evaluateReleasePreflight({ ...validInput(), mode });
    assert.equal(result.ready, true);
    assert.equal(result.reviewReady, true);
    assert.equal(result.releaseReady, true);
  }
});

test("rejects a manifest whose Next.js evidence differs from the installed runtime", () => {
  const input = validInput();
  input.manifest.runtime.nextVersion = "^16.0.3";
  expectFailure(input, "release_manifest_next_version_mismatch", "release");
});

test("unknown modes fail closed", () => {
  assert.throws(
    () => evaluateReleasePreflight({ ...validInput(), mode: "deploy" }),
    /Preflight mode must be one of: release, review/
  );
  assert.throws(
    () => resolvePreflightMode("deploy", "pull_request"),
    /Preflight mode must be one of: release, review/
  );
});

function expectFailure(input, code, mode) {
  const result = evaluateReleasePreflight({ ...input, mode });
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes(code));
}
