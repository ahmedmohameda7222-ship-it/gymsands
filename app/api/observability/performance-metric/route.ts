import crypto from "node:crypto";
import { NextResponse } from "next/server";

import performanceBudgets from "@/config/performance-budgets.json";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { validatePerformanceMetricPayload } from "@/lib/observability/performance-metric";
import { parsePerformanceMetricRequestBody } from "@/lib/observability/performance-metric-request";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import { getReleaseVersion } from "@/lib/release/version";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonResponse(status: number) {
  return NextResponse.json(
    { accepted: status === 202 },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "performance-metric", 120, 60_000);
  if (limited) return limited;

  const raw = await request.text().catch(() => "");
  const parsedRequest = parsePerformanceMetricRequestBody({
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    raw,
  });
  if (!parsedRequest.ok) return jsonResponse(parsedRequest.status);

  const validation = validatePerformanceMetricPayload(parsedRequest.payload);
  if (!validation.ok) return jsonResponse(400);

  const report = validation.value;
  const release = getReleaseVersion();
  const releaseMetadataMatch = report.commitSha === release.commitSha
    && report.buildTimestamp === release.buildTimestamp;
  const metricBudgets = performanceBudgets.metrics as Record<
    string,
    { unit: string; p75Maximum: number }
  >;
  const budget = metricBudgets[report.metric];
  const computeRegion = process.env.VERCEL_REGION?.trim() || "local";

  logOperationalEvent({
    event: "performance_metric",
    level: "info",
    request_id: crypto.randomUUID(),
    route: report.route,
    outcome: "success",
    metric: report.metric,
    metric_value: report.value,
    metric_delta: report.delta,
    metric_rating: report.rating,
    metric_unit: budget?.unit,
    budget_maximum: budget?.p75Maximum,
    within_budget: budget ? report.value <= budget.p75Maximum : undefined,
    navigation_type: report.navigationType,
    visibility_state: report.visibilityState,
    connection_type: report.connectionType,
    compute_region: computeRegion,
    client_event_id: report.eventId,
    commit_sha: release.commitSha,
    build_timestamp: release.buildTimestamp,
    client_commit_sha: report.commitSha,
    client_build_timestamp: report.buildTimestamp,
    release_metadata_match: releaseMetadataMatch,
    browser: report.browser,
  });

  return jsonResponse(202);
}
