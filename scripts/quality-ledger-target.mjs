import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { deriveMigrationLedgerState } from "./check-migration-ledger.mjs";
import { expectedMigrationVersion } from "./release-identity-contract.mjs";

export function deriveQualityLedgerTarget(ledger) {
  const state = deriveMigrationLedgerState(ledger);
  return Object.freeze({
    expectedMigration: expectedMigrationVersion(state.latestAppliedMigrationVersion),
    reconciliationState: state.reconciliationState,
    pendingCount: state.pendingCount,
    schemaAppliedUntrackedCount: state.schemaAppliedUntrackedCount,
    unresolvedCount: state.unresolvedCount,
    releaseReady: state.releaseReady,
  });
}

export function qualityLedgerEnvironment(target) {
  return Object.freeze({
    PLAIVRA_EXPECTED_DATABASE_MIGRATION_VERSION: target.expectedMigration,
    PLAIVRA_MIGRATION_LEDGER_RECONCILIATION_STATE: target.reconciliationState,
    PLAIVRA_PENDING_MIGRATION_COUNT: String(target.pendingCount),
    PLAIVRA_SCHEMA_APPLIED_UNTRACKED_COUNT: String(target.schemaAppliedUntrackedCount),
    PLAIVRA_UNRESOLVED_MIGRATION_COUNT: String(target.unresolvedCount),
  });
}

function main() {
  const target = deriveQualityLedgerTarget(
    JSON.parse(readFileSync("supabase/migration-ledger.json", "utf8")),
  );
  const valueKeyIndex = process.argv.indexOf("--value");
  if (valueKeyIndex !== -1) {
    const key = process.argv[valueKeyIndex + 1];
    if (!key || !(key in target)) throw new Error("Unknown quality-ledger target value.");
    process.stdout.write(String(target[key]));
    return;
  }
  for (const [key, value] of Object.entries(qualityLedgerEnvironment(target))) {
    process.stdout.write(`${key}=${value}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
