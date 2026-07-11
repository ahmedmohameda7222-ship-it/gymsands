import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { reduceEntitlements } from "@/lib/billing/entitlement-reducer";
import type { EntitlementSnapshot } from "@/lib/billing/contracts";
import { normalizeStripeSubscriptionEvent } from "@/lib/billing/stripe-server";

type LedgerRow = { id: number };

export function providerEventIsStale(latestProviderEventAt: string | null | undefined, incomingEventAt: string) {
  if (!latestProviderEventAt) return false;
  const latest = Date.parse(latestProviderEventAt);
  const incoming = Date.parse(incomingEventAt);
  return Number.isFinite(latest) && Number.isFinite(incoming) && latest >= incoming;
}

function entitlementSnapshot(row: Record<string, unknown>): EntitlementSnapshot {
  return {
    userId: String(row.user_id),
    capabilityKey: String(row.capability_key),
    state: row.state as EntitlementSnapshot["state"],
    sourceProvider: row.source_provider as EntitlementSnapshot["sourceProvider"],
    validFrom: typeof row.valid_from === "string" ? row.valid_from : null,
    validThrough: typeof row.valid_through === "string" ? row.valid_through : null,
    gracePeriodEnd: typeof row.grace_period_end === "string" ? row.grace_period_end : null,
    revokedAt: typeof row.revoked_at === "string" ? row.revoked_at : null,
    reasonCode: typeof row.reason_code === "string" ? row.reason_code : null,
    version: Number(row.version) || 1
  };
}

async function markLedger(admin: SupabaseClient, ledgerId: number, values: Record<string, unknown>) {
  const result = await admin.from("billing_event_ledger").update(values).eq("id", ledgerId);
  if (result.error) throw result.error;
}

export async function processStripeSubscriptionEvent(admin: SupabaseClient, ledger: LedgerRow, stripeEvent: Stripe.Event) {
  const event = normalizeStripeSubscriptionEvent(stripeEvent);
  if (!event) {
    await markLedger(admin, ledger.id, { processing_status: "ignored", processed_at: new Date().toISOString() });
    return { status: "ignored" as const };
  }
  if (!event.userId || !event.providerCustomerId || !event.providerSubscriptionId || !event.providerPriceId) {
    await markLedger(admin, ledger.id, { processing_status: "terminal_error", last_error_code: "missing_subscription_identity", processed_at: new Date().toISOString() });
    return { status: "terminal_error" as const };
  }

  const existingCustomer = await admin
    .from("billing_customers")
    .select("id,user_id")
    .eq("provider", "stripe")
    .eq("provider_customer_id", event.providerCustomerId)
    .maybeSingle();
  if (existingCustomer.error) throw existingCustomer.error;
  if (existingCustomer.data && existingCustomer.data.user_id !== event.userId) {
    await markLedger(admin, ledger.id, { processing_status: "terminal_error", last_error_code: "cross_user_customer", processed_at: new Date().toISOString() });
    return { status: "terminal_error" as const };
  }

  const customer = await admin
    .from("billing_customers")
    .upsert({ user_id: event.userId, provider: "stripe", provider_customer_id: event.providerCustomerId, status: "active" }, { onConflict: "provider,provider_customer_id" })
    .select("id,user_id")
    .single();
  if (customer.error) throw customer.error;

  const existingSubscription = await admin
    .from("billing_subscriptions")
    .select("id,user_id,version,latest_provider_event_at")
    .eq("provider", "stripe")
    .eq("provider_subscription_id", event.providerSubscriptionId)
    .maybeSingle();
  if (existingSubscription.error) throw existingSubscription.error;
  const existingSubscriptionRecord = existingSubscription.data;
  if (existingSubscriptionRecord && existingSubscriptionRecord.user_id !== event.userId) {
    await markLedger(admin, ledger.id, { processing_status: "terminal_error", last_error_code: "cross_user_subscription", processed_at: new Date().toISOString() });
    return { status: "terminal_error" as const };
  }
  if (existingSubscriptionRecord && providerEventIsStale(existingSubscriptionRecord.latest_provider_event_at, event.occurredAt)) {
    await markLedger(admin, ledger.id, {
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      user_id: event.userId,
      subscription_id: existingSubscriptionRecord.id,
      last_error_code: "stale_provider_event"
    });
    return { status: "ignored" as const };
  }

  const offering = await admin
    .from("billing_offerings")
    .select("id,capability_keys")
    .eq("provider", "stripe")
    .eq("provider_price_id", event.providerPriceId)
    .eq("status", "approved")
    .maybeSingle();
  if (offering.error) throw offering.error;

  const subscription = await admin
    .from("billing_subscriptions")
    .upsert({
      user_id: event.userId,
      billing_customer_id: customer.data.id,
      offering_id: offering.data?.id ?? null,
      provider: "stripe",
      provider_subscription_id: event.providerSubscriptionId,
      provider_status: event.providerStatus ?? "unknown",
      cancel_at_period_end: event.cancelAtPeriodEnd,
      current_period_start: event.currentPeriodStart,
      current_period_end: event.currentPeriodEnd,
      trial_end: event.trialEnd,
      grace_period_end: event.gracePeriodEnd,
      latest_provider_event_at: event.occurredAt,
      version: Number(existingSubscriptionRecord?.version ?? 0) + 1
    }, { onConflict: "provider,provider_subscription_id" })
    .select("id")
    .single();
  if (subscription.error) throw subscription.error;

  const capabilityKeys = Array.isArray(offering.data?.capability_keys) ? offering.data.capability_keys.filter((value): value is string => typeof value === "string") : [];
  if (!capabilityKeys.length) {
    await markLedger(admin, ledger.id, {
      processing_status: "ignored",
      processed_at: new Date().toISOString(),
      user_id: event.userId,
      subscription_id: subscription.data.id,
      last_error_code: "offering_not_owner_approved"
    });
    return { status: "ignored" as const };
  }

  const currentRows = await admin.from("user_entitlements").select("*").eq("user_id", event.userId).in("capability_key", capabilityKeys);
  if (currentRows.error) throw currentRows.error;
  const reduced = reduceEntitlements((currentRows.data ?? []).map((row) => entitlementSnapshot(row as Record<string, unknown>)), event, capabilityKeys);

  for (const entitlement of reduced.filter((item) => capabilityKeys.includes(item.capabilityKey))) {
    const write = await admin.from("user_entitlements").upsert({
      user_id: entitlement.userId,
      capability_key: entitlement.capabilityKey,
      state: entitlement.state,
      source_provider: entitlement.sourceProvider,
      source_subscription_id: subscription.data.id,
      valid_from: entitlement.validFrom,
      valid_through: entitlement.validThrough,
      grace_period_end: entitlement.gracePeriodEnd,
      revoked_at: entitlement.revokedAt,
      reason_code: entitlement.reasonCode,
      version: entitlement.version
    }, { onConflict: "user_id,capability_key" });
    if (write.error) throw write.error;
  }

  await markLedger(admin, ledger.id, {
    processing_status: "processed",
    processed_at: new Date().toISOString(),
    user_id: event.userId,
    subscription_id: subscription.data.id,
    last_error_code: null
  });
  return { status: "processed" as const };
}
