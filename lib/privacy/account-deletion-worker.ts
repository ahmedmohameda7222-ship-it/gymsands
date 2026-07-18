import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/integrations/env";
import { decryptDeletionNotificationRecipient } from "@/lib/privacy/deletion-notification-crypto";
import { sendResendEmail } from "@/lib/integrations/resend";

export type AccountDeletionJob = {
  id: string;
  request_id: string | null;
  user_id: string | null;
  state: string;
  stage: string;
  attempt_count: number;
  evidence: Record<string, unknown> | null;
  notification_recipient_ciphertext: string | null;
};

export const ACCOUNT_DELETION_STAGES = [
  "revoking_connections",
  "disabling_access",
  "deleting_storage",
  "provider_cleanup",
  "deleting_database",
  "notification",
  "completed"
] as const;

const ACCOUNT_DELETION_STAGE_INDEX = new Map<string, number>([
  ["queued", -1],
  ...ACCOUNT_DELETION_STAGES.map((stage, index) => [stage, index] as const)
]);

function shouldRunDeletionStage(currentStage: string, targetStage: typeof ACCOUNT_DELETION_STAGES[number]) {
  return (ACCOUNT_DELETION_STAGE_INDEX.get(currentStage) ?? -1) <= (ACCOUNT_DELETION_STAGE_INDEX.get(targetStage) ?? 0);
}

class DeletionWorkerError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export function deletionRetryDelayMinutes(attemptCount: number) {
  return Math.min(24 * 60, Math.max(5, 5 * 2 ** Math.max(0, attemptCount - 1)));
}

async function updateJob(admin: SupabaseClient, jobId: string, patch: Record<string, unknown>) {
  const result = await admin.from("account_deletion_jobs").update(patch).eq("id", jobId);
  if (result.error) throw new DeletionWorkerError("job_state_update_failed");
}

async function checkLegalHold(admin: SupabaseClient, userId: string) {
  const result = await admin
    .from("privacy_deletion_legal_holds")
    .select("id")
    .eq("user_id", userId)
    .is("released_at", null)
    .limit(1)
    .maybeSingle();
  if (result.error) throw new DeletionWorkerError("legal_hold_check_failed");
  return Boolean(result.data);
}

async function revokeConnections(admin: SupabaseClient, userId: string) {
  const revokedAt = new Date().toISOString();
  const connections = await admin
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: revokedAt })
    .eq("user_id", userId);
  const tokens = await admin
    .from("mcp_oauth_access_tokens")
    .update({ revoked_at: revokedAt })
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (connections.error || tokens.error) throw new DeletionWorkerError("connection_revocation_failed");
}

