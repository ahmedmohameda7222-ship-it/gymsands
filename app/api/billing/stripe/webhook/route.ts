import { NextResponse } from "next/server";
import { claimStripeEvent, processClaimedStripeEvent } from "@/lib/billing/stripe-event-worker";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { hashBillingPayload, verifyStripeWebhook } from "@/lib/billing/stripe-server";
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
  const inserted = await admin.from("billing_event_ledger").insert({
    provider: "stripe",
    provider_event_id: event.id,
    event_type: event.type,
    payload_sha256: hashBillingPayload(payload),
    provider_created_at: new Date(event.created * 1000).toISOString(),
    processing_status: "received",
    next_attempt_at: new Date().toISOString()
  }).select("id").single();

  if (inserted.error && inserted.error.code !== "23505") {
    return NextResponse.json({ error: "Billing event could not be recorded.", code: "ledger_unavailable" }, { status: 503 });
  }

  try {
    const claimed = await claimStripeEvent(admin, event.id);
    if (!claimed) return NextResponse.json({ received: true, duplicate: Boolean(inserted.error), queued: true });
    const result = await processClaimedStripeEvent(admin, claimed, event);
    return NextResponse.json(
      { received: true, status: result.status },
      { status: result.ok ? 200 : 500 }
    );
  } catch {
    return NextResponse.json({ error: "Billing event was recorded but could not be claimed safely.", code: "claim_unavailable" }, { status: 503 });
  }
}
