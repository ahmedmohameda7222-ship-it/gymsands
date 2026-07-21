import assert from "node:assert/strict";
import test from "node:test";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";

test("latest release target includes reconciled production version aliases", () => {
  const derived = deriveMigrationLedgerState({
    historyRepair: { state: "reconciled" },
    entries: [
      {
        localFile: "20260721012814_active_workout_aw2a_execution_state_corrections.sql",
        state: "applied",
        productionVersion: "20260721012814",
        productionName: "active_workout_aw2a_execution_state_corrections"
      },
      {
        localFile: "20260722013000_active_workout_aw2b_command_authority.sql",
        state: "applied_version_alias",
        productionVersion: "20260721224813",
        productionName: "active_workout_aw2b_command_authority",
        note: "The generated production version differs from the immutable repository version. Do not replay."
      }
    ]
  });

  assert.equal(derived.releaseReady, true);
  assert.equal(derived.latestAppliedMigrationVersion, "20260721224813");
  assert.equal(derived.appliedCount, 1);
});
