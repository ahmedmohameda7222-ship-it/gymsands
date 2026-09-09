import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETION_STAGES, deletionRetryDelayMinutes, processAccountDeletionJob } from "./account-deletion-worker";

type QueryCall = {
  table: string;
  action: string;
  values?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

function workerAdminMock({
  legalHold = false,
  providers = [] as string[],
  purgeError = false,
  authDeleteError = false,
  accountState = "active",
  governancePrincipalActive = true
} = {}) {
  const calls: QueryCall[] = [];
  const irreversibleOrder: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    irreversibleOrder.push(`rpc:${name}`);
    if ((name === "purge_account_application_data_atomic" || name === "food_catalog_purge_account_application_data_for_deletion_job") && purgeError) {
      return { data: null, error: { message: "purge failed" } };
    }
    return {
      data: name === "purge_account_application_data_atomic" || name === "food_catalog_purge_account_application_data_for_deletion_job"
        ? {
            application_data_purged: true,
            application_data_purge_checkpointed: true,
            profile_already_absent: false,
            profiles_deleted: 1
          }
        : null,
      error: null,
      args
    };
  });
  const deleteUser = vi.fn(async () => {
    irreversibleOrder.push("auth:deleteUser");
    return authDeleteError ? { error: { status: 503, message: "auth provider unavailable" } } : { error: null };
  });
  const updateUserById = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, action: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (table === "privacy_deletion_legal_holds") return { data: legalHold ? { id: "hold-a" } : null, error: null };
      if (table === "user_integrations") return { data: providers.map((provider) => ({ provider })), error: null };
      if (table === "account_access_states" && call.action === "select") {
        return {
          data: { state: accountState, disabled_at: accountState === "active" ? null : "2026-09-09T00:00:00.000Z" },
          error: null
        };
      }
      if (table === "food_catalog_governance_principals" && call.action === "select") {
        return {
          data: { active: governancePrincipalActive, revoked_at: governancePrincipalActive ? null : "2026-09-09T00:00:00.000Z" },
          error: null
        };
      }
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn((values: Record<string, unknown>) => { call.action = "update"; call.values = values; return builder; });
    builder.upsert = vi.fn((values: Record<string, unknown>) => { call.action = "upsert"; call.values = values; return builder; });
    builder.delete = vi.fn(() => { call.action = "delete"; return builder; });
    builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.is = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result());
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  });
  const client = {
    from,
    rpc,
    storage: { from: () => ({ list: vi.fn(async () => ({ data: [], error: null })), remove }) },
    auth: { admin: { deleteUser, updateUserById } }
  } as unknown as SupabaseClient;
  return { client, calls, rpc, deleteUser, updateUserById, remove, irreversibleOrder };
}

