import { describe, it, expect, vi, beforeEach, type Mock, type Mocked } from "vitest";
import { NextResponse } from "next/server";
import {
  oauthAuthorizationServerMetadata,
  oauthProtectedResourceMetadata,
  handleOAuthAuthorize,
  handleOAuthAuthorizeDecision,
  handleOAuthToken,
  handleOAuthRevoke,
  handleOAuthRegister,
  getAccessTokenRecord,
  isAllowedRedirectUri
} from "@/lib/mcp/oauth";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

vi.mock("@/lib/server/supabase-admin");
vi.mock("@/lib/integrations/env", () => ({
  serverEnv: {
    supabaseServiceRoleKey: "test-key",
    plaivraMcpTokenSecret: "test-secret",
    plaivraAllowLegacyMcpClientId: true,
    plaivraCimdAllowedOrigins: "https://chatgpt.com",
    plaivraOAuthIssuer: "https://plaivra.com",
    plaivraMcpBaseUrl: "https://plaivra.com/api/mcp"
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
        upsert: vi.fn((values: Record<string, unknown>) => {
          query = { ...query, values, action: "upsert" };
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
          const configured = responses[key] ?? responses[query.table as string];
          const res = typeof configured === "function" ? configured(query) : configured ?? { data: null, error: null };
          return Promise.resolve(res);
        }),
        single: vi.fn(() => {
          const key = JSON.stringify(query);
          const configured = responses[key] ?? responses[query.table as string];
          const res = typeof configured === "function" ? configured(query) : configured ?? { data: null, error: null };
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
const TEST_CLIENT_SECRET = TEST_CONNECTION_ID;
const TEST_LEGACY_CLIENT_SECRET = "plaivra_mcp_testclientsecret";

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
  const mock = createMockSupabase({
    account_access_states: { data: { state: "active" }, error: null },
    user_consents: { data: { granted: true, revoked_at: null }, error: null },
    onboarding_answers: { data: { age: 16 }, error: null },
    mcp_oauth_authorization_continuations: { data: { id: "11111111-1111-4111-8111-111111111111" }, error: null },
    ...overrides
  });
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

  it("advertises CIMD with supported public and signed client authentication", async () => {
    const request = new Request("https://plaivra.com/.well-known/oauth-authorization-server");
    const response = oauthAuthorizationServerMetadata(request);
    const json = await response.json() as Record<string, unknown>;
    expect(json.token_endpoint_auth_methods_supported).toEqual(["private_key_jwt", "none"]);
    expect(json).not.toHaveProperty("registration_endpoint");
    expect(json.client_id_metadata_document_supported).toBe(true);
  });

  it("advertises only publicly grantable user scopes", async () => {
    const request = new Request("https://plaivra.com/.well-known/oauth-authorization-server");
    const response = oauthAuthorizationServerMetadata(request);
    const json = await response.json() as { scopes_supported: string[] };
    expect(json.scopes_supported).toContain("plaivra.full_access");
    expect(json.scopes_supported).not.toContain("plaivra.admin");
    expect(json.scopes_supported).not.toContain("plaivra.all");
  });

  it("does not pretend the static register route implements DCR", async () => {
    const response = await handleOAuthRegister();
    expect(response.status).toBe(404);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_request");
    expect(json.error_description).toContain("not supported");
  });
});

describe("OAuth redirect URI policy", () => {
  it("accepts only one exact ChatGPT connector callback path segment", () => {
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/callback_123-abc")).toBe(true);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/callback/extra")).toBe(false);
    expect(isAllowedRedirectUri("https://chatgpt.com/connector/oauth/callback?next=https://evil.example")).toBe(false);
    expect(isAllowedRedirectUri("https://chat.openai.com/connector/oauth/callback")).toBe(false);
    expect(isAllowedRedirectUri("http://chatgpt.com/connector/oauth/callback")).toBe(false);
    expect(isAllowedRedirectUri("https://evil.example/connector/oauth/callback")).toBe(false);
    expect(isAllowedRedirectUri(
      "https://chatgpt.com/connector/oauth/callback_123-abc",
      "https://chatgpt.com/connector/oauth/different"
    )).toBe(false);
    expect(isAllowedRedirectUri(
      "https://chatgpt.com/connector/oauth/callback_123-abc",
      "https://chatgpt.com/connector/oauth/callback_123-abc"
    )).toBe(true);
  });
});

describe("handleOAuthAuthorize", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("accepts a valid ChatGPT CIMD client without a pre-created Plaivra connection", async () => {
    setupMockSupabase({ consume_oauth_rate_limit: { data: { allowed: true }, error: null } });
    const clientId = "https://chatgpt.com/oauth/plaivra/client.json";
    const redirectUri = "https://chatgpt.com/connector/oauth/callback_123-abc";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      client_id: clientId,
      client_name: "ChatGPT",
      redirect_uris: [redirectUri],
      token_endpoint_auth_methods_supported: ["none"]
    }), { headers: { "Content-Type": "application/json" } })));
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "plaivra.workouts.read");
    url.searchParams.set("code_challenge", "A".repeat(43));
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("resource", "https://plaivra.com/api/mcp");
    const response = await handleOAuthAuthorize(new Request(url));
    expect(response.status).toBe(307);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("/oauth/authorize?");
    expect(location).toContain(encodeURIComponent(clientId));
    expect(location).toContain("continuation=");
  });

  it("rejects legacy setup secrets as client_id when compatibility is disabled", async () => {
    setupMockSupabase();
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_LEGACY_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await handleOAuthAuthorize(new Request(url));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=invalid_client");
  });

  it("rejects unknown client_id formats before authorization", async () => {
    setupMockSupabase();
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "unknown-client");
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await handleOAuthAuthorize(new Request(url));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=invalid_client");
  });

  it("rejects an unknown UUID client_id", async () => {
    setupMockSupabase({ chatgpt_connections: { data: null, error: null } });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11");
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await handleOAuthAuthorize(new Request(url));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=invalid_client");
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

  it("requires S256, continues to consent, and stores a code only after owner approval", async () => {
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
    expect(location).toContain("/oauth/authorize?");
    expect(location).toContain("continuation=");
    expect(location).not.toContain("error=");
    expect(mock.from.mock.calls.find((c: string[]) => c[0] === "mcp_oauth_authorization_codes")).toBeUndefined();

    const consentUrl = new URL(location);
    const decisionUrl = new URL("https://plaivra.com/api/oauth/authorize");
    decisionUrl.search = consentUrl.search;
    const decision = await handleOAuthAuthorizeDecision(new Request(decisionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }), TEST_USER_ID);
    expect(decision.status).toBe(200);
    const decisionBody = await decision.json() as { redirect_to: string };
    expect(decisionBody.redirect_to).toContain("code=plaivra_ac_");

    // Verify insert was called with correct PKCE binding
    const authCodeInsert = mock.from.mock.calls.find((c: string[]) => c[0] === "mcp_oauth_authorization_codes");
    expect(authCodeInsert).toBeTruthy();
  });

  it("rejects a consent continuation changed after login", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const start = await handleOAuthAuthorize(new Request(url));
    const consentUrl = new URL(start.headers.get("location") ?? "");
    consentUrl.searchParams.set("scope", "plaivra.profile.write");
    const decisionUrl = new URL("https://plaivra.com/api/oauth/authorize");
    decisionUrl.search = consentUrl.search;
    const decision = await handleOAuthAuthorizeDecision(new Request(decisionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }), TEST_USER_ID);
    expect(decision.status).toBe(400);
    expect((await decision.json() as { error_description: string }).error_description).toContain("changed");
  });

  it("does not let another signed-in Plaivra user approve the client", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const start = await handleOAuthAuthorize(new Request(url));
    const consentUrl = new URL(start.headers.get("location") ?? "");
    const decisionUrl = new URL("https://plaivra.com/api/oauth/authorize");
    decisionUrl.search = consentUrl.search;
    const decision = await handleOAuthAuthorizeDecision(new Request(decisionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }), "b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12");
    expect(decision.status).toBe(403);
    expect((await decision.json() as { error: string }).error).toBe("access_denied");
  });

  it("does not broaden an unsupported or unsaved requested scope", async () => {
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("scope", "plaivra.profile.write");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const response = await handleOAuthAuthorize(new Request(url));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("error=invalid_scope");
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
    expect(json.error_description).toContain("not an allowed ChatGPT callback");
  });

  it("rejects a different but otherwise allowed redirect_uri at token exchange", async () => {
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
      client_id: TEST_CONNECTION_ID,
      redirect_uri: "https://chatgpt.com/connector/oauth/different-callback",
      code_verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
    });
    const response = await handleOAuthToken(new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }));
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
          issuer: "https://plaivra.com",
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

  it("returns a distinct access token, not the public client ID", async () => {
    const mock = setupMockSupabase({
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
    expect(JSON.stringify(mock.rpc.mock.calls)).not.toContain("plaivra_ac_somecode");
  });

  it("rejects omitted redirect_uri instead of bypassing code binding", async () => {
    setupMockSupabase();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CONNECTION_ID,
      code_verifier: "verifier"
    });
    const response = await handleOAuthToken(new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }));
    expect(response.status).toBe(400);
    const json = await response.json() as { error: string; error_description: string };
    expect(json.error).toBe("invalid_request");
    expect(json.error_description).toContain("redirect_uri is required");
  });

  it("rejects Basic client authentication because only public-client none is advertised", async () => {
    setupMockSupabase();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CONNECTION_ID,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "verifier"
    });
    const response = await handleOAuthToken(new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${TEST_CONNECTION_ID}:ignored`).toString("base64")}`
      },
      body
    }));
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_client");
  });

  it("rejects unimplemented client_secret_post authentication", async () => {
    setupMockSupabase();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_CONNECTION_ID,
      client_secret: "ignored-secret",
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "verifier"
    });
    const response = await handleOAuthToken(new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }));
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_client");
  });

  it("rejects legacy setup secrets as token-endpoint client_id when compatibility is disabled", async () => {
    setupMockSupabase();
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: "plaivra_ac_somecode",
      client_id: TEST_LEGACY_CLIENT_SECRET,
      redirect_uri: "https://chatgpt.com/connector/oauth/callback",
      code_verifier: "verifier"
    });
    const response = await handleOAuthToken(new Request("https://plaivra.com/api/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body
    }));
    expect(response.status).toBe(401);
    const json = await response.json() as { error: string };
    expect(json.error).toBe("invalid_client");
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
          issuer: "https://plaivra.com",
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
      headers: { Authorization: `Bearer ${TEST_LEGACY_CLIENT_SECRET}` }
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
          issuer: "https://plaivra.com",
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
          issuer: "https://plaivra.com",
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
          issuer: "https://plaivra.com",
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
          issuer: "https://plaivra.com",
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
          issuer: "https://plaivra.com",
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

  it("consumes an authorization continuation exactly once", async () => {
    let consumeCount = 0;
    setupMockSupabase({
      chatgpt_connections: { data: mockConnection, error: null },
      user_ai_permission_settings: { data: mockPermissionSettings, error: null },
      mcp_oauth_authorization_codes: { data: null, error: null },
      mcp_oauth_authorization_continuations: () => consumeCount++ === 0
        ? { data: { id: "11111111-1111-4111-8111-111111111111" }, error: null }
        : { data: null, error: null }
    });
    const url = new URL("https://plaivra.com/api/oauth/authorize");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", TEST_CLIENT_SECRET);
    url.searchParams.set("redirect_uri", "https://chatgpt.com/connector/oauth/callback");
    url.searchParams.set("code_challenge", "challenge123");
    url.searchParams.set("code_challenge_method", "S256");
    const start = await handleOAuthAuthorize(new Request(url));
    const decisionUrl = new URL("https://plaivra.com/api/oauth/authorize");
    decisionUrl.search = new URL(start.headers.get("location") ?? "").search;
    const decide = () => handleOAuthAuthorizeDecision(new Request(decisionUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approve" })
    }), TEST_USER_ID);
    expect((await decide()).status).toBe(200);
    const replay = await decide();
    expect(replay.status).toBe(400);
    expect((await replay.json() as { error_description: string }).error_description).toContain("already used");
  });

  it("rejects not-yet-valid, explicitly revoked, and wrong-issuer access tokens", async () => {
    const { authenticateMcpRequest } = await import("@/lib/mcp/auth");
    const cases = [
      { not_before: new Date(Date.now() + 60_000).toISOString(), revoked_at: null, issuer: "https://plaivra.com", message: "not active yet" },
      { not_before: new Date(Date.now() - 1_000).toISOString(), revoked_at: new Date().toISOString(), issuer: "https://plaivra.com", message: "revoked" },
      { not_before: new Date(Date.now() - 1_000).toISOString(), revoked_at: null, issuer: "https://evil.example", message: "issuer is invalid" }
    ];
    for (const tokenCase of cases) {
      setupMockSupabase({
        mcp_oauth_access_tokens: {
          data: {
            connection_id: TEST_CONNECTION_ID,
            user_id: TEST_USER_ID,
            scope: ["read:workouts"],
            resource: "https://plaivra.com/api/mcp",
            expires_at: new Date(Date.now() + 60_000).toISOString(),
            ...tokenCase
          },
          error: null
        }
      });
      const response = await authenticateMcpRequest(new Request("https://plaivra.com/api/mcp", {
        headers: { Authorization: "Bearer plaivra_mcp_at_validtoken" }
      })) as NextResponse;
      expect(response.status).toBe(401);
      expect((await response.json() as { error: string }).error).toContain(tokenCase.message);
    }
  });
});

