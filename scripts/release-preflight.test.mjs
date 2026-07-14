import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReleasePreflight } from "./release-preflight.mjs";

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
      latestAppliedMigrationVersion: "20260713170000",
      releaseReady: true
    },
    manifest: {
      release: {
        commitSha: sha,
        buildTimestamp,
        expectedDatabaseMigrationVersion: "20260713170000",
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

test("passes only one exact reviewed code/evidence/migration identity", () => {
  assert.deepEqual(evaluateReleasePreflight(validInput()), { ready: true, failures: [] });
});

test("rejects an old deployment artifact as a substitute for the reviewed SHA", () => {
  const input = validInput();
  input.checkedOutCommit = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
  const result = evaluateReleasePreflight(input);
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes("checkout_commit_mismatch"));
});

test("fails while any migration entry remains unresolved", () => {
  const input = validInput();
  input.migrationState = {
    ...input.migrationState,
    reconciliationState: "pending",
    pendingCount: 1,
    schemaAppliedUntrackedCount: 7,
    unresolvedCount: 8,
    releaseReady: false
  };
  input.manifest.release = {
    ...input.manifest.release,
    migrationLedgerReconciliationState: "pending",
    pendingMigrationCount: 1,
    schemaAppliedUntrackedCount: 7,
    unresolvedMigrationCount: 8
  };
  const result = evaluateReleasePreflight(input);
  assert.deepEqual(result, { ready: false, failures: ["migration_ledger_not_reconciled"] });
});

test("rejects manifest count drift", () => {
  for (const [field, code] of [
    ["pendingMigrationCount", "release_manifest_pending_count_mismatch"],
    ["schemaAppliedUntrackedCount", "release_manifest_untracked_count_mismatch"],
    ["unresolvedMigrationCount", "release_manifest_unresolved_count_mismatch"]
  ]) {
    const input = validInput();
    input.manifest.release[field] = 1;
    const result = evaluateReleasePreflight(input);
    assert.ok(result.failures.includes(code));
  }
});

test("distinguishes missing and failed quality evidence", () => {
  const input = validInput();
  input.manifest.qualityGates.productionBuild = { status: "passed", evidence: null };
  const result = evaluateReleasePreflight(input);
  assert.ok(result.failures.includes("quality_gate_productionBuild_missing"));

  const browserInput = validInput();
  browserInput.manifest.qualityGates.renderedBrowserQa.status = "failed";
  expectFailure(browserInput, "quality_gate_renderedBrowserQa_failed");
});

test("distinguishes commit-mismatched and stale quality evidence", () => {
  const commitInput = validInput();
  commitInput.manifest.qualityGates.unitTests.commitSha = "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9";
  expectFailure(commitInput, "quality_gate_unitTests_commit_mismatch");

  const staleInput = validInput();
  staleInput.manifest.qualityGates.integrationTests.capturedAt = "2026-07-14T00:59:59.000Z";
  expectFailure(staleInput, "quality_gate_integrationTests_stale");
});

test("rejects a manifest whose Next.js evidence differs from the installed runtime", () => {
  const input = validInput();
  input.manifest.runtime.nextVersion = "^16.0.3";
  expectFailure(input, "release_manifest_next_version_mismatch");
});

function expectFailure(input, code) {
  const result = evaluateReleasePreflight(input);
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes(code));
}
