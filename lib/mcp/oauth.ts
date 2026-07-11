import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { getSavedUserAiScopes, rotateMcpConnection } from "@/lib/mcp/connections";
import {
  CimdValidationError,
  fetchAndValidateCimdMetadata,
  verifyCimdPrivateKeyJwt,
  type CimdClientMetadata
} from "@/lib/mcp/cimd";
import { MCP_DEFAULT_SCOPES, MCP_PUBLIC_OAUTH_SCOPES, MCP_SCOPES, normalizeMcpScopes, resolveSavedAiPermissionScopes } from "@/lib/mcp/scopes";
import { CHATGPT_CONNECTION_CONSENT_VERSION } from "@/lib/legal/versions";

const AUTH_CODE_EXPIRY_MS = 5 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const AUTHORIZE_RATE_LIMIT = 10;
const TOKEN_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const OAUTH_CONTINUATION_EXPIRY_MS = 10 * 60 * 1000;

type OAuthAuthorizationRequest = {
  responseType: string;
  clientId: string;
  redirectUri: string;
  state: string | null;
  requestedScope: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  requestedResource: string;
};

function originFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.origin;
}

function getCanonicalResource(request: Request) {
  return serverEnv.plaivraMcpBaseUrl || `${originFromRequest(request)}/api/mcp`;
}

