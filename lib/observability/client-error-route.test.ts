import { beforeEach, describe, expect, it, vi } from "vitest";

const { getReleaseVersion, logOperationalEvent, rateLimit } = vi.hoisted(() => ({
  getReleaseVersion: vi.fn(),
  logOperationalEvent: vi.fn(),
  rateLimit: vi.fn()
}));
vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/release/version", () => ({ getReleaseVersion }));

import { POST } from "@/app/api/observability/client-error/route";
import { MAX_CLIENT_ERROR_BODY_BYTES } from "./client-error-request";

const release = {
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-07-14T01:00:00.000Z"
};

function validPayload() {
  return {
    eventId: "123e4567-e89b-42d3-a456-426614174000",
    fingerprint: "1234abcd",
    errorType: "TypeError",
    message: "Render failed for member@example.com",
    stack: "at https://app.plaivra.com/records/abcdefghijklmnopqrstuvwx/private?token=secret",
    componentStack: "at Record (/records/AbC123_-opaqueIdentifier987/private#details)",
    digest: "route_error",
    route: "/records/abcdefghijklmnopqrstuvwx/private?token=secret",
    boundarySource: "route",
    commitSha: release.commitSha,
    buildTimestamp: release.buildTimestamp,
    browser: "Chrome/150",
    hasTargets: true,
    hasFoodLogs: true,
    targetLoadState: "loaded",
    foodLogLoadState: "loaded"
  };
}

function request(body: string, headers: Record<string, string> = { "Content-Type": "application/json" }) {
  return new Request("https://app.plaivra.com/api/observability/client-error", {
    method: "POST",
    headers,
    body
  });
}

describe("client error intake", () => {
  beforeEach(() => {
    getReleaseVersion.mockReturnValue(release);
    logOperationalEvent.mockReset();
    rateLimit.mockReset();
    rateLimit.mockReturnValue(null);
  });

  it("accepts the strict envelope, sanitizes logged values, and never echoes error content", async () => {
    const response = await POST(request(JSON.stringify(validPayload())));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      error_code: "TypeError:route_error",
      error_message: "Render failed for [REDACTED]",
      stack: "at https://app.plaivra.com/records/id/private",
      component_stack: "at Record (/records/id/private)",
      route: "/records/id/private",
      release_metadata_match: true
    }));
    const serializedLog = JSON.stringify(logOperationalEvent.mock.calls);
    expect(serializedLog).not.toMatch(/member@example\.com|abcdefghijklmnopqrstuvwx|opaqueIdentifier987|token=secret/);
  });

  it("rejects unsupported fields", async () => {
    const response = await POST(request(JSON.stringify({ ...validPayload(), privatePrompt: "secret" })));
    expect(response.status).toBe(400);
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types", async () => {
    const response = await POST(request(JSON.stringify(validPayload()), { "Content-Type": "text/plain" }));
    expect(response.status).toBe(415);
  });

  it("rejects oversized bodies from declared and measured size", async () => {
    const declared = await POST(request("{}", {
      "Content-Type": "application/json",
      "Content-Length": String(MAX_CLIENT_ERROR_BODY_BYTES + 1)
    }));
    expect(declared.status).toBe(413);

    const measured = await POST(request(JSON.stringify({ value: "x".repeat(MAX_CLIENT_ERROR_BODY_BYTES) })));
    expect(measured.status).toBe(413);
  });

  it("rejects malformed JSON", async () => {
    const response = await POST(request("{"));
    expect(response.status).toBe(400);
  });

  it("rejects invalid commit and timestamp metadata", async () => {
    const invalidCommit = await POST(request(JSON.stringify({ ...validPayload(), commitSha: "abcdef1" })));
    expect(invalidCommit.status).toBe(400);
    const invalidTimestamp = await POST(request(JSON.stringify({ ...validPayload(), buildTimestamp: "not-a-time" })));
    expect(invalidTimestamp.status).toBe(400);
  });

  it("records client/server release metadata mismatch without exposing error content", async () => {
    const response = await POST(request(JSON.stringify({
      ...validPayload(),
      commitSha: "fce4f9dacd16ade098d1bbfc1eb6793d50cb5eb9"
    })));
    expect(response.status).toBe(202);
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ release_metadata_match: false }));
  });

  it("keeps rate limiting active before reading or validating the payload", async () => {
    rateLimit.mockReturnValueOnce(new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }));
    const response = await POST(request(JSON.stringify(validPayload())));
    expect(response.status).toBe(429);
    expect(rateLimit).toHaveBeenCalledWith(expect.any(Request), "client-error", 10, 60_000);
    expect(logOperationalEvent).not.toHaveBeenCalled();
  });
});
