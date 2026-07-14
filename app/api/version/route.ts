import { NextResponse } from "next/server";
import { getDatabaseSchemaCompatibility } from "@/lib/release/database-compatibility";
import { getReleaseVersion } from "@/lib/release/version";
import { buildVersionResponse } from "@/lib/release/version-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const release = getReleaseVersion();
  const database = await getDatabaseSchemaCompatibility();
  const response = buildVersionResponse(release, database);

  return NextResponse.json(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
