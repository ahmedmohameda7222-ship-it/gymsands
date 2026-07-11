import { describe, expect, it, vi } from "vitest";

const logOperationalEvent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/observability/structured-log", () => ({ logOperationalEvent }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: () => null }));

import { POST } from "@/app/api/observability/client-error/route";

describe("client error intake", () => {
  it("accepts only bounded codes and routes and ignores supplied private text", async () => {
    const response = await POST(new Request("https://app.plaivra.com/api/observability/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_code: "render_failed", digest: "digest_1", route: "/settings/account", message: "member@example.com secret prompt" })
    }));
    expect(response.status).toBe(202);
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ error_code: "render_failed:digest_1", route: "/settings/account" }));
    expect(JSON.stringify(logOperationalEvent.mock.calls)).not.toContain("member@example.com");
  });

  it("replaces unsafe route and digest values", async () => {
    await POST(new Request("https://app.plaivra.com/api/observability/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error_code: "x".repeat(200), digest: "bad digest/token", route: "https://evil.example/?token=secret" })
    }));
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({ error_code: "client_render_error", route: "/unknown" }));
  });
});
