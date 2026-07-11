import { describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { normalizeStripeSubscriptionEvent, STRIPE_API_VERSION } from "@/lib/billing/stripe-server";

function subscriptionEvent(): Stripe.Event {
  return {
    id: "evt_verified",
    object: "event",
    api_version: STRIPE_API_VERSION,
    created: 1783764000,
    data: {
      object: {
        id: "sub_1",
        object: "subscription",
        customer: "cus_1",
        status: "active",
        cancel_at_period_end: false,
        canceled_at: null,
        ended_at: null,
        trial_end: null,
        metadata: { plaivra_user_id: "11111111-1111-4111-8111-111111111111" },
        items: {
          object: "list",
          data: [{ id: "si_1", current_period_start: 1782864000, current_period_end: 1785542400, price: { id: "price_approved", product: "prod_approved" } }],
          has_more: false,
          url: "/v1/subscription_items"
        }
      } as unknown as Stripe.Subscription
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: "req_1", idempotency_key: null },
    type: "customer.subscription.updated"
  };
}

describe("Stripe subscription normalization", () => {
  it("pins the installed SDK API version and maps only verified subscription fields", () => {
    expect(STRIPE_API_VERSION).toBe("2026-06-24.dahlia");
    expect(normalizeStripeSubscriptionEvent(subscriptionEvent())).toMatchObject({
      provider: "stripe",
      eventId: "evt_verified",
      userId: "11111111-1111-4111-8111-111111111111",
      providerCustomerId: "cus_1",
      providerSubscriptionId: "sub_1",
      providerProductId: "prod_approved",
      providerPriceId: "price_approved",
      providerStatus: "active"
    });
  });

  it("does not provision from unsupported event families", () => {
    const event = { ...subscriptionEvent(), type: "charge.refunded" } as unknown as Stripe.Event;
    expect(normalizeStripeSubscriptionEvent(event)).toBeNull();
  });
});
