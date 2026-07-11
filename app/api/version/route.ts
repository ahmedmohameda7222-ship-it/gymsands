import { NextResponse } from "next/server";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getReleaseVersion(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