export function isAllowedRedirectUri(value: string, configuredRedirectUris = serverEnv.plaivraChatGptRedirectUris ?? "") {
  try {
    const url = new URL(value);
    const exactRedirectUris = configuredRedirectUris.split(",").map((item) => item.trim()).filter(Boolean);
    const matchesCurrentChatGptPattern = (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/connector\/oauth\/[A-Za-z0-9._~-]{1,200}$/.test(url.pathname)
    );
    const isConfiguredLegacyRedirect = url.protocol === "https:"
      && url.hostname === "chatgpt.com"
      && !url.port
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
      && url.pathname === "/connector_platform_oauth_redirect"
      && exactRedirectUris.includes(value);
    if (!matchesCurrentChatGptPattern && !isConfiguredLegacyRedirect) return false;
    return exactRedirectUris.length === 0 || exactRedirectUris.includes(value);
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

function isValidPkceValue(value: string) {
  return /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function readOAuthAuthorizationRequest(request: Request): OAuthAuthorizationRequest {
  const url = new URL(request.url);
  return {
    responseType: url.searchParams.get("response_type") ?? "",
    clientId: url.searchParams.get("client_id")?.trim() ?? "",
    redirectUri: url.searchParams.get("redirect_uri")?.trim() ?? "",
    state: url.searchParams.get("state"),
    requestedScope: url.searchParams.get("scope") || MCP_DEFAULT_SCOPES.join(" "),
    codeChallenge: url.searchParams.get("code_challenge")?.trim() ?? "",
    codeChallengeMethod: url.searchParams.get("code_challenge_method")?.trim() ?? "",
    requestedResource: url.searchParams.get("resource")?.trim() ?? ""
  };
}

function canonicalAuthorizationSearch(params: OAuthAuthorizationRequest) {
  const search = new URLSearchParams();
  search.set("response_type", params.responseType);
  search.set("client_id", params.clientId);
  search.set("redirect_uri", params.redirectUri);
  if (params.state) search.set("state", params.state);
  if (params.requestedScope) search.set("scope", params.requestedScope);
  search.set("code_challenge", params.codeChallenge);
  search.set("code_challenge_method", params.codeChallengeMethod);
  if (params.requestedResource) search.set("resource", params.requestedResource);
  return search;
}

export function createOAuthContinuation(params: OAuthAuthorizationRequest, issuedAt = Date.now()) {
  const payload = `${issuedAt}.${canonicalAuthorizationSearch(params).toString()}`;
  return `${issuedAt}.${hashValue(`oauth-continuation:${payload}`)}`;
}

export function verifyOAuthContinuation(
  params: OAuthAuthorizationRequest,
  continuation: string,
  now = Date.now()
) {
  const [issuedAtValue, signature, ...extra] = continuation.split(".");
  if (!issuedAtValue || !signature || extra.length) return false;
  const issuedAt = Number(issuedAtValue);
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > OAUTH_CONTINUATION_EXPIRY_MS) {
    return false;
  }
  const expected = createOAuthContinuation(params, issuedAt).split(".")[1];
  return Boolean(expected && safeEqual(signature, expected));
}

function isLegacyClientIdFormat(value: string) {
  return /^plaivra_mcp_[A-Za-z0-9_-]{32,128}$/.test(value);
}

type ResolvedConnection = {
  id: string;
  user_id: string;
  scopes: string[];
  is_active: boolean;
  revoked_at: string | null;
  canonicalClientId: string;
};

type ResolvedOAuthClient =
  | { kind: "cimd"; clientId: string; metadata: CimdClientMetadata; connection: null }
  | { kind: "transitional"; clientId: string; metadata: null; connection: ResolvedConnection };

async function resolveClientId(clientId: string): Promise<ResolvedConnection | null> {
  if (!clientId) return null;

  const supabase = createSupabaseAdminClient();

  // Transitional connection UUIDs are private-development compatibility only.
  if (serverEnv.plaivraAllowLegacyMcpClientId && isValidUuid(clientId)) {
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

  // Temporary private/development compatibility only. Disabled by default.
  if (serverEnv.plaivraAllowLegacyMcpClientId && isLegacyClientIdFormat(clientId)) {
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

function getClientIdFromTokenRequest(form: URLSearchParams) {
  return form.get("client_id")?.trim() ?? "";
}

function supportedClientIdFormat(clientId: string) {
  if (clientId.startsWith("https://")) return true;
  return serverEnv.plaivraAllowLegacyMcpClientId && (isValidUuid(clientId) || isLegacyClientIdFormat(clientId));
}

function oauthContinuationHash(continuation: string) {
  return hashValue(`oauth-continuation-replay:${continuation}`);
}

async function recordOAuthContinuation(continuation: string) {
  const issuedAt = Number(continuation.split(".")[0]);
  if (!Number.isFinite(issuedAt)) throw new Error("OAuth authorization continuation could not be recorded.");
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("mcp_oauth_authorization_continuations").insert({
    continuation_hash: oauthContinuationHash(continuation),
    expires_at: new Date(issuedAt + OAUTH_CONTINUATION_EXPIRY_MS).toISOString()
  });
  if (error) throw new Error("OAuth authorization continuation could not be recorded securely.");
}

async function consumeOAuthContinuation(continuation: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mcp_oauth_authorization_continuations")
    .delete()
    .eq("continuation_hash", oauthContinuationHash(continuation))
    .select("id")
    .maybeSingle();
  return !error && Boolean(data?.id);
}

async function resolveOAuthClient(clientId: string, redirectUri?: string): Promise<ResolvedOAuthClient | null> {
  if (clientId.startsWith("https://")) {
    const metadata = await fetchAndValidateCimdMetadata({
      clientId,
      redirectUri,
      allowedOrigins: serverEnv.plaivraCimdAllowedOrigins,
      // Unit tests replace global fetch with a deterministic metadata server.
      // Runtime requests retain the DNS-pinned HTTPS transport in cimd.ts.
      ...(process.env.NODE_ENV === "test" ? { fetcher: fetch } : {})
    });
    return { kind: "cimd", clientId, metadata, connection: null };
  }
  const connection = await resolveClientId(clientId);
  return connection
    ? { kind: "transitional", clientId: connection.canonicalClientId, metadata: null, connection }
    : null;
}

async function createCimdConnection(userId: string, clientId: string, scopes: string[]) {
  const supabase = createSupabaseAdminClient();
  const tokenHash = hashConnectionToken(createConnectionToken());
  const { data, error } = await rotateMcpConnection(supabase, { userId, tokenHash, scopes });
  const connection = Array.isArray(data) ? data[0] : data;
  if (error || !connection?.id) throw new Error("ChatGPT connection could not be created securely.");
  const updated = await supabase
    .from("chatgpt_connections")
    .update({ oauth_client_id: clientId, label: "ChatGPT (CIMD)" })
    .eq("id", connection.id)
    .eq("user_id", userId)
    .select("id,user_id,scopes,is_active,revoked_at")
    .single();
  if (updated.error || !updated.data) throw new Error("ChatGPT connection identity could not be bound.");
  return { ...updated.data, canonicalClientId: clientId } as ResolvedConnection;
}

async function resolveConnectionById(connectionId: string, userId: string) {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chatgpt_connections")
    .select("id,user_id,scopes,is_active,revoked_at,oauth_client_id")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_active || data.revoked_at) return null;
  return { ...data, canonicalClientId: data.oauth_client_id ?? data.id } as ResolvedConnection;
}

function rateLimitDigest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function oauthClientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

export type OAuthRateLimitDecision = { status: 429 | 503; message: string } | null;

export async function oauthRateLimit(key: string, limit: number, windowSeconds: number): Promise<OAuthRateLimitDecision> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_oauth_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds
  });

  if (error) {
    return { status: 503, message: "OAuth request protection is temporarily unavailable. Try again later." };
  }

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reset_at?: string | null } | null;
  if (!row) {
    return { status: 503, message: "OAuth request protection is temporarily unavailable. Try again later." };
  }
  if (row.allowed !== false) return null;
  const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + windowSeconds * 1000;
  return {
    status: 429,
    message: `Rate limit exceeded. Try again after ${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))} seconds.`
  };
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
  if (!codeVerifier) throw new Error("code_verifier is required.");

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("consume_mcp_oauth_authorization_code", {
    p_code_hash: hashAuthorizationCode(code),
    p_client_id: clientId,
    p_redirect_uri: redirectUri,
    p_code_challenge: pkceS256(codeVerifier),
    p_resource: resource
  });
  if (error) throw new Error("Authorization code verification is temporarily unavailable.");

  const row = (Array.isArray(data) ? data[0] : data) as {
    scope?: string[] | null;
    user_id?: string | null;
    connection_id?: string | null;
  } | null;
  if (!row?.user_id || !row.connection_id) {
    throw new Error("Authorization code is invalid, expired, already used, or does not match this request.");
  }

  return {
    scope: Array.isArray(row.scope) ? row.scope.join(" ") : "",
    user_id: row.user_id,
    connection_id: row.connection_id
  };
}

