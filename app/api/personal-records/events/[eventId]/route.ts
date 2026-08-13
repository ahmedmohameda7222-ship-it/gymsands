import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import type { ManualPersonalRecordInput } from "@/lib/personal-records/contracts";
import { isUuid } from "@/lib/utils";
import { deleteManualPersonalRecord, PersonalRecordsServerError, upsertManualPersonalRecord } from "@/services/personal-records/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };
function failure(error: unknown) {
  if (error instanceof PersonalRecordsServerError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return NextResponse.json({ error: "The personal record could not be changed.", code: "personal_record_mutation_failed" }, { status: 500, headers });
}

export async function PATCH(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const limited = rateLimit(request, "personal-records-write", 20, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = await context.params;
  if (!isUuid(eventId)) return NextResponse.json({ error: "The personal record is invalid.", code: "invalid_event" }, { status: 400, headers });
  try {
    const input = await request.json() as ManualPersonalRecordInput;
    const saved = await upsertManualPersonalRecord(auth.supabase, { ...input, eventId });
    return NextResponse.json({ eventId: String((saved as { id: string }).id) }, { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ eventId: string }> }) {
  const limited = rateLimit(request, "personal-records-write", 20, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { eventId } = await context.params;
  if (!isUuid(eventId)) return NextResponse.json({ error: "The personal record is invalid.", code: "invalid_event" }, { status: 400, headers });
  try { return NextResponse.json(await deleteManualPersonalRecord(auth.supabase, eventId), { headers }); }
  catch (error) { return failure(error); }
}
