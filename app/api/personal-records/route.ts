import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import type { ManualPersonalRecordInput } from "@/lib/personal-records/contracts";
import { PersonalRecordsServerError, readPersonalRecordsMain, upsertManualPersonalRecord } from "@/services/personal-records/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };

function failure(error: unknown) {
  if (error instanceof PersonalRecordsServerError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return NextResponse.json({ error: "Personal records are unavailable right now.", code: "personal_records_failed" }, { status: 500, headers });
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "personal-records-read", 60, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const unknown = [...url.searchParams.keys()].find((key) => !["sport", "cursor", "limit"].includes(key));
  const limit = Number(url.searchParams.get("limit") ?? "20");
  const sport = url.searchParams.get("sport");
  const cursor = url.searchParams.get("cursor");
  if (unknown || !Number.isInteger(limit) || limit < 1 || limit > 50 || (sport && !/^[a-z0-9_]{1,80}$/.test(sport)) || (cursor && cursor.length > 400)) {
    return NextResponse.json({ error: "The Personal Records request is invalid.", code: "invalid_request" }, { status: 400, headers });
  }
  try {
    return NextResponse.json(await readPersonalRecordsMain(auth.supabase, auth.user.id, { sport, cursor, limit }), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "personal-records-write", 20, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (Number(request.headers.get("content-length") ?? 0) > 65_536) return NextResponse.json({ error: "The record draft is too large.", code: "payload_too_large" }, { status: 413, headers });
  try {
    const input = await request.json() as ManualPersonalRecordInput;
    const saved = await upsertManualPersonalRecord(auth.supabase, { ...input, eventId: null });
    return NextResponse.json({ eventId: String((saved as { id: string }).id) }, { status: 201, headers });
  } catch (error) { return failure(error); }
}
