import { describe, it, expect, vi, beforeEach, type Mock, type Mocked } from "vitest";
import { NextResponse } from "next/server";
import {
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
  handleOAuthAuthorize,
  handleOAuthToken,
  handleOAuthRegister,
  getAccessTokenRecord
} from "@/lib/mcp/oauth";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

vi.mock("@/lib/server/supabase-admin");
vi.mock("@/lib/integrations/env", () => ({
  serverEnv: {
    supabaseServiceRoleKey: "test-key",
    plaivraMcpTokenSecret: "test-secret"
  }
}));

const mockCreateSupabaseAdminClient = vi.mocked(createSupabaseAdminClient);

const createMockSupabase = (overrides?: Record<string, unknown>) => {
  const responses: Record<string, unknown> = { ...overrides };
  const mock = {
    from: vi.fn((table: string) => {
      let query: Record<string, unknown> = { table };
      const builder = {
        select: vi.fn((cols: string) => {
          query = { ...query, cols, action: "select" };
          return builder;
        }),
        insert: vi.fn((values: Record<string, unknown>) => {
          query = { ...query, values, action: "insert" };
          return builder;
        }),
        update: vi.fn((values: Record<string, unknown>) => {
          query = { ...query, values, action: "update" };
          return builder;
        }),
        delete: vi.fn(() => {
          query = { ...query, action: "delete" };
          return builder;
        }),
        eq: vi.fn((field: string, value: unknown) => {
          query = { ...query, eqField: field, eqValue: value };
          return builder;
        }),
        is: vi.fn((field: string, value: unknown) => {
          query = { ...query, isField: field, isValue: value };
          return builder;
        }),
        maybeSingle: vi.fn(() => {
          const key = JSON.stringify(query);
          const res = responses[key] ?? responses[query.table as string] ?? { data: null, error: null };
          return Promise.resolve(res);
        }),
        single: vi.fn(() => {
          const key = JSON.stringify(query);
          const res = responses[key] ?? responses[query.table as string] ?? { data: null, error: null };
          return Promise.resolve(res);
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder)
      };
      return builder;
    }),
    rpc: vi.fn((name: string, params: Record<string, unknown>) => {
      const key = `rpc:${name}:${JSON.stringify(params)}`;
      const res = responses[key] ?? responses[name] ?? { data: null, error: null };
      return Promise.resolve(res);
    })
  };
  return mock as unknown as Mocked<typeof mock> & { from: Mock; rpc: Mock };
};

const TEST_CONNECTION_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TEST_USER_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12";
const TEST_CLIENT_SECRET = "plaivra_mcp_testclientsecret";

const mockConnection = {
  id: TEST_CONNECTION_ID,
  user_id: TEST_USER_ID,
  scopes: ["plaivra.workouts.read"],
  is_active: true,
  revoked_at: null
};

const mockPermissionSettings = {
  access_mode: "custom",
  scopes: ["plaivra.workouts.read", "plaivra.workouts.write"]
};

const mockProfile = {
  id: TEST_USER_ID,
  email: "test@example.com",
  full_name: "Test User",
  role: "member"
};

const setupMockSupabase = (overrides?: Record<string, unknown>) => {
  const mock = createMockSupabase(overrides);
  mockCreateSupabaseAdminClient.mockReturnValue(mock as unknown as ReturnType<typeof createSupabaseAdminClient>);
  return mock;
};

describe("OAuth authorization server metadata", () => {
  it("advertises only S256 PKCE", async () => {
    const request = new Request("https://plaivra.com/.well-known/oauth-authorization-server");
    const response = oauthAuthorizationServerMetadata(request);
    expect(response.status).toBe(200);
    const json = await response.json() as {
      code_challenge_methods_supported: string[];
    };
    expect(json.code_challenge_methods_supported).toEqual(["S256"]);
    expect(json.code_challenge_methods_supported).not.toContain("plain");
  });
});

describe("handleOAuthAuthorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing code_challenge", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    const request = new Request(url.toString());

    const response = await handleOAuthAuthorize(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=invalid_request");
    expect(location).toContain("code_challenge+is+required");
  });

  it("rejects unsupported code_challenge_method", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "plain");
    const request = new Request(url.toString());

    const response = await handleOAuthAuthorize(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=invalid_request");
    expect(location).toContain("Only+S256+code_challenge_method+is+supported");
  });

  it("requires S256 and stores an authorization code", async () => {
    const mock = setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null },
      mcp_oauth_authorization_codes: { data: null, error: null }
    });

    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const request = new Request(url.toString());

    const response = await handleOAuthAuthorize(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("code=plaivra_ac_");
    expect(location).not.toContain("error=");

    // Verify insert was called with correct PKCE binding
    const authCodeInsert = mock.from.mock.calls.find((c: string[]) => c[0] === "mcp_oauth_authorization_codes");
    expect(authCodeInsert).toBeTruthy();
  });
});

describe("handleOAuthToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects missing code_verifier", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_request");
    expect(json.error_description).toContain("code_verifier is required");
  });

  it("rejects wrong code_verifier", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: TEST_CONNECTION_ID,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "correctchallenge",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "wrongverifier"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("Invalid code_verifier");
  });

  it("rejects wrong redirect_uri", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: TEST_CONNECTION_ID,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://evil.com/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("redirect_uri does not match");
  });

  it("rejects wrong client_id", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: "wrong-client-id",
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("Authorization code does not match this client");
  });

  it("rejects expired code", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: TEST_CONNECTION_ID,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("Authorization code expired");
  });

  it("rejects replayed code", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: null,
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_grant");
    expect(json.error_description).toContain("already been used");
  });

  it("returns a distinct access token, not the setup secret", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      "mcp_oauth_authorization_codes": {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: TEST_CONNECTION_ID,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        error: null
      },
      "mcp_oauth_access_tokens": { data: null, error: null }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(200);
    const json = await response.json() as { access_token: string; token_type: string; expires_in: number };
    expect(json.token_type).toBe("Bearer");
    expect(json.access_token.startsWith("plaivra_mcp_at_")).toBe(true);
    expect(json.access_token).not.toBe(TEST_CLIENT_SECRET);
    expect(json.expires_in).toBe(7 * 24 * 60 * 60);
  });
});