async function createAccessToken(connection: ResolvedConnection, clientId: string, scope: string, resource: string, issuer: string) {
  const rawToken = `plaivra_mcp_at_${crypto.randomBytes(32).toString("base64url")}`;
  const tokenHash = hashAccessToken(rawToken);
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("mcp_oauth_access_tokens").insert({
    token_hash: tokenHash,
    connection_id: connection.id,
    user_id: connection.user_id,
    client_id: clientId,
    scope: scope.split(/\s+/).filter(Boolean),
    resource,
    issuer,
    not_before: new Date().toISOString(),
    expires_at: new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS).toISOString()
  });

  if (error) throw new Error(`Failed to store access token: ${error.message}`);
  return rawToken;
}

export async function getAccessTokenAuthenticationRecord(token: string) {
  if (!token.startsWith("plaivra_mcp_at_")) return null;
  const tokenHash = hashAccessToken(token);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("mcp_oauth_access_tokens")
    .select("connection_id,user_id,client_id,scope,issuer,not_before,expires_at,revoked_at,resource")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  const now = new Date();
  return {
    ...data,
    expired: new Date(data.expires_at) <= now,
    notYetValid: Boolean(data.not_before && new Date(data.not_before) > now),
    revoked: Boolean(data.revoked_at)
  };
}

async function recordChatGptConnectionConsent(userId: string, request: Request) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("user_consents").upsert({
    user_id: userId,
    consent_type: "chatgpt_connection",
    version: CHATGPT_CONNECTION_CONSENT_VERSION,
    granted: true,
    granted_at: new Date().toISOString(),
    revoked_at: null,
    ip_address: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    user_agent: request.headers.get("user-agent") || null
  }, { onConflict: "user_id,consent_type,version" });
  if (error) throw new Error("ChatGPT connection consent could not be recorded.");
}

