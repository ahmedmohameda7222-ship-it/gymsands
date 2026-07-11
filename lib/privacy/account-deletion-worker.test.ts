import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ACCOUNT_DELETION_STAGES, deletionRetryDelayMinutes, processAccountDeletionJob } from "./account-deletion-worker";

function workerAdminMock({ legalHold = false, providers = [] as string[] } = {}) {
  const calls: Array<{ table: string; action: string; filters: Array<[string, unknown]> }> = [];
  const deleteUser = vi.fn(async () => ({ error: null }));
  const updateUserById = vi.fn(async () => ({ error: null }));
  const remove = vi.fn(async () => ({ data: [], error: null }));
  const from = vi.fn((table: string) => {
    const call = { table, action: "select", filters: [] as Array<[string, unknown]> };
    calls.push(call);
    const result = () => {
      if (table === "privacy_deletion_legal_holds") return { data: legalHold ? { id: "hold-a" } : null, error: null };
      if (table === "user_integrations") return { data: providers.map((provider) => ({ provider })), error: null };
      return { data: null, error: null };
    };
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn(() => { call.action = "update"; return builder; });
    builder.upsert = vi.fn(() => { call.action = "upsert"; return builder; });
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
    storage: { from: () => ({ list: vi.fn(async () => ({ data: [], error: null })), remove }) },
    auth: { admin: { deleteUser, updateUserById } }
  } as unknown as SupabaseClient;
  return { client, calls, deleteUser, updateUserById, remove };
}

describe("account deletion worker contract", () => {
  it("keeps the irreversible dependency order explicit", () => {
    expect(ACCOUNT_DELETION_STAGES).toEqual([
      "revoking_connections",
      "disabling_access",
      "deleting_storage",
      "provider_cleanup",
      "deleting_database",
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
    expect(mock.deleteUser).not.toHaveBeenCalled();
    expect(mock.calls.find((call) => call.table === "user_integrations")?.filters).toContainEqual(["user_id", "user-a"]);
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
    expect(mock.deleteUser).not.toHaveBeenCalled();
  });
});