describe("account deletion worker contract", () => {
  it("keeps the irreversible dependency order explicit", () => {
    expect(ACCOUNT_DELETION_STAGES).toEqual([
      "revoking_connections",
      "disabling_access",
      "deleting_storage",
      "provider_cleanup",
      "deleting_database",
      "deleting_auth",
      "notification",
      "completed"
    ]);
  });

  it("uses bounded exponential retry delays", () => {
    expect(deletionRetryDelayMinutes(1)).toBe(5);
    expect(deletionRetryDelayMinutes(2)).toBe(10);
    expect(deletionRetryDelayMinutes(99)).toBe(1440);
  });

  it("blocks on a legal hold before storage or Auth deletion", async () => {
    const mock = workerAdminMock({ legalHold: true });
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "queued",
      attempt_count: 1, evidence: {}, notification_recipient_ciphertext: null
    });
    expect(result.state).toBe("blocked_legal_hold");
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });

  it("allows bounded terminal failure before the irreversible transition while leaving the account untouched", async () => {
    const mock = workerAdminMock({ providers: ["legacy-provider"], accountState: "active", governancePrincipalActive: true });
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "queued",
      attempt_count: 6, evidence: {}, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "failed", errorCode: "provider_cleanup_adapter_required" });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.updateUserById).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });

  it("preflights unknown provider adapters before irreversible deletion", async () => {
    const mock = workerAdminMock({ providers: ["legacy-provider"] });
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "queued",
      attempt_count: 1, evidence: {}, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "retry_scheduled", errorCode: "provider_cleanup_adapter_required" });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.updateUserById).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
    expect(mock.calls.find((call) => call.table === "user_integrations")?.filters).toContainEqual(["user_id", "user-a"]);
  });

  it("purges application data through the job-bound checkpoint RPC before deleting the Auth user", async () => {
    const mock = workerAdminMock();
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "queued",
      attempt_count: 1, evidence: {}, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "completed" });
    expect(mock.rpc).toHaveBeenCalledWith("food_catalog_begin_account_deletion", {
      p_user_id: "user-a",
      p_deletion_job_id: "job-a"
    });
    expect(mock.rpc).toHaveBeenCalledWith("food_catalog_purge_account_application_data_for_deletion_job", {
      p_user_id: "user-a",
      p_deletion_job_id: "job-a"
    });
    expect(mock.deleteUser).toHaveBeenCalledWith("user-a", false);
    expect(mock.irreversibleOrder).toEqual([
      "rpc:food_catalog_begin_account_deletion",
      "rpc:food_catalog_purge_account_application_data_for_deletion_job",
      "auth:deleteUser"
    ]);
  });

  it("keeps an exhausted post-begin purge failure durably retryable and surfaces attention", async () => {
    const mock = workerAdminMock({ purgeError: true, accountState: "deletion_processing", governancePrincipalActive: false });
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "deleting_database",
      attempt_count: 6, evidence: { irreversible_transition_started: true }, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "retry_scheduled", errorCode: "database_application_purge_failed" });
    const jobUpdates = mock.calls.filter((call) => call.table === "account_deletion_jobs" && call.action === "update");
    expect(jobUpdates.at(-1)?.values).toMatchObject({
      state: "retry_scheduled",
      last_error_code: "database_application_purge_failed",
      evidence: expect.objectContaining({
        retry_attention_required: true,
        retry_threshold_exceeded_attempt_count: 6
      })
    });
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });

  it("checkpoints canonical purge before Auth deletion so an Auth retry does not repeat begin or purge", async () => {
    const first = workerAdminMock({ authDeleteError: true, accountState: "deletion_processing", governancePrincipalActive: false });
    const firstResult = await processAccountDeletionJob(first.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "deleting_database",
      attempt_count: 6, evidence: { irreversible_transition_started: true }, notification_recipient_ciphertext: null
    });
    expect(firstResult).toMatchObject({ state: "retry_scheduled", errorCode: "auth_provider_delete_failed" });
    expect(first.rpc).toHaveBeenCalledTimes(1);
    expect(first.rpc).toHaveBeenCalledWith("food_catalog_purge_account_application_data_for_deletion_job", {
      p_user_id: "user-a",
      p_deletion_job_id: "job-a"
    });
    expect(first.calls.some((call) => call.table === "account_deletion_jobs" && call.action === "update" && call.values?.stage === "deleting_auth")).toBe(true);

    const resumed = workerAdminMock({ accountState: "deletion_processing", governancePrincipalActive: false });
    const resumedResult = await processAccountDeletionJob(resumed.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "deleting_auth",
      attempt_count: 7, evidence: { irreversible_transition_started: true, application_data_purge_checkpointed: true }, notification_recipient_ciphertext: null
    });
    expect(resumedResult).toMatchObject({ state: "completed" });
    expect(resumed.rpc).not.toHaveBeenCalled();
    expect(resumed.remove).not.toHaveBeenCalled();
    expect(resumed.updateUserById).not.toHaveBeenCalled();
    expect(resumed.deleteUser).toHaveBeenCalledTimes(1);
  });

  it("does not delete the Auth user when the atomic application purge fails", async () => {
    const mock = workerAdminMock({ purgeError: true, accountState: "deletion_processing", governancePrincipalActive: false });
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "deleting_database",
      attempt_count: 1, evidence: { irreversible_transition_started: true }, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "retry_scheduled", errorCode: "database_application_purge_failed" });
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("food_catalog_purge_account_application_data_for_deletion_job", {
      p_user_id: "user-a",
      p_deletion_job_id: "job-a"
    });
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });

  it("resumes a notification-stage retry without repeating deletion work", async () => {
    const mock = workerAdminMock();
    const result = await processAccountDeletionJob(mock.client, {
      id: "job-a", request_id: "request-a", user_id: "user-a", state: "processing", stage: "notification",
      attempt_count: 2, evidence: { auth_user_deleted: true }, notification_recipient_ciphertext: null
    });
    expect(result).toMatchObject({ state: "completed", notificationStatus: "not_configured" });
    expect(mock.remove).not.toHaveBeenCalled();
    expect(mock.updateUserById).not.toHaveBeenCalled();
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });
});
