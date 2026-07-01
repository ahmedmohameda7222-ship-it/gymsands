import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { hashConnectionToken } from "@/lib/mcp/auth";
import { MCP_DEFAULT_SCOPES, MCP_SCOPES, MCP_SUPPORTED_SCOPES, normalizeMcpScopes, resolveSavedAiPermissionScopes } from "@/lib/mcp/scopes";

const AUTH_CODE_EXPIRY_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const AUTHORIZE_RATE_LIMIT = 10;
const TOKEN_RATE_LIMIT = 10;
const REGISTER_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;

function originFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

function getCanonicalResource(request: Request) {
  return serverEnv.plaivraMcpBaseUrl || `${originFromRequest(request)}/api/mcp`;
}

function isAllowedRedirectUri(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "chatgpt.com" || url.hostname === "chat.openai.com") &&
      url.pathname.startsWith("/connector/oauth/")
    );
  } catch {
    return false;
  }
}

function oauthErrorRedirect(redirectUri: string, state: string | null, error: string, description: string) {
  const url = new URL(redirectUri);
  url.searchParams.set("error", error);
  url.searchParams.set("error_description", description);
  if (state) url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}

function metadataHeaders() {
  return {
    "Cache-Control": "no-store",
    "Content-Type": "application/json"
  };
}

async function readTokenRequestForm(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        form.set(key, String(value));
      }
    }
    return form;
  }

  return new URLSearchParams(await request.text());
}

function hashValue(value: string) {
  if (!serverEnv.plaivraMcpTokenSecret) {
    throw new Error("PLAIVRA_MCP_TOKEN_SECRET is required for Plaivra MCP OAuth.");
  }
  return crypto.createHmac("sha256", serverEnv.plaivraMcpTokenSecret).update(value).digest("hex");
}

function hashAuthorizationCode(code: string) {
  return hashValue(code);
}

function hashAccessToken(token: string) {
  return hashValue(token);
}

function pkceS256(verifier: string) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

type ResolvedConnection = {
  id: string;
  user_id: string;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
  canonicalClientId: string;
};

async function resolveClientId(clientId: string): Promise<ResolvedConnection | null> {
  if (!clientId) return null;

  const supabase = createSupabaseAdminClient();

  // Try UUID first (new canonical client_id)
  if (isValidUuid(clientId)) {
    const { data, error } = await supabase
      .from("chatgpt_connections")
      .select("id,user_id,scopes,is_active,revoked_at")
      .eq("id", clientId)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data && data.is_active && !data.revoked_at) {
      return { ...data, canonicalClientId: data.id };
    }
  }

  // Fall back to legacy connection secret (backward compat)
  if (clientId.startsWith("plaivra_mcp_")) {
    const tokenHash = hashConnectionToken(clientId);
    const { data, error } = await supabase
      .from("chatgpt_connections")
      .select("id,user_id,scopes,is_active,revoked_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data && data.is_active && !data.revoked_at) {
      return { ...data, canonicalClientId: data.id };
    }
  }

  return null;
}

function getClientIdFromTokenRequest(request: Request, form: URLSearchParams) {
  const bodyClientId = form.get("client_id")?.trim();
  if (bodyClientId) return bodyClientId;

  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Basic\s+(.+)$/i);
  if (!match) return "";

  try {
    const decoded = Buffer.from(match[1], "base64").toString("utf8");
    return decoded.split(":")[0] ?? "";
  } catch {
    return "";
  }
}

function oauthClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export async function oauthRateLimit(key: string, limit: number, windowSeconds: number) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_oauth_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) return null; // fail open on rate-limit infra errors

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reset_at?: string | null } | null;
  if (!row) return null;
  if (row.allowed !== false) return null;
  const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowSeconds * 1000;
  return `Rate limit exceeded. Try again after ${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))} seconds.`;
}

async function createAuthorizationCode(
  connection: ResolvedConnection,
  redirectUri: string,
  codeChallenge: string,
  scope: string,
  resource: string
) {
  const rawCode = `plaivra_ac_${crypto.randomBytes(32).toString("base64url")}`;
  const codeHash = hashAuthorizationCode(rawCode);
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("mcp_oauth_authorization_codes").insert({
    code_hash: codeHash,
    user_id: connection.user_id,
    connection_id: connection.id,
    client_id: connection.canonicalClientId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    scope: scope.split(/\s+/).filter(Boolean),
    resource,
    expires_at: new Date(Date.now() + AUTH_CODE_EXPIRY_MS).toISOString()
  });

  if (error) throw new Error(`Failed to store authorization code: ${error.message}`);
  return rawCode;
}

