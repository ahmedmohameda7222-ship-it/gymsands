import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAdmin: vi.fn(),
  verify: vi.fn(),
  hash: vi.fn(() => "a".repeat(64)),
  claim: vi.fn(),
  processClaimed: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({
  serverEnv: { stripeSecretKey: "stripe_test_key", stripeWebhookSecret: "stripe_webhook_fixture", supabaseServiceRoleKey: "service" }
}));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createAdmin }));
vi.mock("@/lib/billing/stripe-server", () => ({ hashBillingPayload: mocks.hash, verifyStripeWebhook: mocks.verify }));
vi.mock("@/lib/billing/stripe-event-worker", () => ({
  claimStripeEvent: mocks.claim,
  processClaimedStripeEvent: mocks.processClaimed
}));

import { POST } from "@/app/api/billing/stripe/webhook/route";

function request(signature?: string) {
  return new Request("https://app.plaivra.com/api/billing/stripe/webhook", {
    method: "POST",
    body: "{}",
    headers: signature ? { "stripe-signature": signature } : undefined
  });
}

function duplicateLedgerAdmin() {
  const single = vi.fn().mockResolvedValue({ data: null, error: { code: "23505" } });
  const select = vi.fn(() => ({ single }));
  const insert = vi.fn(() => ({ select }));
  return { from: vi.fn(() => ({ insert })) };
}

describe("Stripe webhook route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects a missing or invalid signature before database access", async () => {
    expect((await POST(request())).status).toBe(400);
    mocks.verify.mockImplementation(() => { throw new Error("invalid"); });
    expect((await POST(request("bad"))).status).toBe(400);
    expect(mocks.createAdmin).not.toHaveBeenCalled();
  });

  it("acknowledges a duplicate that is already processed or currently leased", async () => {
    mocks.verify.mockReturnValue({ id: "evt_1", type: "customer.subscription.updated", created: 1783764000 });
    mocks.createAdmin.mockReturnValue(duplicateLedgerAdmin());
    mocks.claim.mockResolvedValue(null);

    const response = await POST(request("valid"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, duplicate: true, claim_status: "not_claimed" });
    expect(mocks.processClaimed).not.toHaveBeenCalled();
  });

  it("reclaims and processes a retryable duplicate instead of silently discarding it", async () => {
    const event = { id: "evt_retry", type: "customer.subscription.updated", created: 1783764000 };
    const ledger = { id: 7, provider_event_id: event.id, processing_attempts: 2 };
    const admin = duplicateLedgerAdmin();
    mocks.verify.mockReturnValue(event);
    mocks.createAdmin.mockReturnValue(admin);
    mocks.claim.mockResolvedValue(ledger);
    mocks.processClaimed.mockResolvedValue({ ok: true, status: "processed" });

    const response = await POST(request("valid"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true, status: "processed" });
    expect(mocks.claim).toHaveBeenCalledWith(admin, event.id);
    expect(mocks.processClaimed).toHaveBeenCalledWith(admin, ledger, event);
  });
});
