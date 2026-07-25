import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalizeLedgerTimestamp,
  deriveMigrationLedgerState,
  validateMigrationLedger,
  validateMigrationLedgerGitEvidence
} from "./check-migration-ledger.mjs";

const files = [
  "20260711014500_idempotency_uncertain_completion_guard.sql",
  "20260711213000_adaptive_onboarding_v2.sql",
  "20260715010000_restrict_nutrition_target_override_acl.sql"
];

function validLedger() {
  return {
    schemaVersion: 1,
    projectRef: "bkwezjxvapaeasfvlhvv",
    capturedAt: "2026-07-15T00:45:00.000000+00:00",
    auditedRepositoryCommit: "54e9768d52011e1d1839c4f50f0a2bc578ca27db",
    productionMigrationCount: 1,
    schemaVerifiedUntrackedCount: 1,
    pendingCount: 1,
    unresolvedCount: 2,
    historyRepair: {
      state: "pending",
      schemaAppliedUntrackedCount: 1,
      pendingCount: 1,
      unresolvedCount: 2,
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
      },
      {
        productionVersion: null,
        productionName: null,
        localFile: files[2],
        state: "pending",
        note: "Forward-only ACL correction. Do not replay any earlier migration."
      }
    ]
  };
}

const documentation = {
  "README.md": `${files[1]}\n${files[2]}`,
  "docs/architecture/migration-ledger-reconciliation.md": `${files[1]}\n${files[2]}`
};

function reconciledLedger() {
  const ledger = validLedger();
  ledger.schemaVerifiedUntrackedCount = 0;
  ledger.pendingCount = 0;
  ledger.unresolvedCount = 0;
  ledger.historyRepair = {
    state: "reconciled",
    schemaAppliedUntrackedCount: 0,
    pendingCount: 0,
    unresolvedCount: 0,
    note: "History reconciled after independent verification. Do not replay applied migrations."
  };
  ledger.entries = [ledger.entries[0]];
  return ledger;
}

test("accepts an internally consistent pending reconciliation ledger", () => {
  const result = validateMigrationLedger({ ledger: validLedger(), files, documentation });
  assert.deepEqual(result.errors, []);
  assert.equal(result.derived.releaseReady, false);
  assert.equal(result.derived.pendingCount, 1);
  assert.equal(result.derived.schemaAppliedUntrackedCount, 1);
  assert.equal(result.derived.unresolvedCount, 2);
});

test("reconciled plus zero unresolved entries is potentially ready", () => {
  const ledger = reconciledLedger();
  const result = validateMigrationLedger({
    ledger,
    files: [files[0]],
    documentation: { "README.md": "", "docs/architecture/migration-ledger-reconciliation.md": "" }
  });
  assert.deepEqual(result.errors, []);
  assert.equal(result.derived.releaseReady, true);
});

test("reconciled plus one pending entry is not ready", () => {
  const ledger = reconciledLedger();
  ledger.entries.push(validLedger().entries[2]);
  ledger.pendingCount = 1;
  ledger.unresolvedCount = 1;
  ledger.historyRepair.pendingCount = 1;
  ledger.historyRepair.unresolvedCount = 1;
  const derived = deriveMigrationLedgerState(ledger);
  assert.equal(derived.pendingCount, 1);
  assert.equal(derived.releaseReady, false);
});

test("reconciled plus one schema-untracked entry is not ready", () => {
  const ledger = reconciledLedger();
  ledger.entries.push(validLedger().entries[1]);
  ledger.schemaVerifiedUntrackedCount = 1;
  ledger.unresolvedCount = 1;
  ledger.historyRepair.schemaAppliedUntrackedCount = 1;
  ledger.historyRepair.unresolvedCount = 1;
  const derived = deriveMigrationLedgerState(ledger);
  assert.equal(derived.schemaAppliedUntrackedCount, 1);
  assert.equal(derived.releaseReady, false);
});

test("pending history repair is not ready even with zero unresolved entries", () => {
  const ledger = reconciledLedger();
  ledger.historyRepair.state = "pending";
  assert.equal(deriveMigrationLedgerState(ledger).releaseReady, false);
});

test("a physically applied migration misclassified as pending cannot produce ready state", () => {
  const ledger = reconciledLedger();
  ledger.entries.push({
    productionVersion: null,
    productionName: null,
    localFile: "20260714030000_harden_train_plan_rpc_execution.sql",
    state: "pending",
    note: "Physical effects may exist, but the identity remains unresolved."
  });
  assert.equal(deriveMigrationLedgerState(ledger).releaseReady, false);
});