async function verifyAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  codeVerifier: string,
  resource: string
): Promise<{ scope: string; user_id: string; connection_id: string }> {
  if (!code) throw new Error("Authorization code is required.");

  const codeHash = hashAuthorizationCode(code);
  const supabase = createSupabaseAdminClient();

  // Atomically mark as used and return the row
  const { data, error } = await supabase
    .from("mcp_oauth_authorization_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("code_hash", codeHash)
    .is("used_at", null)
    .select("user_id,connection_id,client_id,redirect_uri,code_challenge,code_challenge_method,scope,expires_at,resource")
    .maybeSingle();

  if (error) throw new Error(`Failed to verify authorization code: ${error.message}`);
  if (!data) throw new Error("Authorization code is invalid or has already been used.");

  if (new Date(data.expires_at) < new Date()) {
    throw new Error("Authorization code expired.");
  }

  if (data.client_id !== clientId) {
    throw new Error("Authorization code does not match this client.");
  }

  if (redirectUri && data.redirect_uri !== redirectUri) {
    throw new Error("redirect_uri does not match authorization request.");
  }

  if (data.code_challenge_method !== "S256") {
    throw new Error("Unsupported code_challenge_method.");
  }

  const challenge = pkceS256(codeVerifier);
  if (!safeEqual(challenge, data.code_challenge)) {
    throw new Error("Invalid code_verifier.");
  }

  if (data.resource !== resource) {
    throw new Error("Authorization code resource mismatch.");
  }

  return {
    scope: Array.isArray(data.scope) ? data.scope.join(" ") : "",
    user_id: data.user_id,
    connection_id: data.connection_id
  };
}

async function createAccessToken(connection: ResolvedConnection, scope: string, resource: string) {
  const rawToken = `plaivra_mcp_at_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = hashAccessToken(rawToken);
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("mcp_oauth_access_tokens").insert({
    token_hash: tokenHash,
    connection_id: connection.id,
    user_id: connection.user_id,
    scope: scope.split(/\s+/).filter(Boolean),
    resource,
    expires_at: new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS).toISOString()
  });

  if (error) throw new Error(`Failed to store access token: ${error.message}`);
  return rawToken;
}

export async function getAccessTokenRecord(token: string) {
  if (!token.startsWith("plaivra_mcp_at_")) return null;
  const tokenHash = hashAccessToken(token);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mcp_oauth_access_tokens")
    .select("connection_id,user_id,scope,expires_at,resource")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data;
}

async function getUserAiScopes(userId: string): Promise<string[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_ai_permission_settings")
    .select("access_mode,scopes")
    .eq("user_id", userId)
    .maybeSingle();

  if (data && !error && Array.isArray(data.scopes) && data.scopes.length > 0) {
    return resolveSavedAiPermissionScopes(data.access_mode, data.scopes);
  }
  return [];
}

export function oauthAuthorizationServerMetadata(request: Request) {
  const origin = originFromRequest(request);

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: MCP_SUPPORTED_SCOPES,
      registration_endpoint: `${origin}/api/oauth/register`
    },
    { headers: metadataHeaders() }
  );
}

export function oauthProtectedResourceMetadata(request: Request) {
  const origin = originFromRequest(request);
  const resource = serverEnv.plaivraMcpBaseUrl || `${origin}/api/mcp`;

  return NextResponse.json(
    {
      resource,
      authorization_servers: [origin],
      scopes_supported: MCP_SUPPORTED_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${origin}/docs/chatgpt-mcp`
    },
    { headers: metadataHeaders() }
  );
}

