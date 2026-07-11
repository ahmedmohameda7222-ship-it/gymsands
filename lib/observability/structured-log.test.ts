import { describe, expect, it } from "vitest";
import { redactOperationalValue, serializeOperationalLog } from "@/lib/observability/structured-log";

describe("structured operational logging", () => {
  it("redacts credentials, contact details, health fields, and free-text payloads", () => {
    const redacted = redactOperationalValue({
      authorization: "Bearer secret-token",
      contact: "member@example.com",
      weight_kg: 80,
      nested: { prompt: "private request", safe_code: "timeout" }
    }) as Record<string, unknown>;

    expect(redacted.authorization).toBe("[REDACTED]");
    expect(redacted.contact).toBe("[REDACTED]");
    expect(redacted.weight_kg).toBe("[REDACTED]");
    expect(redacted.nested).toEqual({ prompt: "[REDACTED]", safe_code: "timeout" });
  });

  it("emits bounded JSON with operational fields", () => {
    const parsed = JSON.parse(serializeOperationalLog({ event: "route_failed", level: "error", route: "/api/example", error_code: "timeout" }));
    expect(parsed).toMatchObject({ service: "plaivra-web", event: "route_failed", level: "error", route: "/api/example", error_code: "timeout" });
    expect(Date.parse(parsed.timestamp)).not.toBeNaN();
  });
});
