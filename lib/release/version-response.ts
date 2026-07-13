import { evaluateReleaseReadiness, type DatabaseReleaseMarker } from "./readiness";
import type { ReleaseVersion } from "./version";

export function buildVersionResponse(release: ReleaseVersion, database: DatabaseReleaseMarker) {
  const readiness = evaluateReleaseReadiness(release, database);
  return {
    status: readiness.releaseReady ? 200 : 503,
    body: {
      ...release,
      expectedSchemaCompatibilityVersion: release.schemaCompatibilityVersion,
      databaseSchemaCompatibilityVersion: database.version,
      databaseMigrationVersion: database.migrationVersion,
      databaseMarkerAvailable: database.available,
      ...readiness,
      // Backward-compatible marker-only alias. It does not mean final readiness.
      schemaCompatible: readiness.schemaMarkerCompatible
    }
  } as const;
}
