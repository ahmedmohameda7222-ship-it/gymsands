import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { validateClientErrorPayload } from "@/lib/observability/client-error";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import { getReleaseVersion } from "@/lib/release/version";

const MAX_BODY_BYTES = 16 * 1024;

function jsonResponse(status: number) {
  return NextResponse.json(
    { accepted: status === 202 },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "client-error", 10, 60_000);
  if (limited) return limited;

  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") return jsonResponse(415);

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return jsonResponse(413);

  const raw = await request.text().catch(() => "");
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return jsonResponse(raw ? 413 : 400);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return jsonResponse(400);
  }

  const validation = validateClientErrorPayload(parsed);
  if (!validation.ok) return jsonResponse(400);

  const report = validation.value;
  const release = getReleaseVersion();
  const requestId = crypto.randomUUID();
  const releaseMetadataMatch = report.commitSha === release.commitSha
    && report.buildTimestamp === release.buildTimestamp;

  logOperationalEvent({
    event: "client_error_boundary",
    level: "error",
    request_id: requestId,
    route: report.route,
    outcome: "error",
    error_code: report.digest ? `${report.errorType}:${report.digest}` : report.errorType,
    error_type: report.errorType,
    error_message: report.message,
    stack: report.stack,
    component_stack: report.componentStack,
    boundary_source: report.boundarySource,
    fingerprint: report.fingerprint,
    client_event_id: report.eventId,
    commit_sha: release.commitSha,
    build_timestamp: release.buildTimestamp,
    client_commit_sha: report.commitSha,
    client_build_timestamp: report.buildTimestamp,
    release_metadata_match: releaseMetadataMatch,
    browser: report.browser,
    has_targets: report.hasTargets,
    has_food_logs: report.hasFoodLogs,
    target_load_state: report.targetLoadState,
    food_log_load_state: report.foodLogLoadState
  });

  return jsonResponse(202);
}
