import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  serverEnv: {
    cronSecret: "cron-test-secret",
    privacyRetentionOauthCodeHours: "24",
    privacyRetentionOauthTokenDays: "7",
    privacyRetentionIdempotencyDaysAfterExpiry: "1",
    privacyRetentionExecutionEnabled: false
  },
  rpc: vi.fn()
}));

vi.mock("@/lib/integrations/env", () => ({ serverEnv: mocks.serverEnv }));
vi.mock("@/lib/server/supabase-admin", () => ({
  createSupabaseAdminClient: () => ({ rpc: mocks.rpc })
}));

import { GET } from "@/app/api/internal/maintenance/oauth-cleanup/route";

describe("OAuth cleanup schedule", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.serverEnv.cronSecret = "cron-test-secret";
    mocks.serverEnv.privacyRetentionOauthCodeHours = "24";
    mocks.serverEnv.privacyRetentionOauthTokenDays = "7";
    mocks.serverEnv.privacyRetentionIdempotencyDaysAfterExpiry = "1";
    mocks.serverEnv.privacyRetentionExecutionEnabled = false;
    mocks.rpc.mockResolvedValue({
      data: { authorization_codes_deleted: 2, access_tokens_deleted: 1, client_assertions_deleted: 3 },
      error: null
    });
  });

  it("fails closed when the cron secret is absent or wrong", async () => {
    mocks.serverEnv.cronSecret = "";
    expect((await GET(new Request("https://app.plaivra.com/api/internal/maintenance/oauth-cleanup"))).status).toBe(503);
    mocks.serverEnv.cronSecret = "cron-test-secret";
    expect((await GET(new Request("https://app.plaivra.com/api/internal/maintenance/oauth-cleanup", {
      headers: { Authorization: "Bearer wrong" }
    }))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("runs only owner-configured bounded cleanup in dry-run mode by default", async () => {
    const response = await GET(new Request("https://app.plaivra.com/api/internal/maintenance/oauth-cleanup", {
      headers: { Authorization: "Bearer cron-test-secret" }
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("cleanup_expired_mcp_oauth_artifacts_v2", {
      p_batch_size: 1000,
      p_code_hours: 24,
      p_access_token_days: 7,
      p_dry_run: true
    });
    expect(mocks.rpc).toHaveBeenCalledWith("cleanup_expired_mcp_idempotency_keys_v2", {
      p_batch_size: 1000,
      p_days_after_expiry: 1,
      p_dry_run: true
    });
    expect(await response.json()).toMatchObject({ ok: true, destructive_execution: false });
  });

  it("does not invoke cleanup before retention periods are configured", async () => {
    mocks.serverEnv.privacyRetentionOauthCodeHours = "";
    const response = await GET(new Request("https://app.plaivra.com/api/internal/maintenance/oauth-cleanup", {
      headers: { Authorization: "Bearer cron-test-secret" }
    }));
    expect(response.status).toBe(200);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ configured: false, destructive_execution: false });
  });
});