async function disableAccount(admin: SupabaseClient, userId: string) {
  const result = await admin.from("account_access_states").upsert({
    user_id: userId,
    state: "deletion_processing",
    reason_code: "account_deletion_in_progress",
    disabled_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  const authDisable = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (result.error || authDisable.error) throw new DeletionWorkerError("account_disable_failed");
}

async function deleteStorage(admin: SupabaseClient, userId: string) {
  const photos = await admin
    .from("progress_photos")
    .select("storage_path")
    .eq("user_id", userId)
    .limit(5000);
  if (photos.error) throw new DeletionWorkerError("storage_manifest_failed");
  const paths = (photos.data ?? [])
    .map((row) => row.storage_path)
    .filter((path): path is string => typeof path === "string" && path.length > 0);
  const storage = admin.storage.from("progress-photos");
  const discovered = await listStoragePaths(storage, userId);
  const allPaths = [...new Set([...paths, ...discovered])];
  for (let index = 0; index < allPaths.length; index += 1000) {
    const removed = await storage.remove(allPaths.slice(index, index + 1000));
    if (removed.error) throw new DeletionWorkerError("storage_delete_failed");
  }
  return { progress_photo_objects: allPaths.length };
}

async function listStoragePaths(
  storage: ReturnType<SupabaseClient["storage"]["from"]>,
  prefix: string
): Promise<string[]> {
  const paths: string[] = [];
  for (let offset = 0; offset < 10_000; offset += 1000) {
    const listed = await storage.list(prefix, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
    if (listed.error) throw new DeletionWorkerError("storage_manifest_failed");
    const entries = listed.data ?? [];
    for (const entry of entries) {
      const path = `${prefix}/${entry.name}`;
      if (entry.id) paths.push(path);
      else paths.push(...await listStoragePaths(storage, path));
    }
    if (entries.length < 1000) break;
  }
  return paths;
}

async function verifyProviderCleanup(admin: SupabaseClient, userId: string) {
  const integrations = await admin
    .from("user_integrations")
    .select("provider")
    .eq("user_id", userId)
    .limit(100);
  if (integrations.error) throw new DeletionWorkerError("provider_cleanup_check_failed");
  if ((integrations.data ?? []).length > 0) {
    throw new DeletionWorkerError("provider_cleanup_adapter_required");
  }
  return { external_provider_connections: 0 };
}

async function purgeDatabaseAndAuth(admin: SupabaseClient, userId: string) {
  const externalLogs = await admin.from("external_api_logs").delete().eq("user_id", userId);
  const emailLogs = await admin.from("email_logs").delete().eq("user_id", userId);
  const importOwnership = await admin.from("exercise_import_batches").update({ created_by: null }).eq("created_by", userId);
  if (externalLogs.error || emailLogs.error || importOwnership.error) {
    throw new DeletionWorkerError("database_dependency_cleanup_failed");
  }

  const purged = await admin.rpc("purge_account_application_data_atomic", { p_user_id: userId });
  if (purged.error) throw new DeletionWorkerError("database_application_purge_failed");
  const purgeEvidence = purged.data && typeof purged.data === "object" && !Array.isArray(purged.data)
    ? purged.data as Record<string, unknown>
    : { application_data_purged: true };

  const deleted = await admin.auth.admin.deleteUser(userId, false);
  const deletionStatus = deleted.error && "status" in deleted.error ? Number(deleted.error.status) : null;
  const alreadyAbsent = Boolean(deleted.error) && (deletionStatus === 404 || /not found/i.test(deleted.error?.message ?? ""));
  if (deleted.error && !alreadyAbsent) throw new DeletionWorkerError("auth_provider_delete_failed");
  return {
    ...purgeEvidence,
    auth_user_deleted: !alreadyAbsent,
    auth_user_already_absent: alreadyAbsent
  };
}

async function sendCompletionNotification(job: AccountDeletionJob) {
  if (!job.notification_recipient_ciphertext) return "not_configured" as const;
  if (!serverEnv.privacyNotificationEncryptionKey || !serverEnv.resendApiKey || !serverEnv.resendFromEmail) {
    return "not_configured" as const;
  }
  const recipient = decryptDeletionNotificationRecipient(
    job.notification_recipient_ciphertext,
    serverEnv.privacyNotificationEncryptionKey
  );
  try {
    await sendResendEmail({
      apiKey: serverEnv.resendApiKey,
      from: serverEnv.resendFromEmail,
      to: recipient,
      subject: "Your Plaivra account deletion is complete",
      html: "<p>Your Plaivra account deletion has completed. Your account can no longer be used to sign in.</p><p>If you did not request this, contact Plaivra support and security immediately.</p>"
    });
  } catch {
    throw new DeletionWorkerError("completion_notification_failed");
  }
  return "sent" as const;
}

export async function processAccountDeletionJob(admin: SupabaseClient, job: AccountDeletionJob) {
  try {
    if (job.user_id && await checkLegalHold(admin, job.user_id)) {
      await admin.from("account_access_states").upsert({
        user_id: job.user_id,
        state: "legal_hold",
        reason_code: "active_legal_hold"
      }, { onConflict: "user_id" });
      await updateJob(admin, job.id, {
        state: "blocked_legal_hold",
        last_error_code: "active_legal_hold",
        locked_at: null
      });
      return { state: "blocked_legal_hold" as const };
    }

    let evidence = { ...(job.evidence ?? {}) };
    if (job.user_id) {
      // Preflight every external provider before storage or Auth deletion. The
      // account is already denied by deletion_pending, so failing closed here
      // does not restore access or falsely claim provider revocation.
      if (shouldRunDeletionStage(job.stage, "provider_cleanup")) {
        evidence = { ...evidence, ...await verifyProviderCleanup(admin, job.user_id) };
      }

      if (shouldRunDeletionStage(job.stage, "revoking_connections")) {
        await updateJob(admin, job.id, { stage: "revoking_connections", evidence });
        await revokeConnections(admin, job.user_id);
      }

      if (shouldRunDeletionStage(job.stage, "disabling_access")) {
        await updateJob(admin, job.id, { stage: "disabling_access", evidence });
        await disableAccount(admin, job.user_id);
      }

      if (shouldRunDeletionStage(job.stage, "deleting_storage")) {
        await updateJob(admin, job.id, { stage: "deleting_storage", evidence });
        evidence = { ...evidence, ...await deleteStorage(admin, job.user_id) };
      }

      if (shouldRunDeletionStage(job.stage, "provider_cleanup")) {
        await updateJob(admin, job.id, { stage: "provider_cleanup", evidence });
      }

      if (shouldRunDeletionStage(job.stage, "deleting_database")) {
        await updateJob(admin, job.id, { stage: "deleting_database", evidence });
        evidence = { ...evidence, ...await purgeDatabaseAndAuth(admin, job.user_id) };
      }
    }

    let notificationStatus: "sent" | "not_configured" = "not_configured";
    if (shouldRunDeletionStage(job.stage, "notification")) {
      await updateJob(admin, job.id, { stage: "notification", evidence });
      notificationStatus = await sendCompletionNotification(job);
    }

    await updateJob(admin, job.id, {
      state: "completed",
      stage: "completed",
      evidence,
      notification_status: notificationStatus,
      notification_recipient_ciphertext: null,
      last_error_code: null,
      locked_at: null,
      completed_at: new Date().toISOString()
    });
    return { state: "completed" as const, notificationStatus };
  } catch (error) {
    const code = error instanceof DeletionWorkerError ? error.code : "unexpected_deletion_worker_error";
    const failed = job.attempt_count >= 5;
    const retryAt = new Date(Date.now() + deletionRetryDelayMinutes(job.attempt_count) * 60_000).toISOString();
    await updateJob(admin, job.id, {
      state: failed ? "failed" : "retry_scheduled",
      last_error_code: code,
      next_attempt_at: retryAt,
      locked_at: null
    }).catch(() => undefined);
    return { state: failed ? "failed" as const : "retry_scheduled" as const, errorCode: code };
  }
}
