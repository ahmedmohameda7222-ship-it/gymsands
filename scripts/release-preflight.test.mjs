import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReleasePreflight } from "./release-preflight.mjs";

const sha = "60a204d5fc20fc396be1b1b47e748c42ebba6abf";
const requiredGates = [
  "repositoryIntegrity", "fullMigrationChain", "databaseLint", "databasePreflight",
  "migrationLedger", "dependencyAudit", "lint", "typecheck", "unitTests",
  "integrationTests", "scriptTests", "telemetryTests", "environmentValidation",
  "releaseMetadata", "productionBuild"
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
    migrationState: {
      reconciliationState: "reconciled",
      schemaAppliedUntrackedCount: 0,
      latestAppliedMigrationVersion: "20260713170000"
    },
    manifest: {
      release: {
        commitSha: sha,
        expectedDatabaseMigrationVersion: "20260713170000",
        migrationLedgerReconciliationState: "reconciled"
      },
      qualityGates: Object.fromEntries(requiredGates.map((gate) => [gate, { status: "passed", evidence: `${gate}.log` }]))
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

test("fails while schema-applied migration history remains untracked", () => {
  const input = validInput();
  input.migrationState.reconciliationState = "pending";
  input.migrationState.schemaAppliedUntrackedCount = 6;
  input.manifest.release.migrationLedgerReconciliationState = "pending";
  const result = evaluateReleasePreflight(input);
  assert.equal(result.ready, false);
  assert.ok(result.failures.includes("migration_ledger_not_reconciled"));
});

test("fails without retained same-commit quality evidence", () => {
  const input = validInput();
  input.manifest.qualityGates.productionBuild = { status: "passed", evidence: null };
  const result = evaluateReleasePreflight(input);
  assert.ok(result.failures.includes("quality_gate_productionBuild_missing"));
});
