import { NextResponse } from "next/server";

import {
  createSupabaseServerClient,
  requireUser,
  serverEnv,
} from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import {
  replaceVerifiedRecordsForSession,
  VerifiedRecordError,
} from "@/services/workouts/history/verified-records";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  const limited = rateLimit(request, "workout-history-record-refresh", 20, 60_000);
  if (limited) return limited;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "Workout session is invalid.", code: "invalid_session" }, { status: 400 });
  }
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  if (!serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json(
      { error: "Workout records could not be refreshed.", code: "verified_records_unavailable" },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  try {
    // Authentication and account-state checks are performed with the member
    // client above. The write projection itself is service-role only so a
    // browser cannot choose and submit a forged derived value directly.
    const authority = createSupabaseServerClient(null, true);
    const result = await replaceVerifiedRecordsForSession(
      authority,
      auth.user.id,
      sessionId,
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof VerifiedRecordError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    return NextResponse.json({ error: "Workout records could not be refreshed.", code: "verified_records_failed" }, { status: 500 });
  }
}
