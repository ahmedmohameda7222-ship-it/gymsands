import "server-only";

import crypto from "node:crypto";
import Stripe from "stripe";
import { serverEnv } from "@/lib/integrations/env";
import type { VerifiedProviderEvent } from "@/lib/billing/contracts";

export const STRIPE_API_VERSION = "2026-06-24.dahlia" as const;

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  if (!serverEnv.stripeSecretKey) throw new Error("Stripe is not configured.");
  stripeClient ??= new Stripe(serverEnv.stripeSecretKey, { apiVersion: STRIPE_API_VERSION });
  return stripeClient;
}

export function hashBillingPayload(payload: string) {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export function verifyStripeWebhook(payload: string, signature: string) {
  if (!serverEnv.stripeWebhookSecret) throw new Error("Stripe webhook verification is not configured.");
  return getStripeClient().webhooks.constructEvent(payload, signature, serverEnv.stripeWebhookSecret);
}

function id(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function iso(seconds: number | null | undefined) {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : null;
}

export function normalizeStripeSubscriptionEvent(event: Stripe.Event): VerifiedProviderEvent | null {
  if (!event.type.startsWith("customer.subscription.")) return null;
  const subscription = event.data.object as Stripe.Subscription;
  const item = subscription.items.data[0];
  if (!item) return null;

  return {
    provider: "stripe",
    eventId: event.id,
    eventType: event.type,
    occurredAt: iso(event.created) ?? new Date().toISOString(),
    userId: subscription.metadata.plaivra_user_id || null,
    providerCustomerId: id(subscription.customer),
    providerSubscriptionId: subscription.id,
    providerProductId: id(item.price.product),
    providerPriceId: item.price.id,
    providerStatus: subscription.status,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    currentPeriodStart: iso(item.current_period_start),
    currentPeriodEnd: iso(item.current_period_end),
    trialEnd: iso(subscription.trial_end),
    gracePeriodEnd: subscription.metadata.plaivra_grace_period_end || null,
    revokedAt: null,
    reasonCode: "subscription_update"
  };
}
