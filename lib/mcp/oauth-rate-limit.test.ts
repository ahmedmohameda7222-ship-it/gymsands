import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdmin: vi.fn() }));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createAdmin }));
vi.mock("@/lib/integrations/env", () => ({
  serverEnv: {
    plaivraMcpTokenSecret: "test-secret",
    plaivraOAuthIssuer: "https://plaivra.com",
    plaivraMcpBaseUrl: "https://plaivra.com/api/mcp",
    plaivraAllowLegacyMcpClientId: false,
    plaivraCimdAllowedOrigins: "https://chatgpt.com"
  }
}));

import { oauthRateLimit } from "@/lib/mcp/oauth";

describe("OAuth rate-limit infrastructure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a request only when the database limiter explicitly allows it", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ allowed: true, reset_at: null }], error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toBeNull();
  });

  it("returns 429 when the database limiter rejects the request", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ allowed: false, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 429 });
  });

  it("fails closed with 503 when limiter state is unavailable", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 503 });
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 503 });
  });
});