export async function getAccessTokenRecord(token: string) {
  const record = await getAccessTokenAuthenticationRecord(token);
  return record && !record.expired && !record.notYetValid && !record.revoked ? record : null;
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

function permittedOAuthScopes(requestedScope: string, userScopes: string[]) {
  const requested = Array.from(new Set(requestedScope.split(/\s+/).map((scope) => scope.trim()).filter(Boolean)));
  if (!requested.length) return userScopes;
  const normalized = normalizeMcpScopes(requested, []);
  if (normalized.length !== requested.length) return [];
  const allowedScopes = new Set(userScopes);
  return normalized.filter(
    (scope) => scope !== MCP_SCOPES.admin && scope !== MCP_SCOPES.all && allowedScopes.has(scope)
  );
}

export function oauthAuthorizationServerMetadata(request: Request) {
  void request;
  const origin = serverEnv.plaivraOAuthIssuer;

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      revocation_endpoint: `${origin}/api/oauth/revoke`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      client_id_metadata_document_supported: true,
      token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: MCP_PUBLIC_OAUTH_SCOPES
    },
    { headers: metadataHeaders() }
  );
}

export function oauthProtectedResourceMetadata(request: Request) {
  void request;
  const origin = serverEnv.plaivraOAuthIssuer;
  const resource = serverEnv.plaivraMcpBaseUrl || `${origin}/api/mcp`;

  return NextResponse.json(
    {
      resource,
      authorization_servers: [origin],
      scopes_supported: MCP_PUBLIC_OAUTH_SCOPES,
      bearer_methods_supported: ["header"],
      token_endpoint_auth_methods_supported: ["private_key_jwt", "none"],
      resource_documentation: `${origin}/legal/privacy`
    },
    { headers: metadataHeaders() }
  );
}

