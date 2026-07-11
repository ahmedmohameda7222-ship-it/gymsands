import { describe, expect, it } from "vitest";
import { entitlementRequired, type VerifiedProviderEvent } from "@/lib/billing/contracts";
import { hasCapabilityAccess, normalizeEntitlementState, reduceEntitlements } from "@/lib/billing/entitlement-reducer";

const now = new Date("2026-07-11T10:00:00.000Z");

function event(patch: Partial<VerifiedProviderEvent> = {}): VerifiedProviderEvent {
  return {
    provider: "stripe",
    eventId: "evt_1",
    eventType: "customer.subscription.updated",
    occurredAt: now.toISOString(),
    userId: "11111111-1111-4111-8111-111111111111",
    providerCustomerId: "cus_1",
    providerSubscriptionId: "sub_1",
    providerProductId: "prod_owner_approved",
    providerPriceId: "price_owner_approved",
    providerStatus: "active",
    cancelAtPeriodEnd: false,
    currentPeriodStart: "2026-07-01T00:00:00.000Z",
    currentPeriodEnd: "2026-08-01T00:00:00.000Z",
    trialEnd: null,
    gracePeriodEnd: null,
    revokedAt: null,
    reasonCode: "subscription_update",
    ...patch
  };
}

describe("provider-neutral entitlement reducer", () => {
  it.each([
    [event({ providerStatus: "trialing", trialEnd: "2026-07-20T00:00:00.000Z" }), "trialing"],
    [event(), "active"],
    [event({ cancelAtPeriodEnd: true }), "cancelled_but_active"],
    [event({ providerStatus: "past_due", gracePeriodEnd: "2026-07-14T00:00:00.000Z" }), "grace_period"],
    [event({ providerStatus: "unpaid" }), "billing_issue"],
    [event({ providerStatus: "canceled", currentPeriodEnd: "2026-07-10T00:00:00.000Z" }), "expired"],
    [event({ reasonCode: "chargeback" }), "revoked"]
  ])("normalizes provider state", (input, state) => {
    expect(normalizeEntitlementState(input, now)).toBe(state);
  });

  it("updates only explicitly approved capability keys and increments versions", () => {
    const first = reduceEntitlements([], event(), ["owner.approved.capability"], now);
    const second = reduceEntitlements(first, event({ eventId: "evt_2", cancelAtPeriodEnd: true }), ["owner.approved.capability"], now);

    expect(first).toHaveLength(1);
    expect(second[0]).toMatchObject({ state: "cancelled_but_active", version: 2 });
  });

  it("denies expired, revoked, and elapsed grace-period access", () => {
    const active = reduceEntitlements([], event(), ["capability"], now)[0];
    const revoked = reduceEntitlements([], event({ reasonCode: "revocation" }), ["capability"], now)[0];
    const elapsedGrace = reduceEntitlements([], event({ providerStatus: "past_due", gracePeriodEnd: "2026-07-10T00:00:00.000Z" }), ["capability"], now)[0];

    expect(hasCapabilityAccess(active, now)).toBe(true);
    expect(hasCapabilityAccess(revoked, now)).toBe(false);
    expect(hasCapabilityAccess(elapsedGrace, now)).toBe(false);
  });

  it("returns an external Plaivra checkout link for ChatGPT capability errors", () => {
    expect(entitlementRequired("owner.approved.capability", "https://app.plaivra.com")).toEqual({
      code: "entitlement_required",
      message: expect.any(String),
      capability: "owner.approved.capability",
      checkout_url: "https://app.plaivra.com/settings/subscription"
    });
  });
});