export async function handleOAuthAuthorize(request: Request) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id")?.trim() ?? "";
  const redirectUri = url.searchParams.get("redirect_uri")?.trim() ?? "";
  const state = url.searchParams.get("state");
  const requestedScope = url.searchParams.get("scope") || MCP_DEFAULT_SCOPES.join(" ");
  const codeChallenge = url.searchParams.get("code_challenge")?.trim() ?? "";
  const codeChallengeMethod = url.searchParams.get("code_challenge_method")?.trim() ?? "";
  const requestedResource = url.searchParams.get("resource")?.trim() ?? "";
  const canonicalResource = getCanonicalResource(request);

  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "ChatGPT OAuth callback URL is required." }, { status: 400 });
  }

  if (responseType !== "code") {
    return oauthErrorRedirect(redirectUri, state, "unsupported_response_type", "Plaivra MCP supports only authorization_code OAuth.");
  }

  if (!clientId) {
    return oauthErrorRedirect(redirectUri, state, "invalid_client", "OAuth client_id is required.");
  }

  // Rate limit by client IP + client_id
  const rateLimitKey = `authorize:${oauthClientIp(request)}:${clientId}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, AUTHORIZE_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) {
    return NextResponse.json({ error: "invalid_request", error_description: "Too many authorization requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
  }

  if (!codeChallenge) {
    return oauthErrorRedirect(redirectUri, state, "invalid_request", "code_challenge is required. PKCE S256 is mandatory.");
  }

  if (codeChallengeMethod !== "S256") {
    return oauthErrorRedirect(redirectUri, state, "invalid_request", "Only S256 code_challenge_method is supported.");
  }

  // Validate resource if supplied; default to canonical resource for backward compat
  const resource = requestedResource || canonicalResource;
  if (requestedResource && requestedResource !== canonicalResource) {
    return oauthErrorRedirect(redirectUri, state, "invalid_target", "The requested resource is not supported by this authorization server.");
  }

  try {
    const connection = await resolveClientId(clientId);
    if (!connection) {
      return oauthErrorRedirect(redirectUri, state, "access_denied", "Plaivra connection is invalid or revoked.");
    }

    const userScopes = await getUserAiScopes(connection.user_id);
    if (!userScopes.length) {
      return oauthErrorRedirect(redirectUri, state, "access_denied", "Review and save Plaivra AI Permissions before connecting ChatGPT.");
    }
    const allowedScopes = new Set(userScopes);
    const permittedRequestedScopes = normalizeMcpScopes(requestedScope, userScopes).filter(
      (scope) => scope !== MCP_SCOPES.admin && scope !== MCP_SCOPES.all && allowedScopes.has(scope)
    );
    const scope = (permittedRequestedScopes.length ? permittedRequestedScopes : userScopes).join(" ");

    const code = await createAuthorizationCode(connection, redirectUri, codeChallenge, scope, resource);

    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    if (state) callback.searchParams.set("state", state);
    return NextResponse.redirect(callback);
  } catch (error) {
    return oauthErrorRedirect(redirectUri, state, "server_error", error instanceof Error ? error.message : "Plaivra OAuth authorization failed.");
  }
}

export async function handleOAuthToken(request: Request) {
  const form = await readTokenRequestForm(request);
  const grantType = form.get("grant_type");
  const code = form.get("code") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const clientId = getClientIdFromTokenRequest(request, form);
  const codeVerifier = form.get("code_verifier") ?? "";
  const requestedResource = form.get("resource")?.trim() ?? "";
  const canonicalResource = getCanonicalResource(request);

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400, headers: metadataHeaders() });
  }

  if (!code || !clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "code and client_id are required." }, { status: 400, headers: metadataHeaders() });
  }

  // Rate limit by client_id (and code hash prefix to avoid leaking code existence)
  const rateLimitKey = `token:${clientId}:${code.slice(0, 8)}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, TOKEN_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) {
    return NextResponse.json({ error: "invalid_request", error_description: "Too many token requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
  }

  try {
    const connection = await resolveClientId(clientId);
    if (!connection) {
      return NextResponse.json({ error: "invalid_client", error_description: "Plaivra connection is invalid or revoked." }, { status: 401, headers: metadataHeaders() });
    }

    if (!codeVerifier) {
      return NextResponse.json({ error: "invalid_request", error_description: "code_verifier is required." }, { status: 400, headers: metadataHeaders() });
    }

    const resource = requestedResource || canonicalResource;
    if (requestedResource && requestedResource !== canonicalResource) {
      return NextResponse.json({ error: "invalid_target", error_description: "The requested resource is not supported by this authorization server." }, { status: 400, headers: metadataHeaders() });
    }

    const payload = await verifyAuthorizationCode(code, connection.canonicalClientId, redirectUri, codeVerifier, resource);

    const accessToken = await createAccessToken(connection, payload.scope, resource);

    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: Math.floor(ACCESS_TOKEN_EXPIRY_MS / 1000),
        scope: payload.scope || MCP_DEFAULT_SCOPES.join(" ")
      },
      { headers: metadataHeaders() }
    );
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_grant", error_description: error instanceof Error ? error.message : "OAuth token exchange failed." },
      { status: 400, headers: metadataHeaders() }
    );
  }
}

export async function handleOAuthRegister() {
  // Rate limit by generic IP (best effort; no request object in this wrapper, so handled in route)
  return NextResponse.json(
    {
      client_id: "Use your Plaivra connection ID as OAuth Client ID (found in Settings > ChatGPT Connection).",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"]
    },
    { status: 201, headers: metadataHeaders() }
  );
}
