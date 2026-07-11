import "server-only";
import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getStripeClient } from "@/lib/billing/stripe-server";
import { processStripeSubscriptionEvent } from "@/lib/billing/stripe-event-processor";

type BillingLedgerRow = {
  id: number;
  provider_event_id: string;
  processing_attempts: number;
};

function retryDelaySeconds(attempts: number) {
  return Math.min(6 * 60 * 60, Math.max(30, 30 * 2 ** Math.max(0, attempts - 1)));
}

async function markRetry(admin: SupabaseClient, row: BillingLedgerRow, errorCode: string) {
  const terminal = row.processing_attempts >= 8;
  const nextAttemptAt = new Date(Date.now() + retryDelaySeconds(row.processing_attempts) * 1000).toISOString();
  const updated = await admin.from("billing_event_ledger").update({
    processing_status: terminal ? "terminal_error" : "retryable_error",
    last_error_code: errorCode,
    next_attempt_at: nextAttemptAt,
    locked_at: null,
    ...(terminal ? { processed_at: new Date().toISOString() } : {})
  }).eq("id", row.id);
  if (updated.error) throw new Error("Billing event retry state could not be persisted.");
  return { ok: terminal, status: terminal ? "terminal_error" as const : "retryable_error" as const };
}

export async function processClaimedStripeEvent(admin: SupabaseClient, row: BillingLedgerRow, suppliedEvent?: Stripe.Event) {
  try {
    const event = suppliedEvent ?? await getStripeClient().events.retrieve(row.provider_event_id);
    const result = await processStripeSubscriptionEvent(admin, { id: row.id }, event);
    const unlocked = await admin.from("billing_event_ledger").update({ locked_at: null, next_attempt_at: new Date().toISOString() }).eq("id", row.id);
    if (unlocked.error) throw new Error("Billing event completion state could not be persisted.");
    return { ok: true, status: result.status };
  } catch (error) {
    console.error("Stripe billing event processing failed:", error instanceof Error ? error.message : "Unknown error");
    return markRetry(admin, row, "processing_failed");
  }
}

export async function claimStripeEvent(admin: SupabaseClient, providerEventId: string) {
  const claimed = await admin.rpc("claim_billing_event", {
    p_provider: "stripe",
    p_provider_event_id: providerEventId,
    p_lease_seconds: 120
  });
  if (claimed.error) throw new Error("Billing event claim failed.");
  return (Array.isArray(claimed.data) ? claimed.data[0] : claimed.data) as BillingLedgerRow | null;
}

export async function processPendingStripeEvents(admin: SupabaseClient, batchSize = 10) {
  const claimed = await admin.rpc("claim_billing_events", { p_batch_size: batchSize, p_lease_seconds: 120 });
  if (claimed.error) throw new Error("Billing event queue claim failed.");
  const rows = (claimed.data ?? []) as BillingLedgerRow[];
  const results = [];
  for (const row of rows) results.push(await processClaimedStripeEvent(admin, row));
  return { claimed: rows.length, results };
}
