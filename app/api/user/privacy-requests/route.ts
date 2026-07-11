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

async function revokeDeletionConnections(userId: string, accessToken: string) {
  const admin = createSupabaseAdminClient();
  const revokedAt = new Date().toISOString();
  const connections = await admin
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: revokedAt })
    .eq("user_id", userId)
    .eq("is_active", true);
  const tokens = await admin
    .from("mcp_oauth_access_tokens")
    .update({ revoked_at: revokedAt })
    .eq("user_id", userId)
    .is("revoked_at", null);
  const sessions = await admin.auth.admin.signOut(accessToken, "global");
  if (connections.error || tokens.error || sessions.error) {
    console.error("Could not revoke connections/sessions while creating deletion request:", connections.error?.message ?? tokens.error?.message ?? sessions.error?.message);
    return false;
  }
  return true;
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
  if (!validated.ok) {
    return NextResponse.json({ error: validated.message, code: validated.code }, { status: 400 });
  }
  if (!isRecentReauthentication(context.user.last_sign_in_at)) {
    return NextResponse.json(
      { error: "Sign in again before requesting account deletion.", code: "recent_reauthentication_required" },
      { status: 403 }
    );
  }

  const admin = createSupabaseAdminClient();
  const replay = await admin
    .from("account_deletion_jobs")
    .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
    .eq("idempotency_key_hash", validated.idempotencyKeyHash)
    .maybeSingle();
  if (replay.error) {
    console.error("Plaivra deletion idempotency lookup failed:", replay.error.message);
    return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
  }
  if (replay.data) {
    return NextResponse.json({
      request: { id: replay.data.request_id, request_type: "deletion", status: replay.data.state },
      deletion_job: safeDeletionJob(replay.data),
      already_exists: true,
      chatgpt_access_revoked: true
    });
  }

  const activeRequest = await admin
    .from("privacy_requests")
    .select("id,request_type,status,created_at")
    .eq("user_id", context.user.id)
    .eq("request_type", "deletion")
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeRequest.error) {
    console.error("Plaivra deletion request lookup failed:", activeRequest.error.message);
    return NextResponse.json({ error: "Deletion request status could not be checked." }, { status: 500 });
  }

  if (activeRequest.data) {
    const existingJob = await admin
      .from("account_deletion_jobs")
      .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at,request_id")
      .eq("request_id", activeRequest.data.id)
      .maybeSingle();
    if (existingJob.error) {
      console.error("Plaivra existing deletion job lookup failed:", existingJob.error.message);
      return NextResponse.json({ error: "Deletion request status could not be verified." }, { status: 500 });
    }
    if (existingJob.data) {
      return NextResponse.json({
        request: activeRequest.data,
        deletion_job: safeDeletionJob(existingJob.data),
        already_exists: true,
        chatgpt_access_revoked: true
      });
    }
  }

  const reauthenticatedAt = new Date().toISOString();
  let deletionRequest = activeRequest.data;
  if (!deletionRequest) {
    const created = await admin
      .from("privacy_requests")
      .insert({
        user_id: context.user.id,
        request_type: "deletion",
        status: "pending",
        message: "Submitted after explicit impact acknowledgement.",
        reauthenticated_at: reauthenticatedAt,
        impact_version: ACCOUNT_DELETION_IMPACT_VERSION,
        idempotency_key_hash: validated.idempotencyKeyHash
      })
      .select("id,request_type,status,created_at")
      .single();
    if (created.error || !created.data) {
      console.error("Plaivra deletion request creation failed:", created.error?.message);
      return NextResponse.json({ error: "The deletion request could not be submitted." }, { status: 500 });
    }
    deletionRequest = created.data;
  }

  const chatgptAccessRevoked = await revokeDeletionConnections(context.user.id, context.accessToken);
  if (!chatgptAccessRevoked) {
    return NextResponse.json({ error: "ChatGPT access could not be revoked; no deletion job was queued." }, { status: 503 });
  }

  const state = await admin.from("account_access_states").upsert({
    user_id: context.user.id,
    state: "deletion_pending",
    reason_code: "member_requested_deletion"
  }, { onConflict: "user_id" });
  if (state.error) {
    console.error("Plaivra deletion access-state update failed:", state.error.message);
    return NextResponse.json({ error: "The deletion request could not be queued safely." }, { status: 500 });
  }

  const job = await admin
    .from("account_deletion_jobs")
    .insert({
      request_id: deletionRequest.id,
      user_id: context.user.id,
      subject_hash: deletionSubjectHash(context.user.id),
      idempotency_key_hash: validated.idempotencyKeyHash,
      state: "queued",
      stage: "queued",
      notification_recipient_ciphertext: context.user.email
        && serverEnv.privacyNotificationEncryptionKey
        ? encryptDeletionNotificationRecipient(context.user.email, serverEnv.privacyNotificationEncryptionKey)
        : null,
      evidence: { request_source: "account_settings", impact_version: ACCOUNT_DELETION_IMPACT_VERSION }
    })
    .select("id,state,stage,attempt_count,next_attempt_at,last_error_code,notification_status,created_at,completed_at")
    .single();
  if (job.error || !job.data) {
    console.error("Plaivra deletion job enqueue failed:", job.error?.message);
    return NextResponse.json({ error: "The deletion request was recorded, but processing could not be queued. Contact Plaivra support and do not submit a second request." }, { status: 500 });
  }

  return NextResponse.json({
    request: deletionRequest,
    deletion_job: safeDeletionJob(job.data),
    already_exists: Boolean(activeRequest.data),
    chatgpt_access_revoked: true
  }, { status: activeRequest.data ? 200 : 201 });
}
