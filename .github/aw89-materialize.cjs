const { readFileSync, writeFileSync } = require("node:fs");

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const first = source.indexOf(before);
  const last = source.lastIndexOf(before);
  if (first < 0 || first !== last) {
    throw new Error(`${path}: expected exactly one replacement target`);
  }
  writeFileSync(path, source.replace(before, after), "utf8");
}

const storePath = "lib/workouts/active-session-store/store-core.ts";
replaceOnce(
  storePath,
  `        if (typeof indexedDB !== "undefined") {
          staleCleanupPromise ??= clearStaleActiveWorkoutData()
            .catch(() => undefined);
          await staleCleanupPromise;
        }
        const cached = typeof indexedDB === "undefined"
          ? null
          : await readActiveWorkoutSessionCache(
              snapshot.userId,
              snapshot.workoutSessionId
            ).catch(() => null);
        if (cached && isOffline()) {`,
  `        const offline = isOffline();
        if (typeof indexedDB !== "undefined") {
          staleCleanupPromise ??= clearStaleActiveWorkoutData()
            .catch(() => undefined);
          if (offline) await staleCleanupPromise;
        }
        const cached = !offline || typeof indexedDB === "undefined"
          ? null
          : await readActiveWorkoutSessionCache(
              snapshot.userId,
              snapshot.workoutSessionId
            ).catch(() => null);
        if (cached) {`
);
replaceOnce(
  storePath,
  `          if (localExecutionState) dispatcher.replace(localExecutionState);
          return;
        }
        if (options.reconcile !== false && coordinator()) {
          await coordinator()!.reconcile();
        }
        const [root, executionState, prescription, performedLogs] = await Promise.all([
          input.adapter.loadSessionRoot(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadExecutionState(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPrescription(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPerformedLogs(snapshot.userId, snapshot.workoutSessionId)
        ]);`,
  `          if (localExecutionState) dispatcher.replace(localExecutionState);
          return;
        }
        if (offline) {
          throw new ActiveSessionError(
            "hydration_failed",
            "No durable offline snapshot is available for this workout."
          );
        }
        const canonicalLoads = Promise.all([
          input.adapter.loadSessionRoot(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadExecutionState(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPrescription(snapshot.userId, snapshot.workoutSessionId),
          input.adapter.loadPerformedLogs(snapshot.userId, snapshot.workoutSessionId)
        ]);
        if (options.reconcile !== false && coordinator()) {
          await coordinator()!.reconcile();
        }
        const [root, executionState, prescription, performedLogs] =
          await canonicalLoads;`
);

const ledgerPath = "supabase/migration-ledger.json";
const migrationFile =
  "20260731090000_active_workout_aw9_offline_multi_device.sql";
const evidenceCommit = "020a17d0b82ec3c50aed7d5f1ad03e5e19b5abc9";
const ledger = JSON.parse(readFileSync(ledgerPath, "utf8"));
const unexpected = ledger.entries.filter(
  (entry) =>
    entry.localFile !== migrationFile
    && !["applied", "applied_version_alias"].includes(entry.state)
);
if (unexpected.length) {
  throw new Error("Unexpected unresolved migration entries exist.");
}
ledger.entries = ledger.entries.filter(
  (entry) => entry.localFile !== migrationFile
);
for (const entry of ledger.entries) {
  if (entry.evidenceCommit) entry.evidenceCommit = evidenceCommit;
}
ledger.entries.push({
  localFile: migrationFile,
  state: "pending",
  evidenceCommit,
  repositorySha256:
    "1e727c81e333b08bfe4cc4f2aae50014ac07064bc25625913b14b27f41f7bf3e",
  repositoryGitBlob: "f1ffadfa2a0fc3b149afc6cfbf3c82751f18230c",
  note:
    "Repository-only AW-9 controller authority migration pending independent review. It has not been applied to Supabase Production. Do not replay any applied migration."
});
ledger.entries.sort((left, right) => left.localFile.localeCompare(right.localFile));
ledger.auditedRepositoryCommit = evidenceCommit;
ledger.capturedAt = new Date().toISOString();
ledger.pendingCount = 1;
ledger.unresolvedCount = 1;
ledger.historyRepair = {
  ...ledger.historyRepair,
  state: "pending",
  pendingCount: 1,
  unresolvedCount: 1,
  note:
    "Plaivra Production contains 75 physical migration records and remains reconciled through generated AW-4 migration 20260726114212. Repository migration 20260731090000_active_workout_aw9_offline_multi_device.sql is pending review and has not been applied. Do not replay any applied migration."
};
writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");

const pendingNote = `\n\n### AW-9 pending database migration\n\n\`${migrationFile}\` is repository-only and pending independent review. It has not been applied to Supabase Production. The Production compatibility marker remains unchanged; do not replay applied migrations.\n`;
for (const path of [
  "README.md",
  "docs/architecture/migration-ledger-reconciliation.md"
]) {
  const source = readFileSync(path, "utf8");
  if (!source.includes(migrationFile)) {
    writeFileSync(path, `${source.trimEnd()}${pendingNote}`, "utf8");
  }
}

writeFileSync(
  "lib/product/active-workout-aw9-migration.test.ts",
  `import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationPath =
  "supabase/migrations/20260731090000_active_workout_aw9_offline_multi_device.sql";
const migration = readFileSync(migrationPath, "utf8");

describe("AW-9 additive database authority", () => {
  it("adds claim_control without modifying an applied migration", () => {
    expect(migration).toContain("'claim_control'");
    expect(migration).toContain("'controller_conflict'");
    expect(migration).toContain(
      "private.assert_active_workout_controller",
    );
    expect(migration).toContain("for update");
    expect(migration).not.toContain(
      "update public.release_schema_compatibility",
    );
  });

  it("guards every Active Workout write surface with additive overloads", () => {
    for (const signature of [
      "public.upsert_workout_set_logs_atomic",
      "public.complete_workout_session_atomic",
      "public.replace_workout_session_snapshot_item_atomic",
      "public.skip_workout_session_snapshot_item_atomic",
      "public.cancel_workout_session_atomic",
    ])
      expect(migration).toContain(signature);
    expect(
      migration.match(/perform private\\.assert_active_workout_controller/g),
    ).toHaveLength(5);
  });

  it("keeps claim_control as the only controller-changing command", () => {
    expect(migration).toContain(
      "set controller_device_id = v_controller::text",
    );
    expect(migration).toContain(
      "if p_command_type <> 'claim_control' then",
    );
    expect(migration).toContain(
      "return public.aw9_pre_apply_workout_session_execution_command_atomic",
    );
  });
});
`,
  "utf8"
);