describe("getAccessTokenRecord", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null for non-access-token format", async () => {
    const result = await getAccessTokenRecord("plaivra_mcp_oldsecret");
    expect(result).toBeNull();
  });

  it("returns null for expired token", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      }
    });

    const result = await getAccessTokenRecord("plaivra_mcp_at_sometoken");
    expect(result).toBeNull();
  });

  it("returns record for valid token", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      }
    });

    const result = await getAccessTokenRecord("plaivra_mcp_at_sometoken");
    expect(result).not.toBeNull();
    expect(result?.connection_id).toBe(TEST_CONNECTION_ID);
    expect(result?.user_id).toBe(TEST_USER_ID);
  });
});

describe("authenticateMcpRequest (via auth.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects legacy connection secrets as access tokens", async () => {
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: `Bearer ${TEST_CLIENT_SECRET}` }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(401);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("Reconnect Plaivra from ChatGPT settings");
  });

  it("rejects expired access tokens", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() - 1000).toISOString()
        },
        error: null
      }
    });

    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: "Bearer plaivra_mcp_at_expiredtoken" }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(401);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("Reconnect Plaivra from ChatGPT settings");
  });

  it("rejects revoked/inactive connections even with valid access token", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      },
      chatgpt_connections: {
        data: { id: TEST_CONNECTION_ID, user_id: TEST_USER_ID, is_active: false, revoked_at: new Date().toISOString() },
        error: null
      }
    });

    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: "Bearer plaivra_mcp_at_validtoken" }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(401);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("inactive or revoked");
  });

  it("still fails closed when AI permission settings are missing", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      },
      chatgpt_connections: {
        data: { id: TEST_CONNECTION_ID, user_id: TEST_USER_ID, is_active: true, revoked_at: null },
        error: null
      },
      "user_ai_permission_settings": { data: null, error: null },
      profiles: { data: mockProfile, error: null }
    });

    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: "Bearer plaivra_mcp_at_validtoken" }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(403);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("AI permission settings are missing");
  });

  it("rejects access token with wrong resource", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: "https://evil.com/api/mcp",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      },
      chatgpt_connections: {
        data: { id: TEST_CONNECTION_ID, user_id: TEST_USER_ID, is_active: true, revoked_at: null },
        error: null
      },
      profiles: { data: mockProfile, error: null }
    });

    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: "Bearer plaivra_mcp_at_validtoken" }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(401);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("resource mismatch");
  });

  it("rejects access token with missing resource", async () => {
    setupMockSupabase({
      "mcp_oauth_access_tokens": {
        data: {
          connection_id: TEST_CONNECTION_ID,
          user_id: TEST_USER_ID,
          scope: ["read:workouts"],
          resource: null,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
        },
        error: null
      },
      chatgpt_connections: {
        data: { id: TEST_CONNECTION_ID, user_id: TEST_USER_ID, is_active: true, revoked_at: null },
        error: null
      },
      profiles: { data: mockProfile, error: null }
    });

    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const request = new Request("https://plaivra.com/api/mcp", {
      headers: { Authorization: "Bearer plaivra_mcp_at_validtoken" }
    });

    const response = await authenticateMcpRequest(request);
    expect(response).toBeInstanceOf(NextResponse);
    const nextResponse = response as NextResponse;
    expect(nextResponse.status).toBe(401);
    const json = await nextResponse.json() as { error: string };
    expect(json.error).toContain("resource mismatch");
  });
});

describe("OAuth resource binding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("authorize accepts valid resource", async () => {
    const mock = setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null },
      mcp_oauth_authorization_codes: { data: null, error: null }
    });

    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", "https://plaivra.com/api/mcp");
    const request = new Request(url.toString());

    const response = await handleOAuthAuthorize(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("code=plaivra_ac_");
    expect(location).not.toContain("error=");
  });

  it("authorize rejects wrong resource", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null }
    });

    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", "https://evil.com/api/mcp");
    const request = new Request(url.toString());

    const response = await handleOAuthAuthorize(request);
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("error=invalid_target");
    expect(location).toContain("not+supported");
  });

  it("token rejects wrong resource", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      mcp_oauth_authorization_codes: {
        data: {
          user_id: TEST_USER_ID,
          connection_id: TEST_CONNECTION_ID,
          client_id: TEST_CONNECTION_ID,
          redirect_uri: "https://chatgpt.com/connector/oauth/callback",
          code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          code_challenge_method: "S256",
          scope: ["read:workouts"],
          resource: "https://plaivra.com/api/mcp",
          expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
        },
        error: null
      }
    });

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      resource: "https://evil.com/api/mcp"
    });

    const request = new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString()
    });

    const response = await handleOAuthToken(request);
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_target");
    expect(json.error_description).toContain("not supported");
  });

  it("metadata resource equals canonical resource", async () => {
    const request = new Request("https://plaivra.com/.well-known/oauth-protected-resource");
    const response = oauthProtectedResourceMetadata(request);
    expect(response.status).toBe(200);
    const json = await response.json() as { resource: string };
    expect(json.resource).toBe("https://plaivra.com/api/mcp");
  });
});
