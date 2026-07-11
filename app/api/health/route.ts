import { NextResponse } from "next/server";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const version = getReleaseVersion();
  return NextResponse.json({
    status: "ok",
    checkedAt: new Date().toISOString(),
    release: {
      commitSha: version.commitSha,
      environment: version.environment,
      schemaCompatibilityVersion: version.schemaCompatibilityVersion
    }
  }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
