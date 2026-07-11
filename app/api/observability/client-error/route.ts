import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { logOperationalEvent } from "@/lib/observability/structured-log";

const SAFE_CODE = /^[a-z0-9_.-]{1,80}$/i;
const SAFE_ROUTE = /^\/[a-z0-9/_-]{0,160}$/i;

export async function POST(request: Request) {
  const limited = rateLimit(request, "client-error", 10, 60_000);
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const errorCode = typeof body.error_code === "string" && SAFE_CODE.test(body.error_code) ? body.error_code : "client_render_error";
  const route = typeof body.route === "string" && SAFE_ROUTE.test(body.route) ? body.route : "/unknown";
  const digest = typeof body.digest === "string" && SAFE_CODE.test(body.digest) ? body.digest : undefined;
  const requestId = crypto.randomUUID();

  logOperationalEvent({ event: "client_error_boundary", level: "error", request_id: requestId, route, outcome: "error", error_code: digest ? `${errorCode}:${digest}` : errorCode });
  return NextResponse.json({ received: true, request_id: requestId }, { status: 202, headers: { "Cache-Control": "no-store" } });
}
