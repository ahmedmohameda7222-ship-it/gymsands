import { NextResponse } from "next/server";
import { requireUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { createSupabaseAdminClient, hasSupabaseAdminConfig } from "@/lib/server/supabase-admin";
import {
  ACCOUNT_DELETION_IMPACT_VERSION,
  deletionSubjectHash,
  isRecentReauthentication,
  validateAccountDeletionRequest
} from "@/lib/privacy/deletion-request";
import { encryptDeletionNotificationRecipient } from "@/lib/privacy/deletion-notification-crypto";

export const runtime = "nodejs";

const allowedRequestTypes = new Set(["access", "export", "deletion", "portability", "correction", "restriction"]);

type RequestBody = {
  request_type?: string;
  message?: string;
  confirmation?: unknown;
  impact_version?: unknown;
  idempotency_key?: unknown;
};

function safeDeletionJob(job: Record<string, unknown> | null | undefined) {
  if (!job) return null;
  return {
    id: job.id,
    state: job.state,
    stage: job.stage,
    attempt_count: job.attempt_count,
    next_attempt_at: job.next_attempt_at,
    last_error_code: job.last_error_code,
    notification_status: job.notification_status,
    created_at: job.created_at,
    completed_at: job.completed_at
  };
}

export async function GET(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase
    .from("privacy_requests")
    .select("id,request_type,status,created_at,updated_at,completed_at")
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Privacy requests could not be loaded." }, { status: 400 });

  let deletionJob = null;
  if (hasSupabaseAdminConfig()) {
    const admin = createSupabaseAdminClient();
    const job = await admin
      .from("account_deletion_jobs")
      .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at")
      .eq("user_id", context.user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (job.error) console.error("Plaivra deletion job status failed:", job.error.message);
    deletionJob = safeDeletionJob(job.data as Record<string, unknown> | null);
  }

  return NextResponse.json({ requests: data ?? [], deletion_job: deletionJob }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "privacy-request", 5, 60_000);
  if (limited) return limited;

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestType = body.request_type?.trim() ?? "";
  if (!allowedRequestTypes.has(requestType)) {
    return NextResponse.json({ error: "Unsupported privacy request type." }, { status: 400 });
  }
  if (body.message !== undefined && (typeof body.message !== "string" || body.message.trim().length > 500)) {
    return NextResponse.json({ error: "Privacy request notes must be plain text with at most 500 characters." }, { status: 400 });
  }

  if (requestType === "deletion") {
    return createAccountDeletionRequest(context, body);
  }

  const existing = await context.supabase
    .from("privacy_requests")
    .select("id,status,created_at")
    .eq("user_id", context.user.id)
    .eq("request_type", requestType)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    console.error("Plaivra privacy request lookup failed:", existing.error.message);
    return NextResponse.json({ error: "Privacy request status could not be checked." }, { status: 500 });
  }
  if (existing.data) return NextResponse.json({ request: existing.data, already_exists: true });

  const { data, error } = await context.supabase
    .from("privacy_requests")
    .insert({
      user_id: context.user.id,
      request_type: requestType,
      status: "pending",
      message: body.message?.trim() || null
    })
    .select("id,request_type,status,created_at")
    .single();
  if (error) {
    console.error("Plaivra privacy request creation failed:", error.message);
    return NextResponse.json({ error: "The privacy request could not be submitted." }, { status: 500 });
  }
  return NextResponse.json({ request: data, already_exists: false }, { status: 201 });
}

async function createAccountDeletionRequest(
  context: Exclude<Awaited<ReturnType<typeof requireUser>>, NextResponse>,
  body: RequestBody
) {
  if (!hasSupabaseAdminConfig()) {
    return NextResponse.json({ error: "Account deletion processing is not configured." }, { status: 503 });
  }
  const validated = validateAccountDeletionRequest(body);
  if (!validated.ok) return NextResponse.json({ error: validated.message, code: validated.code }, { status: 400 });
  if (!isRecentReauthentication(context.user.last_sign_in_at)) {
    return NextResponse.json(
      { error: "Sign in again before requesting account deletion.", code: "recent_reauthentication_required" },
      { status: 403 }
    );
  }

  const admin = createSupabaseAdminClient();
  const replay = await admin.from("account_deletion_jobs")
    .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
    .eq("idempotency_key_hash", validated.idempotencyKeyHash).maybeSingle();
  if (replay.error) return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
  if (replay.data) {
    return NextResponse.json({
      request: { id: replay.data.request_id, request_type: "deletion", status: replay.data.state },
      deletion_job: safeDeletionJob(replay.data), already_exists: true, deletion_queued: true
    });
  }

  const activeRequest = await admin.from("privacy_requests")
    .select("id,request_type,status,created_at")
    .eq("user_id", context.user.id).eq("request_type", "deletion")
    .in("status", ["pending", "in_progress"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (activeRequest.error) return NextResponse.json({ error: "Deletion request status could not be checked." }, { status: 500 });
  if (activeRequest.data) {
    const existingJob = await admin.from("account_deletion_jobs")
      .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
      .eq("request_id", activeRequest.data.id).maybeSingle();
    if (existingJob.error) return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
    if (existingJob.data) return NextResponse.json({ request: activeRequest.data, deletion_job: safeDeletionJob(existingJob.data), already_exists: true, deletion_queued: true });
  }

  const queued = await admin.rpc("food_catalog_queue_account_deletion", {
    p_user_id: context.user.id,
    p_request_id: activeRequest.data?.id ?? null,
    p_subject_hash: deletionSubjectHash(context.user.id),
    p_idempotency_key_hash: validated.idempotencyKeyHash,
    p_reauthenticated_at: new Date().toISOString(),
    p_impact_version: ACCOUNT_DELETION_IMPACT_VERSION,
    p_notification_recipient_ciphertext: context.user.email && serverEnv.privacyNotificationEncryptionKey
      ? encryptDeletionNotificationRecipient(context.user.email, serverEnv.privacyNotificationEncryptionKey)
      : null,
    p_evidence: { request_source: "account_settings", impact_version: ACCOUNT_DELETION_IMPACT_VERSION }
  });
  if (queued.error) {
    console.error("Plaivra durable deletion queue failed:", queued.error.message);
    if (queued.error.code === "23514") {
      return NextResponse.json({
        error: "Account deletion is blocked while this account is the final usable Food governance recovery Owner. Provision another usable Owner first."
      }, { status: 409 });
    }
    return NextResponse.json({ error: "The deletion request could not be queued safely; account access remains unchanged." }, { status: 500 });
  }
  const data = queued.data && typeof queued.data === "object" && !Array.isArray(queued.data)
    ? queued.data as Record<string, unknown> : null;
  if (!data || typeof data.requestId !== "string" || typeof data.jobId !== "string") {
    return NextResponse.json({ error: "Deletion queue returned an invalid durable authority result." }, { status: 500 });
  }

  return NextResponse.json({
    request: { id: data.requestId, request_type: "deletion", status: data.requestStatus ?? "pending", created_at: data.requestCreatedAt ?? null },
    deletion_job: safeDeletionJob({
      id: data.jobId, state: data.jobState ?? "queued", stage: data.jobStage ?? "queued",
      attempt_count: data.attemptCount ?? 0, next_attempt_at: data.nextAttemptAt ?? null,
      last_error_code: data.lastErrorCode ?? null, notification_status: data.notificationStatus ?? "pending",
      created_at: data.jobCreatedAt ?? null, completed_at: data.completedAt ?? null
    }),
    already_exists: Boolean(data.alreadyExists), deletion_queued: true
  }, { status: data.alreadyExists ? 200 : 201 });
}
