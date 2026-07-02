import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  getSavedUserAiScopes: vi.fn(),
  rotateMcpConnection: vi.fn(),
  oauthRateLimit: vi.fn(),
  createConnectionToken: vi.fn(() => "plaivra_mcp_test_token"),
  hashConnectionToken: vi.fn(() => "hashed-test-token"),
  serverEnv: {
    supabaseServiceRoleKey: "service-role-test-key",
    plaivraMcpTokenSecret: "mcp-test-secret",
    plaivraAllowLegacyMcpClientId: false
  }
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
  serverEnv: mocks.serverEnv
}));
vi.mock("@/lib/server/supabase-admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));
vi.mock("@/lib/mcp/connections", () => ({
  getSavedUserAiScopes: mocks.getSavedUserAiScopes,
  rotateMcpConnection: mocks.rotateMcpConnection
}));
vi.mock("@/lib/mcp/oauth", () => ({ oauthRateLimit: mocks.oauthRateLimit }));
vi.mock("@/lib/mcp/auth", () => ({
  createConnectionToken: mocks.createConnectionToken,
  hashConnectionToken: mocks.hashConnectionToken
}));

import { DELETE, GET, POST } from "@/app/api/mcp/connections/route";
import { MCP_FULL_ACCESS_SCOPES, MCP_SCOPES } from "./scopes";

const userId = "11111111-1111-4111-8111-111111111111";
const connectionId = "22222222-2222-4222-8222-222222222222";
const supabase = {};

function connectionQueryClient() {
  const calls: Array<{ table: string; action: string; filters: Array<[string, unknown]> }> = [];
  const client = {
    from: vi.fn((table: string) => {
      const call = { table, action: "select", filters: [] as Array<[string, unknown]> };
      let recorded = false;
      const finish = () => {
        if (!recorded) calls.push(call);
        recorded = true;
        return { data: table === "chatgpt_connections" && call.action === "select" ? [] : null, error: null };
      };
      const builder: Record<string, unknown> = {};
      builder.select = vi.fn(() => builder);
      builder.update = vi.fn(() => { call.action = "update"; return builder; });
      builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
      builder.order = vi.fn(() => builder);
      builder.limit = vi.fn(() => builder);
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(finish()).then(resolve, reject);
      return builder;
    })
  };
  return { client, calls };
}

describe("POST /api/mcp/connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.supabaseServiceRoleKey = "service-role-test-key";
    mocks.serverEnv.plaivraMcpTokenSecret = "mcp-test-secret";
    mocks.requireUser.mockResolvedValue({ user: { id: userId }, supabase: {} });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);
    mocks.oauthRateLimit.mockResolvedValue(null);
    mocks.rotateMcpConnection.mockResolvedValue({
      data: { id: connectionId, scopes: [], is_active: true, created_at: "2026-07-02T00:00:00.000Z" },
      error: null
    });
  });

  it("creates a connection with canonical Full Access scopes", async () => {
    mocks.getSavedUserAiScopes.mockResolvedValue([...MCP_FULL_ACCESS_SCOPES]);
    mocks.rotateMcpConnection.mockResolvedValue({
      data: { id: connectionId, scopes: [...MCP_FULL_ACCESS_SCOPES], is_active: true, created_at: "2026-07-02T00:00:00.000Z" },
      error: null
    });

    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.rotateMcpConnection).toHaveBeenCalledWith(supabase, expect.objectContaining({
      userId,
      scopes: MCP_FULL_ACCESS_SCOPES
    }));
    expect(await response.json()).toMatchObject({ client_id: connectionId });
  });

  it("creates a connection with only the saved Custom Access scopes", async () => {
    const customScopes = [MCP_SCOPES.nutritionRead];
    mocks.getSavedUserAiScopes.mockResolvedValue(customScopes);

    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(200);
    expect(mocks.rotateMcpConnection).toHaveBeenCalledWith(supabase, expect.objectContaining({ scopes: customScopes }));
  });

  it("fails closed when saved permissions are missing or empty", async () => {
    mocks.getSavedUserAiScopes.mockResolvedValue([]);
    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "missing_ai_permissions" });
    expect(mocks.rotateMcpConnection).not.toHaveBeenCalled();
  });

  it("returns a rotation-specific error instead of a permissions error", async () => {
    mocks.getSavedUserAiScopes.mockResolvedValue([MCP_SCOPES.workoutsRead]);
    mocks.rotateMcpConnection.mockResolvedValue({ data: null, error: { message: "conflict" } });
    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ code: "connection_rotation_failed" });
  });

  it("returns a configuration-specific error without naming server secrets", async () => {
    mocks.serverEnv.plaivraMcpTokenSecret = "";
    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    const body = await response.json() as { code: string; error: string };
    expect(response.status).toBe(503);
    expect(body.code).toBe("mcp_not_configured");
    expect(body.error).not.toContain("PLAIVRA_MCP_TOKEN_SECRET");
  });

  it("lists and revokes only the authenticated user's connections", async () => {
    const query = connectionQueryClient();
    mocks.createSupabaseAdminClient.mockReturnValue(query.client);

    const getResponse = await GET(new Request("https://plaivra.test/api/mcp/connections"));
    expect(getResponse.status).toBe(200);
    const listCall = query.calls.find((call) => call.table === "chatgpt_connections" && call.action === "select");
    expect(listCall?.filters).toContainEqual(["user_id", userId]);

    const deleteResponse = await DELETE(new Request("https://plaivra.test/api/mcp/connections", { method: "DELETE" }));
    expect(deleteResponse.status).toBe(200);
    const revokeCall = query.calls.find((call) => call.table === "chatgpt_connections" && call.action === "update");
    expect(revokeCall?.filters).toContainEqual(["user_id", userId]);
    expect(revokeCall?.filters).toContainEqual(["is_active", true]);
  });
});
