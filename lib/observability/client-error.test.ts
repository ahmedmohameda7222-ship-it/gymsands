import { describe, expect, it } from "vitest";
import {
  clientErrorFingerprint,
  coarseBrowser,
  sanitizeClientErrorText,
  sanitizeClientRoute,
  validateClientErrorPayload
} from "./client-error";
import { MAX_CLIENT_ERROR_BODY_BYTES, parseClientErrorRequestBody } from "./client-error-request";
import { serializeOperationalLog } from "./structured-log";

const validPayload = {
  eventId: "123e4567-e89b-42d3-a456-426614174000",
  fingerprint: "1234abcd",
  errorType: "TypeError",
  message: "Maximum update depth exceeded",
  stack: "TypeError: Maximum update depth exceeded\n at Dashboard (https://app.plaivra.com/dashboard?token=secret:1:2)",
  componentStack: "at TodayDashboard\nat QuickChatGptProvider",
  digest: "route_error",
  route: "/dashboard?record=123e4567-e89b-42d3-a456-426614174000",
  boundarySource: "route" as const,
  commitSha: "60a204d5fc20fc396be1b1b47e748c42ebba6abf",
  buildTimestamp: "2026-07-14T01:00:00.000Z",
  browser: "Chrome/150",
  hasTargets: true,
  hasFoodLogs: true,
  targetLoadState: "loaded" as const,
  foodLogLoadState: "loaded" as const
};

