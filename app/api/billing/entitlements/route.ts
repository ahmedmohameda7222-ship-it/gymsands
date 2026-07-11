import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { hasCapabilityAccess } from "@/lib/billing/entitlement-reducer";
import type { EntitlementSnapshot } from "@/lib/billing/contracts";

export async function GET(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const result = await context.supabase
    .from("user_entitlements")
    .select("capability_key,state,source_provider,valid_from,valid_through,grace_period_end,revoked_at,reason_code,version")
    .eq("user_id", context.user.id)
    .order("capability_key");
  if (result.error) return NextResponse.json({ error: "Entitlements could not be loaded.", code: "entitlements_unavailable" }, { status: 503 });

  const entitlements = (result.data ?? []).map((row) => {
    const snapshot: EntitlementSnapshot = {
      userId: context.user.id,
      capabilityKey: row.capability_key,
      state: row.state,
      sourceProvider: row.source_provider,
      validFrom: row.valid_from,
      validThrough: row.valid_through,
      gracePeriodEnd: row.grace_period_end,
      revokedAt: row.revoked_at,
      reasonCode: row.reason_code,
      version: row.version
    };
    return { ...row, access_active: hasCapabilityAccess(snapshot) };
  });
  return NextResponse.json({ entitlements }, { headers: { "Cache-Control": "no-store" } });
}
