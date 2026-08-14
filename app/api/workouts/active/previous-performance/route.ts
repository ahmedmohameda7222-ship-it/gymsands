import { NextResponse } from "next/server";

import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  readActiveWorkoutPreviousPerformance,
  type ActiveWorkoutPerformanceIdentity
} from "@/services/workouts/active-workout/previous-performance-server";

export const runtime = "nodejs";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization"
};

function validId(value: string) {
  return value.length > 0 && value.length <= 240 && !/[\u0000-\u001f]/u.test(value);
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "active-workout-previous-performance", 90, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(request.url);
  const allowed = new Set(["kind", "identity", "session", "set"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) {
    return NextResponse.json({ error: "Invalid previous-performance query." }, { status: 400, headers });
  }

  const kind = url.searchParams.get("kind");
  const value = url.searchParams.get("identity")?.trim() ?? "";
  const session = url.searchParams.get("session")?.trim() || null;
  const setRaw = url.searchParams.get("set");
  const setNumber = setRaw ? Number(setRaw) : null;
  if ((kind !== "plan_activity" && kind !== "source_workout") || !validId(value)
      || (session && !validId(session))
      || (setNumber !== null && (!Number.isInteger(setNumber) || setNumber < 1 || setNumber > 500))) {
    return NextResponse.json({ error: "Invalid previous-performance query." }, { status: 400, headers });
  }

  const identity: ActiveWorkoutPerformanceIdentity = { kind, value };
  try {
    const data = await readActiveWorkoutPreviousPerformance(auth.supabase, auth.user.id, identity, {
      excludeSessionId: session,
      setNumber
    });
    return NextResponse.json({ data }, { headers });
  } catch {
    return NextResponse.json(
      { error: "Previous performance is unavailable right now." },
      { status: 503, headers }
    );
  }
}
