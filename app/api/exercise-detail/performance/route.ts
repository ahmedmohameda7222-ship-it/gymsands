import { NextResponse } from "next/server";

import { requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { readExercisePerformance } from "@/services/exercise-detail/performance-server";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };
const identityPattern = /^(?:provider:[a-z0-9_]+:[a-zA-Z0-9_-]{1,128}|custom:[a-zA-Z0-9_-]{1,128}|global:[a-zA-Z0-9_-]{1,128})$/;

export async function GET(request: Request) {
  const limited = rateLimit(request, "exercise-detail-performance", 60, 60_000);
  if (limited) return limited;
  const auth = await requireUser(request);
  if (auth instanceof NextResponse) return auth;
  const url = new URL(request.url);
  const allowed = new Set(["identity", "limit", "timezone"]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return NextResponse.json({ error: "The performance request is invalid." }, { status: 400, headers });
  const identities = url.searchParams.getAll("identity").map((value) => value.trim()).filter(Boolean);
  const limit = Number(url.searchParams.get("limit") ?? 8);
  const timezone = url.searchParams.get("timezone")?.trim() || "UTC";
  if (!identities.length || identities.length > 5 || identities.some((value) => value.length > 240 || !identityPattern.test(value)) || !Number.isInteger(limit) || limit < 1 || limit > 12 || timezone.length > 80) {
    return NextResponse.json({ error: "The performance request is invalid." }, { status: 400, headers });
  }
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date()); }
  catch { return NextResponse.json({ error: "The performance request is invalid." }, { status: 400, headers }); }
  if (!serverEnv.workoutHistoryCursorSecret) return NextResponse.json({ error: "Performance is unavailable right now." }, { status: 503, headers });
  try {
    const data = await readExercisePerformance({ supabase: auth.supabase, userId: auth.user.id, identities, limit, cursorSecret: serverEnv.workoutHistoryCursorSecret, timezone });
    return NextResponse.json(data, { headers });
  } catch {
    return NextResponse.json({ error: "Performance is unavailable right now." }, { status: 503, headers });
  }
}