export async function handleOAuthAuthorize(request: Request) {
  const url = new URL(request.url);
  const params = readOAuthAuthorizationRequest(request);
  const {
    responseType,
    clientId,
    redirectUri,
    state,
    requestedScope,
    codeChallenge,
    codeChallengeMethod,
    requestedResource
  } = params;
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

  if (!supportedClientIdFormat(clientId)) {
    return oauthErrorRedirect(redirectUri, state, "invalid_client", "OAuth client_id is unknown or unsupported.");
  }

  // Hash the client identifier so legacy setup secrets are never persisted in rate-limit keys.
  const rateLimitKey = `authorize:${oauthClientIp(request)}:${rateLimitDigest(clientId)}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, AUTHORIZE_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }

  if (!codeChallenge) {
    return oauthErrorRedirect(redirectUri, state, "invalid_request", "code_challenge is required. PKCE S256 is mandatory.");
  }

  if (clientId.startsWith("https://") && !isValidPkceValue(codeChallenge)) {
    return oauthErrorRedirect(redirectUri, state, "invalid_request", "CIMD clients must send a valid 43-128 character PKCE code_challenge.");
  }

  if (codeChallengeMethod !== "S256") {
    return oauthErrorRedirect(redirectUri, state, "invalid_request", "Only S256 code_challenge_method is supported.");
  }

  // Validate resource if supplied; default to canonical resource for backward compat
  const resource = requestedResource || canonicalResource;
  if (clientId.startsWith("https://") && !requestedResource) {
    return oauthErrorRedirect(redirectUri, state, "invalid_target", "The resource parameter is required for CIMD authorization.");
  }
  if (requestedResource && requestedResource !== canonicalResource) {
    return oauthErrorRedirect(redirectUri, state, "invalid_target", "The requested resource is not supported by this authorization server.");
  }

  try {
    const oauthClient = await resolveOAuthClient(clientId, redirectUri);
    if (!oauthClient) {
      return oauthErrorRedirect(redirectUri, state, "invalid_client", "Plaivra OAuth client is unknown, inactive, or revoked.");
    }
    let scope: string;
    if (oauthClient.kind === "transitional") {
      const userScopes = await getUserAiScopes(oauthClient.connection.user_id);
      if (!userScopes.length) {
        return oauthErrorRedirect(redirectUri, state, "access_denied", "Review and save Plaivra AI Permissions before connecting ChatGPT.");
      }
      const permittedRequestedScopes = permittedOAuthScopes(requestedScope, userScopes);
      if (requestedScope.trim() && !permittedRequestedScopes.length) {
        return oauthErrorRedirect(redirectUri, state, "invalid_scope", "The requested Plaivra permissions are unsupported or have not been granted by the user.");
      }
      scope = permittedRequestedScopes.join(" ");
    } else {
      const requested = Array.from(new Set(requestedScope.split(/\s+/).filter(Boolean)));
      const normalized = normalizeMcpScopes(requested, []);
      if (!requested.length || normalized.length !== requested.length || normalized.some((item) => item === MCP_SCOPES.admin || item === MCP_SCOPES.all)) {
        return oauthErrorRedirect(redirectUri, state, "invalid_scope", "The requested Plaivra permissions are unsupported.");
      }
      scope = normalized.join(" ");
    }

    const consentParams: OAuthAuthorizationRequest = {
      ...params,
      requestedScope: scope,
      requestedResource: resource
    };
    const consentUrl = new URL("/oauth/authorize", url.origin);
    const consentSearch = canonicalAuthorizationSearch(consentParams);
    for (const [key, value] of consentSearch) consentUrl.searchParams.set(key, value);
    const continuation = createOAuthContinuation(consentParams);
    await recordOAuthContinuation(continuation);
    consentUrl.searchParams.set("continuation", continuation);
    return NextResponse.redirect(consentUrl);
  } catch (error) {
    if (error instanceof CimdValidationError) {
      return oauthErrorRedirect(redirectUri, state, error.code, error.message);
    }
    return oauthErrorRedirect(redirectUri, state, "server_error", error instanceof Error ? error.message : "Plaivra OAuth authorization failed.");
  }
}

export async function handleOAuthAuthorizeDecision(request: Request, authenticatedUserId: string) {
  const url = new URL(request.url);
  const params = readOAuthAuthorizationRequest(request);
  const continuation = url.searchParams.get("continuation") ?? "";
  const canonicalResource = getCanonicalResource(request);

  if (!params.redirectUri || !isAllowedRedirectUri(params.redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "ChatGPT OAuth callback URL is required." }, { status: 400, headers: metadataHeaders() });
  }
  if (params.responseType !== "code" || !params.clientId || !supportedClientIdFormat(params.clientId)) {
    return NextResponse.json({ error: "invalid_request", error_description: "OAuth authorization request is invalid." }, { status: 400, headers: metadataHeaders() });
  }
  if (!params.codeChallenge || params.codeChallengeMethod !== "S256") {
    return NextResponse.json({ error: "invalid_request", error_description: "PKCE S256 is required." }, { status: 400, headers: metadataHeaders() });
  }
  if (!verifyOAuthContinuation(params, continuation)) {
    return NextResponse.json({ error: "invalid_request", error_description: "Authorization continuation is invalid, expired, or was changed. Start the connection again from ChatGPT." }, { status: 400, headers: metadataHeaders() });
  }

  const resource = params.requestedResource || canonicalResource;
  if (resource !== canonicalResource) {
    return NextResponse.json({ error: "invalid_target", error_description: "The requested resource is not supported by this authorization server." }, { status: 400, headers: metadataHeaders() });
  }

  const rateLimitKey = `authorize_decision:${oauthClientIp(request)}:${rateLimitDigest(params.clientId)}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, AUTHORIZE_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }

  let body: { decision?: unknown } = {};
  try {
    body = await request.json() as { decision?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_request", error_description: "A consent decision is required." }, { status: 400, headers: metadataHeaders() });
  }
  if (body.decision !== "approve" && body.decision !== "deny") {
    return NextResponse.json({ error: "invalid_request", error_description: "Consent decision must be approve or deny." }, { status: 400, headers: metadataHeaders() });
  }

  try {
    const oauthClient = await resolveOAuthClient(params.clientId, params.redirectUri);
    if (!oauthClient) {
      return NextResponse.json({ error: "invalid_client", error_description: "OAuth client is unknown or invalid." }, { status: 401, headers: metadataHeaders() });
    }
    if (oauthClient.kind === "transitional" && oauthClient.connection.user_id !== authenticatedUserId) {
      return NextResponse.json({ error: "access_denied", error_description: "This OAuth client belongs to a different Plaivra account or is no longer active." }, { status: 403, headers: metadataHeaders() });
    }
    if (!(await consumeOAuthContinuation(continuation))) {
      return NextResponse.json({ error: "invalid_request", error_description: "Authorization continuation was already used or is no longer available. Start the connection again from ChatGPT." }, { status: 400, headers: metadataHeaders() });
    }

    const callback = new URL(params.redirectUri);
    if (params.state) callback.searchParams.set("state", params.state);
    if (body.decision === "deny") {
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "The Plaivra account owner declined ChatGPT access.");
      return NextResponse.json({ redirect_to: callback.toString() }, { headers: metadataHeaders() });
    }

    const userScopes = await getUserAiScopes(authenticatedUserId);
    if (!userScopes.length) {
      return NextResponse.json({ error: "access_denied", error_description: "Review and save Plaivra AI Permissions before connecting ChatGPT." }, { status: 403, headers: metadataHeaders() });
    }
    const permittedRequestedScopes = permittedOAuthScopes(params.requestedScope, userScopes);
    if (params.requestedScope.trim() && !permittedRequestedScopes.length) {
      return NextResponse.json({ error: "invalid_scope", error_description: "The requested Plaivra permissions are unsupported or have not been granted by the user." }, { status: 400, headers: metadataHeaders() });
    }
    const scope = permittedRequestedScopes.join(" ");
    const connection = oauthClient.kind === "cimd"
      ? await createCimdConnection(authenticatedUserId, params.clientId, permittedRequestedScopes)
      : oauthClient.connection;
    const code = await createAuthorizationCode(connection, params.redirectUri, params.codeChallenge, scope, resource);
    await recordChatGptConnectionConsent(connection.user_id, request);
    callback.searchParams.set("code", code);
    return NextResponse.json({ redirect_to: callback.toString() }, { headers: metadataHeaders() });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof CimdValidationError ? error.code : "server_error",
        error_description: error instanceof Error ? error.message : "Plaivra OAuth authorization failed."
      },
      { status: error instanceof CimdValidationError ? 400 : 500, headers: metadataHeaders() }
    );
  }
}

