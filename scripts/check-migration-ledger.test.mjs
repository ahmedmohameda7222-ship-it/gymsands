import assert from "node:assert/strict";
import test from "node:test";
import { deriveMigrationLedgerState, validateMigrationLedger } from "./check-migration-ledger.mjs";

const files = [
  "20260711014500_idempotency_uncertain_completion_guard.sql",
  "20260711213000_adaptive_onboarding_v2.sql"
];

function validLedger() {
  return {
    schemaVersion: 1,
    projectRef: "bkwezjxvapaeasfvlhvv",
    capturedAt: "2026-07-13T17:12:53.584192+00:00",
    auditedRepositoryCommit: "778f4dc896147f81a7e404802af13d7af3dd2fba",
    productionMigrationCount: 1,
    schemaVerifiedUntrackedCount: 1,
    historyRepair: {
      state: "pending",
      schemaAppliedUntrackedCount: 1,
      note: "Migration reconciliation is pending. Do not replay schema-applied migrations."
    },
    entries: [
      {
        productionVersion: "20260711014500",
        productionName: "idempotency_uncertain_completion_guard",
        localFile: files[0],
        state: "applied"
      },
      {
        productionVersion: null,
        productionName: null,
        localFile: files[1],
        state: "applied_schema_untracked",
        note: "Absent from Supabase migration history, but the complete schema effects, ownership checks, grants, policies, constraints, and indexes were verified. Do not replay."
      }
    ]
  };
}

const documentation = {
  "README.md": files[1],
  "docs/architecture/migration-ledger-reconciliation.md": files[1]
};

test("accepts an internally consistent pending reconciliation ledger", () => {
  const result = validateMigrationLedger({ ledger: validLedger(), files, documentation });
  assert.deepEqual(result.errors, []);
  assert.equal(result.derived.releaseReady, false);
  assert.equal(result.derived.latestAppliedMigrationVersion, "20260711014500");
});

test("rejects stale declared counts", () => {
  const ledger = validLedger();
  ledger.productionMigrationCount = 2;
  ledger.schemaVerifiedUntrackedCount = 0;
  const result = validateMigrationLedger({ ledger, files, documentation });
  assert.ok(result.errors.some((error) => error.includes("productionMigrationCount")));
  assert.ok(result.errors.some((error) => error.includes("schemaVerifiedUntrackedCount")));
});

test("rejects reconciled state while untracked migrations remain", () => {
  const ledger = validLedger();
  ledger.historyRepair.state = "reconciled";
  const result = validateMigrationLedger({ ledger, files, documentation });
  assert.ok(result.errors.some((error) => error.includes("cannot retain schema-applied untracked")));
});

test("rejects stale documentation and malformed capture metadata", () => {
  const ledger = validLedger();
  ledger.auditedRepositoryCommit = "778f4dc";
  ledger.capturedAt = "not-a-time";
  const result = validateMigrationLedger({ ledger, files, documentation: { "README.md": "", "migration.md": "" } });
  assert.ok(result.errors.some((error) => error.includes("exact 40-character")));
  assert.ok(result.errors.some((error) => error.includes("ISO-8601")));
  assert.ok(result.errors.some((error) => error.includes("does not list")));
});

test("derives readiness rather than trusting a declared green state", () => {
  const derived = deriveMigrationLedgerState(validLedger());
  assert.deepEqual(derived, {
    appliedCount: 1,
    schemaAppliedUntrackedCount: 1,
    reconciliationState: "pending",
    latestAppliedMigrationVersion: "20260711014500",
    releaseReady: false
  });
});
