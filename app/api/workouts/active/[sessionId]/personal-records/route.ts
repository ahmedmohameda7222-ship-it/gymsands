import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";

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

export async function GET(
  request: Request,
  context: { params: Promise<{ sessionId: string }> }
) {
  const limited = rateLimit(request, "active-workout-terminal-personal-records", 60, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const { sessionId } = await context.params;
  if (!isUuid(sessionId)) {
    return NextResponse.json({ error: "Workout session is invalid." }, { status: 400, headers });
  }

  const root = await auth.supabase
    .from("workout_sessions")
    .select("id,status")
    .eq("id", sessionId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (root.error) {
    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });
  }
  if (!root.data || root.data.status === "started") {
    return NextResponse.json({ error: "Workout session is not terminal." }, { status: 409, headers });
  }

  const result = await auth.supabase
    .from("personal_records")
    .select("id,exercise_name,derived_record_type,record_value,record_unit,achieved_at")
    .eq("user_id", auth.user.id)
    .eq("workout_session_id", sessionId)
    .eq("source_kind", "workout_derived")
    .not("derived_record_type", "is", null)
    .not("record_value", "is", null)
    .not("record_unit", "is", null)
    .not("achieved_at", "is", null)
    .order("achieved_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(50);

  if (result.error) {
    return NextResponse.json({ error: "Personal records are unavailable right now." }, { status: 503, headers });
  }

  const data: ActiveWorkoutCanonicalPersonalRecord[] = (result.data ?? []).map((row) => ({
    id: String(row.id),
    exerciseName: String(row.exercise_name),
    recordType: String(row.derived_record_type),
    recordValue: Number(row.record_value),
    recordUnit: String(row.record_unit),
    achievedAt: String(row.achieved_at)
  })).filter((row) => Number.isFinite(row.recordValue));

  return NextResponse.json({ data }, { headers });
}