test("ledger drift review is unresolved and blocks readiness", () => {
  const ledger = reconciledLedger();
  ledger.entries.push({
    productionVersion: null,
    productionName: null,
    localFile: "20260715020000_example.sql",
    state: "ledger_drift_review",
    note: "Evidence review required."
  });
  const derived = deriveMigrationLedgerState(ledger);
  assert.equal(derived.ledgerDriftReviewCount, 1);
  assert.equal(derived.unresolvedCount, 1);
  assert.equal(derived.releaseReady, false);
});

test("rejects stale declared counts", () => {
  const ledger = validLedger();
  ledger.pendingCount = 0;
  ledger.unresolvedCount = 1;
  const result = validateMigrationLedger({ ledger, files, documentation });
  assert.ok(result.errors.some((error) => error.includes("pendingCount")));
  assert.ok(result.errors.some((error) => error.includes("unresolvedCount")));
});

test("rejects reconciled state while unresolved migrations remain", () => {
  const ledger = validLedger();
  ledger.historyRepair.state = "reconciled";
  const result = validateMigrationLedger({ ledger, files, documentation });
  assert.ok(result.errors.some((error) => error.includes("cannot retain unresolved")));
});

test("canonicalizes the repository PostgreSQL UTC timestamp without changing its instant", () => {
  assert.equal(
    canonicalizeLedgerTimestamp("2026-07-15T00:45:00.000000+00"),
    "2026-07-15T00:45:00.000000Z"
  );
});

test("rejects malformed and missing capture timestamps", () => {
  for (const capturedAt of ["not-a-time", "2026-07-15 00:45:00+00", "", null, undefined]) {
    const ledger = validLedger();
    ledger.capturedAt = capturedAt;
    const result = validateMigrationLedger({ ledger, files, documentation });
    assert.ok(result.errors.some((error) => error.includes("ISO-8601")));
  }
});

test("derives all fail-closed counts rather than trusting a declared green state", () => {
  assert.deepEqual(deriveMigrationLedgerState(validLedger()), {
    appliedCount: 1,
    pendingCount: 1,
    schemaAppliedUntrackedCount: 1,
    ledgerDriftReviewCount: 0,
    unresolvedCount: 2,
    invalidAppliedProductionIdentityCount: 0,
    reconciliationState: "pending",
    latestAppliedMigrationVersion: "20260711014500",
    releaseReady: false
  });
});


test("accepts reachable immutable migration evidence with matching committed bytes", async () => {
  const bytes = Buffer.from("select 1;\n");
  const commit = "54e9768d52011e1d1839c4f50f0a2bc578ca27db";
  const sha256 = "4a45092ccf992ea92250053a80b931b787924ba61648f420555511b84f10ab6c";
  const blob = "40f0e35f840b1f7d176bef8849266cfa2dc21831";
  const ledger = reconciledLedger();
  ledger.auditedRepositoryCommit = commit;
  ledger.entries[0] = {
    ...ledger.entries[0],
    evidenceCommit: commit,
    repositorySha256: sha256,
    repositoryGitBlob: blob
  };
  const calls = [];
  const errors = await validateMigrationLedgerGitEvidence({
    ledger,
    root: "/repo",
    runGit: async (args) => {
      calls.push(args);
      if (args[0] === "show") return bytes;
      if (args[0] === "rev-parse") return Buffer.from(`${blob}\n`);
      return Buffer.alloc(0);
    },
    readCurrentFile: async () => bytes
  });
  assert.deepEqual(errors, []);
  assert.ok(calls.some((args) => args.join(" ") === `merge-base --is-ancestor ${commit} HEAD`));
  assert.ok(calls.some((args) => args[0] === "show" && args[1].includes(files[0])));
});

test("rejects an unrelated or unreachable evidence commit", async () => {
  const commit = "54e9768d52011e1d1839c4f50f0a2bc578ca27db";
  const ledger = reconciledLedger();
  ledger.auditedRepositoryCommit = commit;
  ledger.entries[0] = {
    ...ledger.entries[0],
    evidenceCommit: commit,
    repositorySha256: "0".repeat(64),
    repositoryGitBlob: "0".repeat(40)
  };
  const errors = await validateMigrationLedgerGitEvidence({
    ledger,
    runGit: async (args) => {
      if (args[0] === "merge-base") throw new Error("not ancestor");
      if (args[0] === "show") throw new Error("missing migration");
      return Buffer.alloc(0);
    },
    readCurrentFile: async () => Buffer.from("select 1;\n")
  });
  assert.ok(errors.some((error) => error.includes("not reachable")));
  assert.ok(errors.some((error) => error.includes("does not contain attested migration")));
});