const CLIENT_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

async function recordClientAssertionReplayGuard(clientId: string, jti: string, kid: string | null, expiresAt: string) {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("mcp_oauth_client_assertions").insert({
    client_id: clientId,
    jti_hash: hashValue(`client-assertion:${clientId}:${jti}`),
    kid,
    expires_at: expiresAt
  });
  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
      throw new CimdValidationError("client_assertion was already used.");
    }
    throw new CimdValidationError("client_assertion replay protection is unavailable.");
  }
}

async function authenticateOAuthClientForTokenRequest(form: URLSearchParams, request: Request, redirectUri: string) {
  const clientId = getClientIdFromTokenRequest(form);
  const oauthClient = await resolveOAuthClient(clientId, redirectUri);
  if (!oauthClient) throw new CimdValidationError("OAuth client is unknown or revoked.");
  if (request.headers.get("authorization") || form.has("client_secret")) {
    throw new CimdValidationError("HTTP Basic and client secrets are not accepted.");
  }

  const assertion = form.get("client_assertion") ?? "";
  const assertionType = form.get("client_assertion_type") ?? "";
  if (oauthClient.kind === "cimd" && oauthClient.metadata.selectedTokenEndpointAuthMethod === "private_key_jwt") {
    if (assertionType !== CLIENT_ASSERTION_TYPE) {
      throw new CimdValidationError("private_key_jwt requires the standard JWT bearer client_assertion_type.");
    }
    const verified = await verifyCimdPrivateKeyJwt({
      assertion,
      metadata: oauthClient.metadata,
      tokenEndpoint: new URL("/api/oauth/token", serverEnv.plaivraOAuthIssuer).toString()
    });
    await recordClientAssertionReplayGuard(clientId, verified.jti, verified.kid, verified.expiresAt);
  } else if (assertion || assertionType) {
    throw new CimdValidationError("This OAuth client uses public PKCE token exchange and must not send a client assertion.");
  }
  return oauthClient;
}

