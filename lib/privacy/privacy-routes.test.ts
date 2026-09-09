import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({
  requireUser: vi.fn(),
  rateLimit: vi.fn(() => null),
  adminClient: null as SupabaseClient | null
}));

vi.mock("@/lib/integrations/env", () => ({ requireUser: mocks.requireUser }));
vi.mock("@/lib/integrations/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/server/supabase-admin", () => ({
  hasSupabaseAdminConfig: () => Boolean(mocks.adminClient),
  createSupabaseAdminClient: () => mocks.adminClient
}));
vi.mock("@/lib/privacy/deletion-notification-crypto", () => ({
  encryptDeletionNotificationRecipient: () => "v1.test.test.test"
}));

import { GET, POST } from "@/app/api/user/privacy-requests/route";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

type QueryCall = {
  table: string;
  action: "select" | "insert" | "update";
  values?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
};

type DeletionJobFixture = {
  id: string;
  request_id: string;
  user_id: string;
  state: string;
  stage: string;
  attempt_count: number;
  next_attempt_at: string | null;
  last_error_code: string | null;
  notification_status: string;
  created_at: string;
  completed_at: string | null;
  idempotency_key_hash?: string;
};

function privacySupabaseMock({
  replayJob = null as DeletionJobFixture | null,
  activeDeletionRequest = null as { id: string; request_type: string; status: string; created_at: string } | null,
  existingJob = null as DeletionJobFixture | null
} = {}) {
  const calls: QueryCall[] = [];
  const rpc = vi.fn(async (name: string) => {
    if (name === "food_catalog_queue_account_deletion") {
      return {
        data: {
          requestId: "request-a",
          requestStatus: "pending",
          requestCreatedAt: "2026-09-09T00:00:00.000Z",
          jobId: "job-a",
          jobState: "queued",
          jobStage: "queued",
          attemptCount: 0,
          nextAttemptAt: null,
          lastErrorCode: null,
          notificationStatus: "pending",
          jobCreatedAt: "2026-09-09T00:00:00.000Z",
          completedAt: null,
          alreadyExists: false
        },
        error: null
      };
    }
    return { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, action: "select", filters: [] };
    let recorded = false;
    const record = () => {
      if (!recorded) calls.push(call);
      recorded = true;
    };
    const ownerMatches = (job: DeletionJobFixture) => {
      const ownerFilter = call.filters.find(([field]) => field === "user_id");
      return !ownerFilter || ownerFilter[1] === job.user_id;
    };
    const result = (single = false) => {
      record();
      if (table === "privacy_requests" && call.action === "insert") {
        return { data: { id: "request-a", request_type: "deletion", status: "pending" }, error: null };
      }
      if (table === "account_deletion_jobs" && call.filters.some(([field]) => field === "idempotency_key_hash")) {
        return { data: replayJob && ownerMatches(replayJob) ? replayJob : null, error: null };
      }
      if (table === "account_deletion_jobs" && call.filters.some(([field]) => field === "request_id")) {
        return { data: existingJob && ownerMatches(existingJob) ? existingJob : null, error: null };
      }
      if (table === "privacy_requests" && call.filters.some(([field, value]) => field === "request_type" && value === "deletion")) {
        const ownerFilter = call.filters.find(([field]) => field === "user_id");
        const owned = !ownerFilter || ownerFilter[1] === userA;
        return { data: owned ? activeDeletionRequest : null, error: null };
      }
      if (table === "privacy_requests" && call.filters.some(([field]) => field === "request_type")) {
        return { data: null, error: null };
      }
      if (table === "privacy_requests") {
        const rows = [{ id: "request-a", request_type: "access", status: "pending" }];
        return { data: single ? rows[0] : rows, error: null };
      }
      return { data: null, error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((values: Record<string, unknown>) => {
      call.action = "insert";
      call.values = values;
      return builder;
    });
    builder.update = vi.fn((values: Record<string, unknown>) => {
      call.action = "update";
      call.values = values;
      return builder;
    });
    builder.upsert = vi.fn((values: Record<string, unknown>) => {
      call.action = "insert";
      call.values = values;
      return builder;
    });
    builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.is = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => result(true));
    builder.single = vi.fn(async () => result(true));
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  });
  return {
    client: {
      from,
      rpc,
      auth: { admin: { signOut: vi.fn(async () => ({ error: null })) } }
    } as unknown as SupabaseClient,
    calls,
    rpc
  };
}

describe("privacy request routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockReturnValue(null);
    mocks.adminClient = null;
  });

  it("lists only the authenticated user's requests", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userA }, supabase: client });
    const response = await GET(new Request("https://plaivra.test/api/user/privacy-requests", {
      headers: { Authorization: "Bearer test" }
    }));
    expect(response.status).toBe(200);
    expect(calls[0]).toMatchObject({ table: "privacy_requests" });
    expect(calls[0].filters).toContainEqual(["user_id", userA]);
  });

  it("rejects notes longer than 500 characters before writing", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.requireUser.mockResolvedValue({ user: { id: userA }, supabase: client });
    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({ request_type: "access", message: "x".repeat(501) })
    }));
    expect(response.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("rejects a direct deletion API bypass without recent reauthentication", async () => {
    const { client, calls } = privacySupabaseMock();
    mocks.adminClient = client;
    mocks.requireUser.mockResolvedValue({
      user: { id: userA, last_sign_in_at: new Date(Date.now() - 20 * 60_000).toISOString(), email: null },
      supabase: client,
      accessToken: "test"
    });
    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "deletion",
        confirmation: "DELETE MY PLAIVRA ACCOUNT",
        impact_version: "2026-07-1",
        idempotency_key: "request_key_123456789"
      })
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "recent_reauthentication_required" });
    expect(calls.find((call) => call.action === "insert")).toBeUndefined();
  });

  it("forces the authenticated owner and queues durable deletion authority without inline revocation", async () => {
    const { client, calls, rpc } = privacySupabaseMock();
    mocks.adminClient = client;
    mocks.requireUser.mockResolvedValue({
      user: { id: userA, last_sign_in_at: new Date().toISOString(), email: null },
      supabase: client,
      accessToken: "test"
    });
    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "deletion",
        user_id: userB,
        confirmation: "DELETE MY PLAIVRA ACCOUNT",
        impact_version: "2026-07-1",
        idempotency_key: "request_key_123456789"
      })
    }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      request: { id: "request-a", request_type: "deletion", status: "pending" },
      deletion_job: { id: "job-a", state: "queued", stage: "queued", attempt_count: 0 },
      already_exists: false,
      deletion_queued: true
    });

    expect(rpc).toHaveBeenCalledWith("food_catalog_queue_account_deletion", expect.objectContaining({
      p_user_id: userA,
      p_request_id: null,
      p_impact_version: "2026-07-1"
    }));
    expect(rpc).not.toHaveBeenCalledWith("food_catalog_begin_account_deletion", expect.anything());
    expect(calls.find((call) => call.table === "privacy_requests" && call.action === "insert")).toBeUndefined();
    expect(calls.find((call) => call.table === "account_deletion_jobs" && call.action === "insert")).toBeUndefined();
    expect(calls.find((call) => call.table === "chatgpt_connections" && call.action === "update")).toBeUndefined();
    const replayLookup = calls.find((call) => call.table === "account_deletion_jobs" && call.filters.some(([field]) => field === "idempotency_key_hash"));
    expect(replayLookup?.filters).toContainEqual(["user_id", userA]);
  });

  it("does not expose another user's deletion replay metadata for a supplied idempotency key", async () => {
    const replayJob: DeletionJobFixture = {
      id: "job-b",
      request_id: "request-b",
      user_id: userB,
      state: "retry_scheduled",
      stage: "deleting_database",
      attempt_count: 7,
      next_attempt_at: "2026-09-10T00:00:00.000Z",
      last_error_code: "private-user-b-error",
      notification_status: "pending",
      created_at: "2026-09-09T00:00:00.000Z",
      completed_at: null,
      idempotency_key_hash: "request_key_123456789"
    };
    const { client, calls, rpc } = privacySupabaseMock({ replayJob });
    mocks.adminClient = client;
    mocks.requireUser.mockResolvedValue({
      user: { id: userA, last_sign_in_at: new Date().toISOString(), email: null },
      supabase: client,
      accessToken: "test"
    });

    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "deletion",
        confirmation: "DELETE MY PLAIVRA ACCOUNT",
        impact_version: "2026-07-1",
        idempotency_key: "request_key_123456789"
      })
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({ deletion_job: { id: "job-a" }, already_exists: false, deletion_queued: true });
    expect(JSON.stringify(payload)).not.toContain("job-b");
    expect(JSON.stringify(payload)).not.toContain("request-b");
    expect(JSON.stringify(payload)).not.toContain("private-user-b-error");
    expect(rpc).toHaveBeenCalledWith("food_catalog_queue_account_deletion", expect.objectContaining({ p_user_id: userA }));
    const replayLookup = calls.find((call) => call.table === "account_deletion_jobs" && call.filters.some(([field]) => field === "idempotency_key_hash"));
    expect(replayLookup?.filters).toContainEqual(["user_id", userA]);
  });

  it("owner-scopes the active-request deletion job replay lookup too", async () => {
    const activeDeletionRequest = {
      id: "request-a",
      request_type: "deletion",
      status: "pending",
      created_at: "2026-09-09T00:00:00.000Z"
    };
    const existingJob: DeletionJobFixture = {
      id: "job-b",
      request_id: "request-a",
      user_id: userB,
      state: "queued",
      stage: "queued",
      attempt_count: 0,
      next_attempt_at: null,
      last_error_code: null,
      notification_status: "pending",
      created_at: "2026-09-09T00:00:00.000Z",
      completed_at: null
    };
    const { client, calls, rpc } = privacySupabaseMock({ activeDeletionRequest, existingJob });
    mocks.adminClient = client;
    mocks.requireUser.mockResolvedValue({
      user: { id: userA, last_sign_in_at: new Date().toISOString(), email: null },
      supabase: client,
      accessToken: "test"
    });

    const response = await POST(new Request("https://plaivra.test/api/user/privacy-requests", {
      method: "POST",
      headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
      body: JSON.stringify({
        request_type: "deletion",
        confirmation: "DELETE MY PLAIVRA ACCOUNT",
        impact_version: "2026-07-1",
        idempotency_key: "request_key_abcdefghijk"
      })
    }));

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith("food_catalog_queue_account_deletion", expect.objectContaining({
      p_user_id: userA,
      p_request_id: "request-a"
    }));
    const activeJobLookup = calls.find((call) => call.table === "account_deletion_jobs" && call.filters.some(([field]) => field === "request_id"));
    expect(activeJobLookup?.filters).toContainEqual(["user_id", userA]);
  });
});
