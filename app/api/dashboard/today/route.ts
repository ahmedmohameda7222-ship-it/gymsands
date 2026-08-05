import { NextResponse } from "next/server";

import {
  TODAY_PROJECTION_CONTRACT_VERSION,
  type TodayProjectionResponseV1,
} from "@/lib/dashboard/today-projection-contract";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  REQUEST_ID_HEADER,
  resolveOperationalCorrelationId,
} from "@/lib/observability/correlation-id";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import {
  readTodayProjectionV1,
  type TodayProjectionDomainName,
  type TodayProjectionTimings,
} from "@/services/dashboard/today-projection-server";

export const runtime = "nodejs";

const TODAY_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
  "X-Content-Type-Options": "nosniff",
  "X-Plaivra-Today-Contract": String(TODAY_PROJECTION_CONTRACT_VERSION),
} as const;

const OBSERVED_DOMAINS = [
  "workout",
  "meals",
  "nutrition_logs",
  "nutrition_targets",
  "hydration",
  "shopping",
  "habits",
  "supplements",
  "sleep",
  "profile_context",
  "progress_context",
] as const satisfies readonly TodayProjectionDomainName[];

function boundedDuration(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(60_000, Math.max(0, Math.round(value * 10) / 10));
}

function withTodayHeaders(
  response: NextResponse,
  requestId: string,
  serverTimingValue?: string,
) {
  for (const [name, value] of Object.entries(TODAY_HEADERS)) {
    response.headers.set(name, value);
  }
  response.headers.set(REQUEST_ID_HEADER, requestId);
  if (serverTimingValue) {
    response.headers.set("Server-Timing", serverTimingValue);
    response.headers.set("X-Plaivra-Server-Timing", serverTimingValue);
  }
  return response;
}

function safeError(
  code: string,
  status: number,
  requestId: string,
  totalDurationMs?: number,
) {
  const timing =
    totalDurationMs === undefined
      ? undefined
      : `total;dur=${boundedDuration(totalDurationMs).toFixed(1)}`;
  return withTodayHeaders(
    NextResponse.json(
      { error: "Today could not load.", code },
      { status },
    ),
    requestId,
    timing,
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
    `${name};dur=${boundedDuration(duration).toFixed(1)}`;
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

function domainEnvelope(
  response: TodayProjectionResponseV1,
  domain: TodayProjectionDomainName,
) {
  if (domain === "workout") return response.workout;
  if (domain === "meals") return response.meals;
  if (domain === "nutrition_logs") return response.nutrition.logs;
  if (domain === "nutrition_targets") return response.nutrition.targets;
  if (domain === "hydration") return response.hydration;
  if (domain === "shopping") return response.shopping;
  if (domain === "habits") return response.wellness.habits;
  if (domain === "supplements") return response.wellness.supplements;
  if (domain === "sleep") return response.wellness.sleep;
  if (domain === "profile_context") return response.profileContext;
  return response.progressContext;
}

function logProjectionDomains(
  requestId: string,
  response: TodayProjectionResponseV1,
  timings: TodayProjectionTimings,
) {
  for (const domain of OBSERVED_DOMAINS) {
    const envelope = domainEnvelope(response, domain);
    logOperationalEvent({
      event: "today_projection_domain_completed",
      level: envelope.state === "failed" ? "warn" : "info",
      request_id: requestId,
      operation: domain,
      duration_ms: boundedDuration(timings[domain]),
      error_code:
        envelope.state === "failed" ? envelope.errorCode ?? undefined : undefined,
    });
  }
}

export async function GET(request: Request) {
  const requestId = resolveOperationalCorrelationId(
    request.headers.get(REQUEST_ID_HEADER),
  );
  const limited = rateLimit(request, "dashboard-today", 60, 60_000);
  if (limited) return withTodayHeaders(limited, requestId);

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
      requestId,
    );
  }

  const context = await requireUser(request);
  if (context instanceof NextResponse) {
    return withTodayHeaders(context, requestId);
  }

  const startedAt = performance.now();
  try {
    const result = await readTodayProjectionV1({
      supabase: context.supabase,
      userId: context.user.id,
      date,
      timezone,
      now: new Date(),
    });
    logProjectionDomains(requestId, result.response, result.timings);
    return withTodayHeaders(
      NextResponse.json(result.response),
      requestId,
      serverTiming(performance.now() - startedAt, result.timings),
    );
  } catch {
    const duration = performance.now() - startedAt;
    logOperationalEvent({
      event: "today_projection_request_failed",
      level: "error",
      request_id: requestId,
      operation: "projection",
      duration_ms: boundedDuration(duration),
      error_code: "today_projection_unavailable",
    });
    return safeError(
      "today_projection_unavailable",
      503,
      requestId,
      duration,
    );
  }
}
