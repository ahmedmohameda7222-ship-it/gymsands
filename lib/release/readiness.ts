import { isReleaseArtifactIdentityValid, type ReleaseVersion } from "./version";

export type DatabaseReleaseMarker = {
  available: boolean;
  version: string;
  migrationVersion: string | null;
};

export type ReleaseReadiness = {
  artifactIdentityValid: boolean;
  schemaMarkerCompatible: boolean;
  migrationVersionCompatible: boolean;
  migrationLedgerReconciled: boolean;
  releaseReady: boolean;
};

export function evaluateReleaseReadiness(
  release: ReleaseVersion,
  database: DatabaseReleaseMarker
): ReleaseReadiness {
  const artifactIdentityValid = isReleaseArtifactIdentityValid(release);
  const schemaMarkerCompatible = database.available
    && database.version === release.schemaCompatibilityVersion;
  const migrationVersionCompatible = database.available
    && database.migrationVersion !== null
    && database.migrationVersion === release.expectedDatabaseMigrationVersion;
  const migrationLedgerReconciled = release.migrationLedgerReconciliationState === "reconciled"
    && release.schemaAppliedUntrackedCount === 0;
  const releaseReady = artifactIdentityValid
    && schemaMarkerCompatible
    && migrationVersionCompatible
    && migrationLedgerReconciled;

  return {
    artifactIdentityValid,
    schemaMarkerCompatible,
    migrationVersionCompatible,
    migrationLedgerReconciled,
    releaseReady
  };
}
