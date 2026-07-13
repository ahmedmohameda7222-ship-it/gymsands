import { NextResponse } from "next/server";
import { getDatabaseSchemaCompatibility } from "@/lib/release/database-compatibility";
import { evaluateReleaseReadiness } from "@/lib/release/readiness";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getReleaseVersion();
  const database = await getDatabaseSchemaCompatibility();
  const readiness = evaluateReleaseReadiness(release, database);

  return NextResponse.json({
    ...release,
    expectedSchemaCompatibilityVersion: release.schemaCompatibilityVersion,
    databaseSchemaCompatibilityVersion: database.version,
    databaseMigrationVersion: database.migrationVersion,
    databaseMarkerAvailable: database.available,
    ...readiness,
    // Backward-compatible alias. This refers only to the compatibility marker,
    // not physical-schema or final release readiness.
    schemaCompatible: readiness.schemaMarkerCompatible
  }, {
    status: readiness.releaseReady ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