export async function handleOAuthToken(request: Request) {
  const form = await readTokenRequestForm(request);
  const grantType = form.get("grant_type");
  const code = form.get("code") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const clientId = getClientIdFromTokenRequest(form);
  const codeVerifier = form.get("code_verifier") ?? "";
  const requestedResource = form.get("resource")?.trim() ?? "";
  const canonicalResource = getCanonicalResource(request);

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400, headers: metadataHeaders() });
  }

  if (!code || !clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "code and client_id are required." }, { status: 400, headers: metadataHeaders() });
  }


  if (!supportedClientIdFormat(clientId)) {
    return NextResponse.json({ error: "invalid_client", error_description: "OAuth client_id is unknown or unsupported." }, { status: 401, headers: metadataHeaders() });
  }

  if (!redirectUri) {
    return NextResponse.json({ error: "invalid_request", error_description: "redirect_uri is required." }, { status: 400, headers: metadataHeaders() });
  }

  if (!isAllowedRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid_grant", error_description: "redirect_uri is not an allowed ChatGPT callback." }, { status: 400, headers: metadataHeaders() });
  }

  // Store only digests in rate-limit keys; never persist raw client secrets or authorization-code prefixes.
  const rateLimitKey = `token:${oauthClientIp(request)}:${rateLimitDigest(clientId)}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, TOKEN_RATE_LIMIT, RATE_LIMIT_WINDOW_SECONDS);
  if (rateLimitError) {
    return NextResponse.json(
      { error: rateLimitError.status === 503 ? "temporarily_unavailable" : "invalid_request", error_description: rateLimitError.message },
      { status: rateLimitError.status, headers: metadataHeaders() }
    );
  }

  try {
    const oauthClient = await authenticateOAuthClientForTokenRequest(form, request, redirectUri);

    if (!codeVerifier) {
      return NextResponse.json({ error: "invalid_request", error_description: "code_verifier is required." }, { status: 400, headers: metadataHeaders() });
    }
    if (clientId.startsWith("https://") && !isValidPkceValue(codeVerifier)) {
      return NextResponse.json({ error: "invalid_grant", error_description: "code_verifier must be a valid 43-128 character PKCE value." }, { status: 400, headers: metadataHeaders() });
    }

    const resource = requestedResource || canonicalResource;
    if (clientId.startsWith("https://") && !requestedResource) {
      return NextResponse.json({ error: "invalid_target", error_description: "The resource parameter is required for CIMD token exchange." }, { status: 400, headers: metadataHeaders() });
    }
    if (requestedResource && requestedResource !== canonicalResource) {
      return NextResponse.json({ error: "invalid_target", error_description: "The requested resource is not supported by this authorization server." }, { status: 400, headers: metadataHeaders() });
    }

    const payload = await verifyAuthorizationCode(code, clientId, redirectUri, codeVerifier, resource);
    const connection = await resolveConnectionById(payload.connection_id, payload.user_id);
    if (!connection || (oauthClient.kind === "cimd" && connection.canonicalClientId !== clientId)) {
      return NextResponse.json({ error: "invalid_client", error_description: "Plaivra connection is invalid, cross-user, or revoked." }, { status: 401, headers: metadataHeaders() });
    }

    const accessToken = await createAccessToken(connection, clientId, payload.scope, resource, serverEnv.plaivraOAuthIssuer);

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
      {
        error: error instanceof CimdValidationError ? "invalid_client" : "invalid_grant",
        error_description: error instanceof Error ? error.message : "OAuth token exchange failed."
      },
      { status: error instanceof CimdValidationError ? 401 : 400, headers: metadataHeaders() }
    );
  }
}

export async function handleOAuthRevoke(request: Request) {
  const form = await readTokenRequestForm(request);
  const token = form.get("token") ?? "";
  const clientId = getClientIdFromTokenRequest(form);
  if (!token || !clientId || !supportedClientIdFormat(clientId)) {
    return NextResponse.json({ error: "invalid_request", error_description: "token and client_id are required." }, { status: 400, headers: metadataHeaders() });
  }
  try {
    // The revocation endpoint uses the same CIMD client authentication contract.
    await authenticateOAuthClientForTokenRequest(form, request, "");
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase
      .from("mcp_oauth_access_tokens")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", hashAccessToken(token))
      .eq("client_id", clientId)
      .is("revoked_at", null);
    if (error) throw new Error(error.message);
    return new NextResponse(null, { status: 200, headers: metadataHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: "invalid_client", error_description: error instanceof Error ? error.message : "Token revocation failed." },
      { status: 401, headers: metadataHeaders() }
    );
  }
}

export async function handleOAuthRegister() {
  return NextResponse.json(
    {
      error: "invalid_request",
      error_description: "Dynamic client registration is not supported. Plaivra uses HTTPS Client ID Metadata Documents (CIMD)."
    },
    { status: 404, headers: metadataHeaders() }
  );
}
