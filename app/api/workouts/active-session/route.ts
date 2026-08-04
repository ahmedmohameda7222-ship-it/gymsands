import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { isUuid } from "@/lib/utils";
import type { WorkoutSession } from "@/types";

export const runtime = "nodejs";

const ACTIVE_SESSION_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
} as const;

function withHeaders(response: NextResponse) {
  for (const [name, value] of Object.entries(ACTIVE_SESSION_HEADERS)) {
    response.headers.set(name, value);
  }
  return response;
}

function safeError(status: number) {
  return withHeaders(
    NextResponse.json(
      {
        error: "Active workout could not load.",
        code: "active_workout_session_unavailable",
      },
      { status },
    ),
  );
}

function optionalUuid(value: string | null) {
  if (value === null || value === "") return null;
  return isUuid(value) ? value : undefined;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "active-workout-session", 120, 60_000);
  if (limited) return withHeaders(limited);

  const context = await requireUser(request);
  if (context instanceof NextResponse) return withHeaders(context);

  const url = new URL(request.url);
  const candidateSessionId = optionalUuid(
    url.searchParams.get("candidateSessionId"),
  );
  const workoutId = optionalUuid(url.searchParams.get("workoutId"));
  if (candidateSessionId === undefined || workoutId === undefined) {
    return withHeaders(
      NextResponse.json(
        {
          error: "Active workout request is invalid.",
          code: "active_workout_session_request_invalid",
        },
        { status: 400 },
      ),
    );
  }

  try {
    if (candidateSessionId) {
      const candidate = await context.supabase
        .from("workout_sessions")
        .select("*")
        .eq("id", candidateSessionId)
        .eq("user_id", context.user.id)
        .eq("status", "started")
        .maybeSingle();
      if (candidate.error) return safeError(503);
      if (candidate.data) {
        return withHeaders(
          NextResponse.json({
            session: candidate.data as WorkoutSession,
          }),
        );
      }
    }

    let query = context.supabase
      .from("workout_sessions")
      .select("*")
      .eq("user_id", context.user.id)
      .eq("status", "started");
    if (workoutId) query = query.eq("workout_id", workoutId);

    const latest = await query
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest.error) return safeError(503);

    return withHeaders(
      NextResponse.json({
        session: (latest.data as WorkoutSession | null) ?? null,
      }),
    );
  } catch {
    return safeError(503);
  }
}
