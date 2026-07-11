import { NextResponse } from "next/server";
import { getDatabaseSchemaCompatibility } from "@/lib/release/database-compatibility";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getReleaseVersion();
  const database = await getDatabaseSchemaCompatibility();
  const schemaCompatible = database.available && database.version === release.schemaCompatibilityVersion;
  return NextResponse.json({
    ...release,
    expectedSchemaCompatibilityVersion: release.schemaCompatibilityVersion,
    databaseSchemaCompatibilityVersion: database.version,
    databaseMigrationVersion: database.migrationVersion,
    schemaCompatible
  }, {
    status: schemaCompatible ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