describe("OAuth token revocation", () => {
  it("revokes only a token bound to the authenticated client and stays idempotent", async () => {
    const supabase = setupMockSupabase({ chatgpt_connections: { data: mockConnection, error: null } });
    const response = await handleOAuthRevoke(new Request("https://plaivra.com/api/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "plaivra_mcp_at_token", client_id: TEST_CONNECTION_ID })
    }));
    expect(response.status).toBe(200);
    expect(supabase.from).toHaveBeenCalledWith("mcp_oauth_access_tokens");
  });

  it("rejects a missing token or client identity", async () => {
    const response = await handleOAuthRevoke(new Request("https://plaivra.com/api/oauth/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "plaivra_mcp_at_token" })
    }));
    expect(response.status).toBe(400);
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
    expect(location).toContain("/oauth/authorize?");
    expect(location).toContain("resource=https%3A%2F%2Fplaivra.com%2Fapi%2Fmcp");
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

  it("publishes a stable public resource documentation URL and public scopes", async () => {
    const request = new Request("https://plaivra.com/.well-known/oauth-protected-resource");
    const response = oauthProtectedResourceMetadata(request);
    const json = await response.json() as { resource_documentation: string; scopes_supported: string[] };
    expect(json.resource_documentation).toBe("https://plaivra.com/legal/privacy");
    expect(json.scopes_supported).not.toContain("plaivra.admin");
    expect(json.scopes_supported).not.toContain("plaivra.all");
  });
});
