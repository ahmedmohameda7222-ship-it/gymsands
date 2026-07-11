import { NextResponse } from "next/server";
import { requireUser, serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { getStripeClient } from "@/lib/billing/stripe-server";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limited = rateLimit(request, "billing-portal", 8, 60_000);
  if (limited) return limited;
  if (!serverEnv.stripeSecretKey || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing management is not configured.", code: "billing_not_configured" }, { status: 503 });
  }

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const admin = createSupabaseAdminClient();
  const customer = await admin
    .from("billing_customers")
    .select("provider_customer_id")
    .eq("user_id", context.user.id)
    .eq("provider", "stripe")
    .eq("status", "active")
    .maybeSingle();
  if (customer.error) return NextResponse.json({ error: "Billing account could not be loaded.", code: "billing_account_unavailable" }, { status: 503 });
  if (!customer.data) return NextResponse.json({ error: "No Stripe billing account is linked.", code: "billing_account_missing" }, { status: 404 });

  const origin = new URL(request.url).origin;
  const session = await getStripeClient().billingPortal.sessions.create({
    customer: customer.data.provider_customer_id,
    return_url: `${origin}/settings/subscription`
  });
  return NextResponse.json({ portal_url: session.url }, { headers: { "Cache-Control": "no-store" } });
}
