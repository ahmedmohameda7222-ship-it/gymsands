const RESOLVED_MIGRATION_STATES = new Set(["applied", "applied_version_alias"]);
const SAFE_SCHEMA_VERSION = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SAFE_MIGRATION_VERSION = /^\d{12,14}$/;

function assertContract(condition, message) {
  if (!condition) throw new Error(`Invalid release compatibility contract: ${message}`);
}

export function resolveReleaseCompatibilityContract({ ledger, contract }) {
  assertContract(ledger && typeof ledger === "object" && !Array.isArray(ledger), "ledger must be an object");
  assertContract(contract && typeof contract === "object" && !Array.isArray(contract), "contract must be an object");
  assertContract(contract.contractVersion === 1, "unsupported contract version");
  assertContract(
    typeof contract.schemaCompatibilityVersion === "string"
      && SAFE_SCHEMA_VERSION.test(contract.schemaCompatibilityVersion),
    "schema compatibility version is malformed",
  );
  assertContract(
    typeof contract.databaseMigrationMarkerVersion === "string"
      && SAFE_MIGRATION_VERSION.test(contract.databaseMigrationMarkerVersion),
    "database migration marker version is malformed",
  );

  const entries = Array.isArray(ledger.entries) ? ledger.entries : [];
  const resolvedEntries = entries.filter(
    (entry) => entry
      && typeof entry === "object"
      && RESOLVED_MIGRATION_STATES.has(entry.state)
      && typeof entry.productionVersion === "string"
      && SAFE_MIGRATION_VERSION.test(entry.productionVersion),
  );
  assertContract(resolvedEntries.length > 0, "ledger has no resolved migration entries");

  const markerEntry = resolvedEntries.find(
    (entry) => entry.productionVersion === contract.databaseMigrationMarkerVersion,
  );
  assertContract(Boolean(markerEntry), "database marker is not a resolved production migration");

  const latestAppliedMigrationVersion = [...resolvedEntries]
    .sort((left, right) => left.productionVersion.localeCompare(right.productionVersion))
    .at(-1).productionVersion;
  assertContract(
    contract.databaseMigrationMarkerVersion.localeCompare(latestAppliedMigrationVersion) <= 0,
    "database marker is newer than the latest applied migration",
  );

  const pendingMigrationCount = entries.filter((entry) => entry?.state === "pending").length;
  const schemaAppliedUntrackedCount = entries.filter(
    (entry) => entry?.state === "applied_schema_untracked",
  ).length;
  const unresolvedMigrationCount = entries.filter(
    (entry) => !RESOLVED_MIGRATION_STATES.has(entry?.state),
  ).length;

  return {
    schemaCompatibilityVersion: contract.schemaCompatibilityVersion,
    expectedDatabaseMigrationVersion: contract.databaseMigrationMarkerVersion,
    latestAppliedMigrationVersion,
    migrationLedgerReconciliationState: ledger.historyRepair?.state || "unknown",
    pendingMigrationCount,
    schemaAppliedUntrackedCount,
    unresolvedMigrationCount,
  };
}
