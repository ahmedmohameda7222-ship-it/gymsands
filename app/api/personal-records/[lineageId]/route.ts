import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { PersonalRecordsServerError, readPersonalRecordLineage } from "@/services/personal-records/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };

export async function GET(request: Request, context: { params: Promise<{ lineageId: string }> }) {
  const limited = rateLimit(request, "personal-record-lineage-read", 60, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { lineageId } = await context.params;
  const url = new URL(request.url);
  const unknown = [...url.searchParams.keys()].find((key) => !["event", "cursor", "limit"].includes(key));
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const cursor = url.searchParams.get("cursor");
  const selectedEventId = url.searchParams.get("event");
  if (unknown || !/^pr_[A-Za-z0-9_-]{32}$/.test(lineageId) || !Number.isInteger(limit) || limit < 1 || limit > 50 || (cursor && cursor.length > 400) || (selectedEventId && !/^[0-9a-f-]{36}$/i.test(selectedEventId))) {
    return NextResponse.json({ error: "The Personal Record request is invalid.", code: "invalid_request" }, { status: 400, headers });
  }
  try {
    const detail = await readPersonalRecordLineage(auth.supabase, auth.user.id, lineageId, { selectedEventId, cursor, limit });
    return detail ? NextResponse.json(detail, { headers }) : NextResponse.json({ error: "Record no longer available.", code: "record_not_found" }, { status: 404, headers });
  } catch (error) {
    if (error instanceof PersonalRecordsServerError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return NextResponse.json({ error: "The Personal Record is unavailable right now.", code: "personal_record_failed" }, { status: 500, headers });
  }
}
