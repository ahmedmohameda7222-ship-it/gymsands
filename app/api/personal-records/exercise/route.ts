import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { PersonalRecordsServerError, readExercisePersonalRecords } from "@/services/personal-records/server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };

export async function GET(request: Request) {
  const limited = rateLimit(request, "exercise-personal-records-read", 60, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const identity = url.searchParams.get("identity")?.trim() ?? "";
  if ([...url.searchParams.keys()].some((key) => key !== "identity") || !identity || identity.length > 240 || /[\u0000-\u001f]/.test(identity)) {
    return NextResponse.json({ error: "The exercise identity is invalid.", code: "invalid_identity" }, { status: 400, headers });
  }
  try { return NextResponse.json(await readExercisePersonalRecords(auth.supabase, auth.user.id, [identity]), { headers }); }
  catch (error) {
    if (error instanceof PersonalRecordsServerError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers });
    return NextResponse.json({ error: "Performance is unavailable right now.", code: "exercise_records_failed" }, { status: 500, headers });
  }
}
