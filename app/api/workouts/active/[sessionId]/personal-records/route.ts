import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import { readWorkoutHistoryPersonalRecordSessions } from "@/services/personal-records/server";

export const runtime = "nodejs";

const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization"
};

export type ActiveWorkoutCanonicalPersonalRecord = {
  id: string;
  exerciseName: string;
  recordType: string;
  recordValue: number;
  recordUnit: string;
  achievedAt: string;
};

function isRenderedQaMockRequest(request: Request) {
  return env.useMockAuth
    && env.productionQaBuild
    && request.headers.get("authorization")?.trim() === "Bearer plaivra-local-qa";
}

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const limited = rateLimit(request, "active-workout-terminal-personal-records", 60, 60_000);
  if (limited) return limited;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "Workout session is invalid." }, { status: 400, headers });
  }
  if (isRenderedQaMockRequest(request)) {
    return NextResponse.json({ data: [] }, { headers });
  }
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const root = await auth.supabase
    .from("workout_sessions")
    .select("id,status,deleted_at")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (root.error) {
    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });
  }
  if (!root.data || root.data.status === "started" || root.data.deleted_at) {
    return NextResponse.json({ error: "Workout session is not terminal." }, { status: 409, headers });
  }

  try {
    const projected = await readWorkoutHistoryPersonalRecordSessions(
      auth.supabase,
      auth.user.id,
      [sessionId]
    );
    const data: ActiveWorkoutCanonicalPersonalRecord[] = (projected.eventsBySessionId[sessionId] ?? [])
      .map(({ event }) => ({
        id: event.eventId,
        exerciseName: event.subject.name,
        recordType: event.definition.key,
        recordValue: event.value,
        recordUnit: event.definition.canonicalUnit,
        achievedAt: event.achievedAt
      }))
      .sort((left, right) => right.achievedAt.localeCompare(left.achievedAt) || right.id.localeCompare(left.id));
    return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });
  }
}
