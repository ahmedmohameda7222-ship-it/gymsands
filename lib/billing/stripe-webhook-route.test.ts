import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  verify: vi.fn(),
  hash: vi.fn(() => "a".repeat(64)),
  process: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({
  serverEnv: { stripeSecretKey: "stripe_test_key", stripeWebhookSecret: "stripe_webhook_fixture", supabaseServiceRoleKey: "service" }
}));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createAdmin }));
vi.mock("@/lib/billing/stripe-server", () => ({ hashBillingPayload: mocks.hash, verifyStripeWebhook: mocks.verify }));
vi.mock("@/lib/billing/stripe-event-processor", () => ({ processStripeSubscriptionEvent: mocks.process }));

import { POST } from "@/app/api/billing/stripe/webhook/route";

function request(signature?: string) {
  return new Request("https://app.plaivra.com/api/billing/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: signature ? { "stripe-signature": signature } : undefined
  });
}

describe("Stripe webhook route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing or invalid signature before database access", async () => {
    expect((await POST(request())).status).toBe(400);
    mocks.verify.mockImplementation(() => { throw new Error("invalid"); });
    expect((await POST(request("bad"))).status).toBe(400);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("acknowledges a replayed provider event without processing twice", async () => {
    mocks.verify.mockReturnValue({ id: "evt_1", type: "customer.subscription.updated", created: 1783764000 });
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
    const select = vi.fn(() => ({ single }));
    const insert = vi.fn(() => ({ select }));
    mocks.createAdmin.mockReturnValue({ from: vi.fn(() => ({ insert })) });

    const response = await POST(request("valid"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true });
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
