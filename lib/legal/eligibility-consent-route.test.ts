import { beforeEach, describe, expect, it, vi } from "vitest";
import { REQUIRED_CONSENTS } from "./versions";

const { requireUser, createSupabaseAdminClient } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  createSupabaseAdminClient: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({ requireUser }));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient }));

const consentPayload = REQUIRED_CONSENTS.map((item) => ({ ...item, granted: true }));

function request(declaredAge: unknown) {
  return new Request("https://app.plaivra.com/api/user/consents", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ declared_age: declaredAge, consents: consentPayload })
  });
}

describe("consent API launch eligibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireUser.mockResolvedValue({ user: { id: "11111111-1111-4111-8111-111111111111" }, supabase: {} });
  });

  it("rejects age 15 without creating an admin write client", async () => {
    const { POST } = await import("@/app/api/user/consents/route");
    const response = await POST(request(15));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "age_ineligible" });
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("rejects missing or malformed age before writing", async () => {
    const { POST } = await import("@/app/api/user/consents/route");
    for (const value of [undefined, "16", 16.5]) {
      const response = await POST(request(value));
      expect(response.status).toBe(400);
    }
    expect(createSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("accepts age 16 and writes required consent rows only for the authenticated user", async () => {
    const upsert = vi.fn(async (_rows: Array<Record<string, unknown>>) => ({ error: null }));
    createSupabaseAdminClient.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    const { POST } = await import("@/app/api/user/consents/route");
    const response = await POST(request(16));
    expect(response.status).toBe(200);
    expect(upsert).toHaveBeenCalledOnce();
    const [rows] = upsert.mock.calls[0];
    expect(rows).toHaveLength(REQUIRED_CONSENTS.length);
    expect(rows.every((row) => row.user_id === "11111111-1111-4111-8111-111111111111")).toBe(true);
  });
});