describe("client error telemetry", () => {
  it("redacts tokens, identifiers, quoted values, SQL values, and query strings", () => {
    const unsafe = [
      "Bearer abc.def.ghi",
      "eyJheader.payload.signature",
      "member@example.com",
      "123e4567-e89b-42d3-a456-426614174000",
      "cookie: session=private",
      "authorization: Basic private",
      "food was 'Owner-authored meal'",
      "workout was \"Private workout\"",
      "note was `Private note`",
      "Key (food_name)=(Private food)",
      "https://app.plaivra.com/records/abcdefghijklmnopqrstuvwx/private",
      "https://app.plaivra.com/records/123456789/private",
      "https://app.plaivra.com/dashboard?token=secret#private"
    ].join(" | ");
    const safe = sanitizeClientErrorText(unsafe, 3000);
    for (const secret of [
      "member@example.com",
      "123e4567-e89b-42d3-a456-426614174000",
      "session=private",
      "Basic private",
      "Owner-authored meal",
      "Private workout",
      "Private note",
      "Private food",
      "abcdefghijklmnopqrstuvwx",
      "123456789",
      "token=secret",
      "#private"
    ]) {
      expect(safe).not.toContain(secret);
    }
    expect(safe).toContain("/records/id/private");
    expect(safe.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(9);
  });

  it("truncates long strings and removes route queries and dynamic record identifiers", () => {
    expect(sanitizeClientErrorText("x".repeat(1000), 100)).toHaveLength(100);
    expect(sanitizeClientRoute("https://app.plaivra.com/dashboard?token=secret#private")).toBe("/dashboard");
    expect(sanitizeClientRoute("/my-workout/plans/123e4567-e89b-42d3-a456-426614174000/edit?token=secret"))
      .toBe("/my-workout/plans/id/edit");
    expect(sanitizeClientRoute("/records/abcdefghijklmnopqrstuvwx/private")).toBe("/records/id/private");
    expect(sanitizeClientRoute("/records/AbC123_-opaqueIdentifier987/private")).toBe("/records/id/private");
    expect(sanitizeClientRoute("/records/123456789/private")).toBe("/records/id/private");
    expect(sanitizeClientRoute("/settings/chatgpt-connection/private")).toBe("/settings/chatgpt-connection/private");
    expect(sanitizeClientRoute("javascript:alert(1)")).toBe("/unknown");
  });

  it("preserves safe stack structure after credential removal", () => {
    const safe = sanitizeClientErrorText([
      "cookie: session=private",
      "at https://app.plaivra.com/records/abcdefghijklmnopqrstuvwx/private?token=secret#fragment",
      "authorization: Basic private",
      "at /my-workout/plans/123e4567-e89b-42d3-a456-426614174000/edit?debug=private"
    ].join(" | "), 3000);
    expect(safe).toContain("cookie: [REDACTED] | at https://app.plaivra.com/records/id/private");
    expect(safe).toContain("authorization: [REDACTED] | at /my-workout/plans/id/edit");
    expect(safe).not.toMatch(/session=private|Basic private|token=secret|fragment|debug=private/);
  });

  it("accepts only the allowlisted envelope and sanitizes accepted strings again", () => {
    const result = validateClientErrorPayload({
      ...validPayload,
      message: "Failed for member@example.com and 123e4567-e89b-42d3-a456-426614174000",
      stack: "at https://app.plaivra.com/records/abcdefghijklmnopqrstuvwx/private?token=secret",
      componentStack: "at Record (/records/AbC123_-opaqueIdentifier987/private#details)"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.message).toBe("Failed for [REDACTED] and [REDACTED]");
    expect(result.value.stack).toBe("at https://app.plaivra.com/records/id/private");
    expect(result.value.componentStack).toBe("at Record (/records/id/private)");
    expect(result.value.route).toBe("/dashboard");
  });

  it("rejects missing, malformed, and nested unexpected fields", () => {
    expect(validateClientErrorPayload({ ...validPayload, commitSha: "abcdef1" }).ok).toBe(false);
    expect(validateClientErrorPayload({ ...validPayload, buildTimestamp: "unknown" }).ok).toBe(false);
    expect(validateClientErrorPayload({ ...validPayload, unexpected: { token: "secret" } }).ok).toBe(false);
    expect(validateClientErrorPayload({ ...validPayload, fingerprint: "not-valid" }).ok).toBe(false);
  });

  it("uses stable sanitized fingerprints and coarse browser versions", () => {
    expect(clientErrorFingerprint("TypeError", "Maximum update depth", "/dashboard", "route"))
      .toBe(clientErrorFingerprint("TypeError", "Maximum update depth", "/dashboard", "route"));
    expect(coarseBrowser("Mozilla/5.0 Chrome/150.0.0.0 Safari/537.36")).toBe("Chrome/150");
    expect(coarseBrowser("private custom agent")).toBe("Unknown/0");
  });

  it("rejects unsupported content types, invalid JSON, and oversized bodies", () => {
    expect(parseClientErrorRequestBody({ contentType: "text/plain", raw: "{}" })).toEqual({ ok: false, status: 415 });
    expect(parseClientErrorRequestBody({ contentType: "application/json", raw: "{" })).toEqual({ ok: false, status: 400 });
    expect(parseClientErrorRequestBody({
      contentType: "application/json",
      contentLength: String(MAX_CLIENT_ERROR_BODY_BYTES + 1),
      raw: "{}"
    })).toEqual({ ok: false, status: 413 });
    expect(parseClientErrorRequestBody({
      contentType: "application/json",
      raw: JSON.stringify({ value: "x".repeat(MAX_CLIENT_ERROR_BODY_BYTES) })
    })).toEqual({ ok: false, status: 413 });
  });

  it("serializes safe structured fields without leaking nested sensitive values", () => {
    const serialized = serializeOperationalLog({
      event: "client_error_boundary",
      level: "error",
      error_type: "TypeError",
      error_message: "Bearer private member@example.com",
      stack: "at https://app.plaivra.com/dashboard?token=secret",
      commit_sha: validPayload.commitSha,
      client_event_id: validPayload.eventId
    });
    expect(serialized).not.toContain("member@example.com");
    expect(serialized).not.toContain("Bearer private");
    expect(serialized).not.toContain("token=secret");
    expect(serialized).toContain("client_error_boundary");
  });
});
