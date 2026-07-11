import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { processAccountDeletionJob, type AccountDeletionJob } from "@/lib/privacy/account-deletion-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function approvedRetentionPeriods() {
  const values = [
    serverEnv.privacyRetentionMcpAuditDays,
    serverEnv.privacyRetentionSecurityLogDays,
    serverEnv.privacyRetentionCompletedRequestDays,
    serverEnv.privacyRetentionDeletionEvidenceDays
  ].map((value) => Number(value));
  if (values.some((value) => !Number.isInteger(value) || value < 1)) return null;
  return {
    mcpAuditDays: values[0],
    securityLogDays: values[1],
    completedRequestDays: values[2],
    deletionEvidenceDays: values[3]
  };
}

export async function GET(request: Request) {
  if (!serverEnv.cronSecret) {
    return NextResponse.json({ error: "Maintenance authentication is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const periods = approvedRetentionPeriods();
  let retention: unknown = { configured: false, reason: "owner_legal_periods_required" };
  if (periods) {
    const cleanup = await admin.rpc("cleanup_privacy_retention_artifacts", {
      p_batch_size: 1000,
      p_mcp_audit_days: periods.mcpAuditDays,
      p_security_log_days: periods.securityLogDays,
      p_completed_request_days: periods.completedRequestDays,
      p_deletion_evidence_days: periods.deletionEvidenceDays,
      p_dry_run: !serverEnv.privacyRetentionExecutionEnabled
    });
    if (cleanup.error) {
      console.error("Plaivra privacy retention maintenance failed:", cleanup.error.message);
      return NextResponse.json({ error: "Privacy retention maintenance failed." }, { status: 500 });
    }
    retention = cleanup.data;
  }

  if (!serverEnv.privacyDeletionExecutionEnabled) {
    const queued = await admin
      .from("account_deletion_jobs")
      .select("id", { count: "exact", head: true })
      .in("state", ["queued", "retry_scheduled"]);
    return NextResponse.json({
      ok: true,
      destructive_execution: false,
      queued_deletion_jobs: queued.count ?? null,
      retention
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const claimed = await admin.rpc("claim_account_deletion_jobs", { p_batch_size: 3 });
  if (claimed.error) {
    console.error("Plaivra deletion job claim failed:", claimed.error.message);
    return NextResponse.json({ error: "Deletion jobs could not be claimed." }, { status: 500 });
  }

  const results = [];
  for (const job of (claimed.data ?? []) as AccountDeletionJob[]) {
    results.push(await processAccountDeletionJob(admin, job));
  }

  const summary = results.reduce<Record<string, number>>((counts, result) => {
    counts[result.state] = (counts[result.state] ?? 0) + 1;
    return counts;
  }, {});
  return NextResponse.json({
    ok: true,
    destructive_execution: true,
    processed_deletion_jobs: results.length,
    deletion_summary: summary,
    retention
  }, { headers: { "Cache-Control": "no-store" } });
}
