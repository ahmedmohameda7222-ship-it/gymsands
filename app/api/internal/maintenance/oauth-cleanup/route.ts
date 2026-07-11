import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function approvedPeriods() {
  if (!serverEnv.privacyRetentionOauthCodeHours.trim()
    || !serverEnv.privacyRetentionOauthTokenDays.trim()
    || !serverEnv.privacyRetentionIdempotencyDaysAfterExpiry.trim()) return null;
  const codeHours = Number(serverEnv.privacyRetentionOauthCodeHours);
  const tokenDays = Number(serverEnv.privacyRetentionOauthTokenDays);
  const idempotencyDaysAfterExpiry = Number(serverEnv.privacyRetentionIdempotencyDaysAfterExpiry);
  if (!Number.isInteger(codeHours) || codeHours < 1) return null;
  if (!Number.isInteger(tokenDays) || tokenDays < 1) return null;
  if (!Number.isInteger(idempotencyDaysAfterExpiry) || idempotencyDaysAfterExpiry < 0) return null;
  return { codeHours, tokenDays, idempotencyDaysAfterExpiry };
}

export async function GET(request: Request) {
  if (!serverEnv.cronSecret) {
    return NextResponse.json({ error: "Maintenance authentication is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const periods = approvedPeriods();
  if (!periods) {
    return NextResponse.json({
      ok: true,
      configured: false,
      destructive_execution: false,
      reason: "owner_legal_periods_required"
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const supabase = createSupabaseAdminClient();
  const dryRun = !serverEnv.privacyRetentionExecutionEnabled;
  const oauth = await supabase.rpc("cleanup_expired_mcp_oauth_artifacts_v2", {
    p_batch_size: 1000,
    p_code_hours: periods.codeHours,
    p_access_token_days: periods.tokenDays,
    p_dry_run: dryRun
  });
  if (oauth.error) {
    console.error("Plaivra OAuth maintenance failed:", oauth.error.message);
    return NextResponse.json({ error: "OAuth maintenance failed." }, { status: 500 });
  }
  const idempotency = await supabase.rpc("cleanup_expired_mcp_idempotency_keys_v2", {
    p_batch_size: 1000,
    p_days_after_expiry: periods.idempotencyDaysAfterExpiry,
    p_dry_run: dryRun
  });
  if (idempotency.error) {
    console.error("Plaivra idempotency maintenance failed:", idempotency.error.message);
    return NextResponse.json({ error: "Idempotency maintenance failed." }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    configured: true,
    destructive_execution: !dryRun,
    oauth: oauth.data,
    idempotency: idempotency.data
  }, { headers: { "Cache-Control": "no-store" } });
}
