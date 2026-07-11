import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  requireEligibleUser: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
  serverEnv: {
    supabaseServiceRoleKey: "service-role-test-key",
    plaivraMcpTokenSecret: "mcp-test-secret",
    plaivraAllowLegacyMcpClientId: false
  }
}));

vi.mock("@/lib/integrations/env", () => ({
  requireUser: mocks.requireUser,
  requireEligibleUser: mocks.requireEligibleUser,
  serverEnv: mocks.serverEnv
}));
vi.mock("@/lib/server/supabase-admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient
}));

import { DELETE, GET, POST } from "@/app/api/mcp/connections/route";

const userId = "11111111-1111-4111-8111-111111111111";
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
      builder.is = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
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
    mocks.requireEligibleUser.mockResolvedValue({ user: { id: userId }, supabase: {} });
    mocks.createSupabaseAdminClient.mockReturnValue(supabase);
  });

  it("retires manual connection creation in favor of CIMD", async () => {
    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ code: "cimd_connection_starts_in_chatgpt" });
  });

  it("rejects direct connection creation when age eligibility needs review", async () => {
    mocks.requireEligibleUser.mockResolvedValue(
      NextResponse.json({ error: "Age review required.", code: "age_review_required" }, { status: 403 })
    );
    const response = await POST(new Request("https://plaivra.test/api/mcp/connections", { method: "POST" }));
    expect(response.status).toBe(403);
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
