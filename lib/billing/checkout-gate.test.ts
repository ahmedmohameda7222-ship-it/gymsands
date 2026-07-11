import { describe, expect, it, vi } from "vitest";

const requireEligibleUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/integrations/env", () => ({
  requireEligibleUser,
  serverEnv: { billingCheckoutEnabled: false, stripeSecretKey: "", supabaseServiceRoleKey: "" }
}));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: () => null }));

import { POST } from "@/app/api/billing/stripe/checkout/route";

describe("paid checkout owner gate", () => {
  it("returns an owner-approval error before authentication or provider access", async () => {
    const response = await POST(new Request("https://app.plaivra.com/api/billing/stripe/checkout", { method: "POST" }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "owner_approval_required" });
    expect(requireEligibleUser).not.toHaveBeenCalled();
  });
});
