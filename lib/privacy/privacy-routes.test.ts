import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(() => null)
}));

vi.mock("@/lib/integrations/env", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));

import { GET, POST } from "@/app/api/user/privacy-requests/route";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

type QueryCall = {
  table: string;
  action: "select" | "insert" | "update";
  values?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

function privacySupabaseMock() {
  const calls: QueryCall[] = [];
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, action: "select", filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) calls.push(call);
      recorded = true;
    };
    const result = (single = false) => {
      record();
      if (table === "privacy_requests" && call.action === "insert") {
        return { data: { id: "request-a", request_type: "deletion", status: "pending" }, error: null };
      }
      if (table === "privacy_requests" && call.filters.some(([field]) => field === "request_type")) {
        return { data: null, error: null };
      }
      if (table === "privacy_requests") {
        const rows = [{ id: "request-a", request_type: "access", status: "pending" }];
        return { data: single ? rows[0] : rows, error: null };
      }
      return { data: null, error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((values: Record<string, unknown>) => {
      call.action = "insert";
      call.values = values;
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      call.action = "update";
      call.values = values;
      return builder;
    });
    builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result(true));
    builder.single = vi.fn(async () => result(true));
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  });
  return { client: { from } as unknown as SupabaseClient, calls };
}

describe("privacy request routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
  });

  it("lists only the authenticated user's requests", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userA }, supabase: client });
    const response = await GET(new Request("https://plaivra.test/api/user/privacy-requests", {
      headers: { Authorization: "Bearer test" }
    }));
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ table: "privacy_requests" });
    expect(calls[0].filters).toContainEqual(["user_id", userA]);
  });

  it("rejects notes longer than 500 characters before writing", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userA }, supabase: client });
    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "access", message: "x".repeat(501) })
    }));
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("forces the authenticated owner on creation and revokes only that owner's active connections", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userA }, supabase: client });
    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "deletion", user_id: userB })
    }));
    expect(response.status).toBe(201);

    const insert = calls.find((call) => call.table === "privacy_requests" && call.action === "insert");
    expect(insert?.values).toMatchObject({ user_id: userA, request_type: "deletion", status: "pending" });
    expect(insert?.values?.user_id).not.toBe(userB);
    const revoke = calls.find((call) => call.table === "chatgpt_connections" && call.action === "update");
    expect(revoke?.filters).toContainEqual(["user_id", userA]);
    expect(revoke?.filters).toContainEqual(["is_active", true]);
  });
});
