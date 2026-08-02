import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getReleaseVersion, logOperationalEvent, rateLimit } = vi.hoisted(() => ({
  getReleaseVersion: vi.fn(),
  logOperationalEvent: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/release/version", () => ({ getReleaseVersion }));

import { POST } from "@/app/api/observability/performance-metric/route";
import { MAX_PERFORMANCE_METRIC_BODY_BYTES } from "./performance-metric-request";

const release = {
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-08-02T20:00:00.000Z",
};

function validPayload() {
  return {
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    metricId: "v5-1234567890",
    metric: "LCP",
    value: 2200,
    delta: 200,
    rating: "good",
    route: "/dashboard",
    navigationType: "navigate",
    visibilityState: "visible",
    connectionType: "4g",
    commitSha: release.commitSha,
    buildTimestamp: release.buildTimestamp,
    browser: "Chrome/150",
  };
}

function request(body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new Request("https://app.plaivra.com/api/observability/performance-metric", {
    method: "POST",
    headers,
    body,
  });
}

describe("performance metric intake", () => {
  beforeEach(() => {
    vi.stubEnv("VERCEL_REGION", "fra1");
    getReleaseVersion.mockReturnValue(release);
    logOperationalEvent.mockReset();
    rateLimit.mockReset();
    rateLimit.mockReturnValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts a metric and logs its budget and compute region without user data", async () => {
    const response = await POST(request(JSON.stringify(validPayload())));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: "performance_metric",
      metric: "LCP",
      metric_value: 2200,
      metric_unit: "ms",
      budget_maximum: 2500,
      within_budget: true,
      compute_region: "fra1",
      release_metadata_match: true,
    }));
    expect(JSON.stringify(logOperationalEvent.mock.calls)).not.toMatch(/user_id|email|prompt|notes/);
  });

  it("records release mismatches without rejecting otherwise valid telemetry", async () => {
    const response = await POST(request(JSON.stringify({
      ...validPayload(),
      commitSha: "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9",
    })));
    expect(response.status).toBe(202);
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      release_metadata_match: false,
    }));
  });

  it("rejects malformed, unsupported, and oversized requests", async () => {
    expect((await POST(request("{"))).status).toBe(400);
    expect((await POST(request(JSON.stringify(validPayload()), { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("{}", {
      "Content-Type": "application/json",
      "Content-Length": String(MAX_PERFORMANCE_METRIC_BODY_BYTES + 1),
    }))).status).toBe(413);
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it("applies rate limiting before reading or validating the body", async () => {
    rateLimit.mockReturnValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    const response = await POST(request(JSON.stringify(validPayload())));
    expect(response.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledWith(expect.any(Request), "performance-metric", 120, 60_000);
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });
});
