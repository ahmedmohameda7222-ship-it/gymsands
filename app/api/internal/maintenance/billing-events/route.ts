import { NextResponse } from "next/server";
import { processPendingStripeEvents } from "@/lib/billing/stripe-event-worker";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!serverEnv.cronSecret || !serverEnv.stripeSecretKey || !serverEnv.supabaseServiceRoleKey) {
    return NextResponse.json({ error: "Billing maintenance is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  try {
    const result = await processPendingStripeEvents(createSupabaseAdminClient(), 10);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Billing maintenance failed." }, { status: 500 });
  }
}
