import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { validateClientErrorPayload } from "@/lib/observability/client-error";
import { parseClientErrorRequestBody } from "@/lib/observability/client-error-request";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import { getReleaseVersion } from "@/lib/release/version";

function jsonResponse(status: number) {
  return NextResponse.json(
    { accepted: status === 202 },
    { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "client-error", 10, 60_000);
  if (limited) return limited;

  const raw = await request.text().catch(() => "");
  const parsedRequest = parseClientErrorRequestBody({
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    raw
  });
  if (!parsedRequest.ok) return jsonResponse(parsedRequest.status);

  const validation = validateClientErrorPayload(parsedRequest.payload);
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
