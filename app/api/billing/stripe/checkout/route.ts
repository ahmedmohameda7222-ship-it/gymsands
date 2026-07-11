import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireEligibleUser, serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getStripeClient } from "@/lib/billing/stripe-server";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, "billing-checkout", 5, 60_000);
  if (limited) return limited;
  if (!serverEnv.billingCheckoutEnabled) {
    return NextResponse.json({ error: "Paid checkout is not enabled.", code: "owner_approval_required" }, { status: 409 });
  }
  if (!serverEnv.stripeSecretKey || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing is not configured.", code: "billing_not_configured" }, { status: 503 });
  }

  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return context;
  const body = await request.json().catch(() => ({}));
  const offeringKey = typeof body.offering_key === "string" ? body.offering_key.trim() : "";
  const requestKey = typeof body.idempotency_key === "string" ? body.idempotency_key.trim() : "";
  if (!/^[a-z0-9][a-z0-9._-]{2,79}$/.test(offeringKey) || !/^[A-Za-z0-9_-]{16,128}$/.test(requestKey)) {
    return NextResponse.json({ error: "A valid approved offering and idempotency key are required.", code: "invalid_request" }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const offering = await admin
    .from("billing_offerings")
    .select("id,provider_price_id,capability_keys,owner_approved_at")
    .eq("offering_key", offeringKey)
    .eq("provider", "stripe")
    .eq("status", "approved")
    .maybeSingle();
  if (offering.error) return NextResponse.json({ error: "Approved offering could not be verified.", code: "offering_unavailable" }, { status: 503 });
  if (!offering.data?.provider_price_id || !offering.data.owner_approved_at || !Array.isArray(offering.data.capability_keys) || !offering.data.capability_keys.length) {
    return NextResponse.json({ error: "No owner-approved paid offering is available.", code: "owner_approval_required" }, { status: 409 });
  }

  const stripe = getStripeClient();
  let customer = await admin
    .from("billing_customers")
    .select("id,provider_customer_id")
    .eq("user_id", context.user.id)
    .eq("provider", "stripe")
    .maybeSingle();
  if (customer.error) return NextResponse.json({ error: "Billing account could not be loaded.", code: "billing_account_unavailable" }, { status: 503 });

  if (!customer.data) {
    const created = await stripe.customers.create({
      email: context.user.email,
      metadata: { plaivra_user_id: context.user.id }
    });
    customer = await admin
      .from("billing_customers")
      .insert({ user_id: context.user.id, provider: "stripe", provider_customer_id: created.id, status: "active" })
      .select("id,provider_customer_id")
      .single();
    if (customer.error) return NextResponse.json({ error: "Billing account could not be linked.", code: "billing_account_unavailable" }, { status: 503 });
  }
  const providerCustomerId = customer.data?.provider_customer_id;
  if (!providerCustomerId) return NextResponse.json({ error: "Billing account could not be linked.", code: "billing_account_unavailable" }, { status: 503 });

  const origin = new URL(request.url).origin;
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: providerCustomerId,
    client_reference_id: context.user.id,
    line_items: [{ price: offering.data.provider_price_id, quantity: 1 }],
    success_url: `${origin}/settings/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/settings/subscription?checkout=cancelled`,
    metadata: { plaivra_user_id: context.user.id, plaivra_offering_key: offeringKey },
    subscription_data: { metadata: { plaivra_user_id: context.user.id, plaivra_offering_key: offeringKey } }
  }, {
    idempotencyKey: crypto.createHash("sha256").update(`${context.user.id}:${offering.data.id}:${requestKey}`).digest("hex")
  });

  if (!session.url) return NextResponse.json({ error: "Stripe did not return a checkout URL.", code: "checkout_unavailable" }, { status: 503 });
  return NextResponse.json({ checkout_url: session.url, session_id: session.id }, { headers: { "Cache-Control": "no-store" } });
}
