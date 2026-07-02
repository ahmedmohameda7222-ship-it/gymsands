import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  configuredProviders: vi.fn(() => []),
  rateLimit: vi.fn(() => null),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({
  requireAdmin: mocks.requireAdmin,
  configuredProviders: mocks.configuredProviders
}));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createSupabaseAdminClient }));

import { GET as getApiStatus } from "@/app/api/admin/api-status/route";
import { GET as getAuditLogs } from "@/app/api/admin/audit-logs/route";
import { GET as getQuality } from "@/app/api/admin/quality/route";
import { GET as getUsers, POST as updateUser } from "@/app/api/admin/users/route";

const getHandlers = [getApiStatus, getAuditLogs, getQuality, getUsers];

describe("admin API protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
  });

  it("rejects unauthenticated requests before any admin data access", async () => {
    mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Sign in required." }, { status: 401 }));
    for (const handler of getHandlers) {
      const response = await handler(new Request("https://plaivra.test/api/admin/test"));
      expect(response.status).toBe(401);
    }
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
    expect(mocks.configuredProviders).not.toHaveBeenCalled();
  });

  it("rejects normal users server-side across every admin API", async () => {
    mocks.requireAdmin.mockResolvedValue(NextResponse.json({ error: "Admin access is required." }, { status: 403 }));
    for (const handler of getHandlers) {
      const response = await handler(new Request("https://plaivra.test/api/admin/test", {
        headers: { Authorization: "Bearer member-token" }
      }));
      expect(response.status).toBe(403);
    }
    const postResponse = await updateUser(new Request("https://plaivra.test/api/admin/users", {
      method: "POST",
      headers: { Authorization: "Bearer member-token", "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "11111111-1111-4111-8111-111111111111", role: "admin" })
    }));
    expect(postResponse.status).toBe(403);
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});
