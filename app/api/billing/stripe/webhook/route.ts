import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { hashBillingPayload, verifyStripeWebhook } from "@/lib/billing/stripe-server";
import { processStripeSubscriptionEvent } from "@/lib/billing/stripe-event-processor";
import { serverEnv } from "@/lib/integrations/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!serverEnv.stripeSecretKey || !serverEnv.stripeWebhookSecret || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing webhook is not configured.", code: "billing_not_configured" }, { status: 503 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Stripe signature is required.", code: "invalid_signature" }, { status: 400 });

  const payload = await request.text();
  let event;
  try {
    event = verifyStripeWebhook(payload, signature);
  } catch {
    return NextResponse.json({ error: "Stripe webhook signature is invalid.", code: "invalid_signature" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const ledger = await admin
    .from("billing_event_ledger")
    .insert({
      provider: "stripe",
      provider_event_id: event.id,
      event_type: event.type,
      payload_sha256: hashBillingPayload(payload),
      provider_created_at: new Date(event.created * 1000).toISOString(),
      processing_status: "received"
    })
    .select("id")
    .single();

  if (ledger.error?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (ledger.error) return NextResponse.json({ error: "Billing event could not be recorded.", code: "ledger_unavailable" }, { status: 503 });

  try {
    const result = await processStripeSubscriptionEvent(admin, ledger.data, event);
    return NextResponse.json({ received: true, status: result.status });
  } catch (error) {
    await admin.from("billing_event_ledger").update({
      processing_status: "retryable_error",
      processing_attempts: 1,
      last_error_code: "processing_failed"
    }).eq("id", ledger.data.id);
    console.error("Stripe billing event processing failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Billing event processing will be retried.", code: "processing_failed" }, { status: 500 });
  }
}
