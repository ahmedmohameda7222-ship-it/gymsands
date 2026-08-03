import { NextResponse } from "next/server";

import { TODAY_PROJECTION_CONTRACT_VERSION } from "@/lib/dashboard/today-projection-contract";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  readTodayProjectionV1,
  type TodayProjectionTimings,
} from "@/services/dashboard/today-projection-server";

export const runtime = "nodejs";

const TODAY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
  "X-Plaivra-Today-Contract": String(TODAY_PROJECTION_CONTRACT_VERSION),
} as const;

function withTodayHeaders(response: NextResponse, serverTiming?: string) {
  for (const [name, value] of Object.entries(TODAY_HEADERS)) {
    response.headers.set(name, value);
  }
  if (serverTiming) response.headers.set("Server-Timing", serverTiming);
  return response;
}

function safeError(code: string, status: number) {
  return withTodayHeaders(
    NextResponse.json(
      { error: "Today could not load.", code },
      { status },
    ),
  );
}

function parseDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return value;
}

function parseTimezone(value: string | null) {
  if (!value || value.length > 100) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    return null;
  }
}

function serverTiming(totalMs: number, timings: TodayProjectionTimings) {
  const metric = (name: string, duration: number) =>
    `${name};dur=${Math.max(0, duration).toFixed(1)}`;
  return [
    metric("total", totalMs),
    metric("workout", timings.workout),
    metric("meals", timings.meals),
    metric("nutrition_logs", timings.nutrition_logs),
    metric("nutrition_targets", timings.nutrition_targets),
    metric("hydration", timings.hydration),
    metric("shopping", timings.shopping),
    metric("habits", timings.habits),
    metric("supplements", timings.supplements),
    metric("sleep", timings.sleep),
    metric("profile_context", timings.profile_context),
    metric("progress_context", timings.progress_context),
  ].join(", ");
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "dashboard-today", 60, 60_000);
  if (limited) return withTodayHeaders(limited);

  const url = new URL(request.url);
  const date = parseDate(url.searchParams.get("date"));
  const timezone = parseTimezone(url.searchParams.get("timezone"));
  if (!date || !timezone) {
    return withTodayHeaders(
      NextResponse.json(
        {
          error: "A valid date and timezone are required.",
          code: "today_request_invalid",
        },
        { status: 400 },
      ),
    );
  }

  const context = await requireUser(request);
  if (context instanceof NextResponse) return withTodayHeaders(context);

  const startedAt = performance.now();
  try {
    const result = await readTodayProjectionV1({
      supabase: context.supabase,
      userId: context.user.id,
      date,
      timezone,
      now: new Date(),
    });
    return withTodayHeaders(
      NextResponse.json(result.response),
      serverTiming(performance.now() - startedAt, result.timings),
    );
  } catch {
    return safeError("today_projection_unavailable", 503);
  }
}
