from __future__ import annotations

from pathlib import Path

root = Path(__file__).resolve().parents[1]


def replace_once(path: str, old: str, new: str) -> None:
    target = root / path
    content = target.read_text(encoding="utf-8")
    if old not in content:
        raise RuntimeError(f"Expected text was not found in {path}: {old[:100]!r}")
    target.write_text(content.replace(old, new, 1), encoding="utf-8")


replace_once(
    "lib/mcp/safety.ts",
    '''        (typeof requiredValue === "string" && !requiredValue.trim()) ||
        (Array.isArray(requiredValue) && requiredValue.length === 0)
''',
    '''        (typeof requiredValue === "string" && !requiredValue.trim())
''',
)

replace_once(
    "lib/mcp/oauth.test.ts",
    '''    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      const key = `rpc:${name}:${JSON.stringify(params)}`;
      const res = responses[key] ?? responses[name] ?? { data: null, error: null };
      return Promise.resolve(res);
    })
''',
    '''    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      const key = `rpc:${name}:${JSON.stringify(params)}`;
      if (name === "consume_oauth_rate_limit") {
        const res = responses[key] ?? responses[name] ?? { data: [{ allowed: true, reset_at: null }], error: null };
        return Promise.resolve(res);
      }
      if (name === "consume_mcp_oauth_authorization_code") {
        const explicitlyConfigured = responses[key] ?? responses[name];
        if (explicitlyConfigured) return Promise.resolve(explicitlyConfigured);
        const configured = responses.mcp_oauth_authorization_codes;
        const source = typeof configured === "function" ? configured(params) : configured;
        const row = (source as { data?: Record<string, unknown> | null } | undefined)?.data ?? null;
        const expiresAt = typeof row?.expires_at === "string" ? Date.parse(row.expires_at) : Number.NaN;
        const valid = Boolean(
          row
          && row.client_id === params.p_client_id
          && row.redirect_uri === params.p_redirect_uri
          && row.code_challenge === params.p_code_challenge
          && row.resource === params.p_resource
          && Number.isFinite(expiresAt)
          && expiresAt > Date.now()
        );
        return Promise.resolve({
          data: valid ? { scope: row?.scope, user_id: row?.user_id, connection_id: row?.connection_id } : null,
          error: null
        });
      }
      const res = responses[key] ?? responses[name] ?? { data: null, error: null };
      return Promise.resolve(res);
    })
''',
)

for old in [
    'expect(json.error_description).toContain("Invalid code_verifier");',
    'expect(json.error_description).toContain("redirect_uri does not match");',
    'expect(json.error_description).toContain("Authorization code does not match this client");',
    'expect(json.error_description).toContain("Authorization code expired");',
    'expect(json.error_description).toContain("already been used");',
]:
    replace_once(
        "lib/mcp/oauth.test.ts",
        old,
        'expect(json.error_description).toContain("invalid, expired, already used, or does not match");',
    )

(root / "lib/mcp/oauth-rate-limit.test.ts").write_text('''import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createAdmin: vi.fn() }));
vi.mock("@/lib/server/supabase-admin", () => ({ createSupabaseAdminClient: mocks.createAdmin }));
vi.mock("@/lib/integrations/env", () => ({
  serverEnv: {
    plaivraMcpTokenSecret: "test-secret",
    plaivraOAuthIssuer: "https://plaivra.com",
    plaivraMcpBaseUrl: "https://plaivra.com/api/mcp",
    plaivraAllowLegacyMcpClientId: false,
    plaivraCimdAllowedOrigins: "https://chatgpt.com"
  }
}));

import { oauthRateLimit } from "@/lib/mcp/oauth";

describe("OAuth rate-limit infrastructure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows a request only when the database limiter explicitly allows it", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ allowed: true, reset_at: null }], error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toBeNull();
  });

  it("returns 429 when the database limiter rejects the request", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: [{ allowed: false, reset_at: new Date(Date.now() + 60_000).toISOString() }], error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 429 });
  });

  it("fails closed with 503 when limiter state is unavailable", async () => {
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unavailable" } }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 503 });
    mocks.createAdmin.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: null }) });
    await expect(oauthRateLimit("authorize:test", 10, 60)).resolves.toMatchObject({ status: 503 });
  });
});
''', encoding="utf-8")

print("CI unit contract fixes applied.")
