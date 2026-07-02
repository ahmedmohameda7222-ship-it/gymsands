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
    const matchesStrictChatGptPattern = (
      url.protocol === "https:" &&
      url.hostname === "chatgpt.com" &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/connector\/oauth\/[A-Za-z0-9._~-]{1,200}$/.test(url.pathname)
    );
    if (!matchesStrictChatGptPattern) return false;

    const exactRedirectUris = configuredRedirectUris.split(",").map((item) => item.trim()).filter(Boolean);
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
  return isValidUuid(clientId) || (serverEnv.plaivraAllowLegacyMcpClientId && isLegacyClientIdFormat(clientId));
}

function rateLimitDigest(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 32);
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

export async function getAccessTokenAuthenticationRecord(token: string) {
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
  return { ...data, expired: new Date(data.expires_at) < new Date() };
}

export async function getAccessTokenRecord(token: string) {
  const record = await getAccessTokenAuthenticationRecord(token);
  return record && !record.expired ? record : null;
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
  const origin = originFromRequest(request);

  return NextResponse.json(
    {
      issuer: origin,
      authorization_endpoint: `${origin}/api/oauth/authorize`,
      token_endpoint: `${origin}/api/oauth/token`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      scopes_supported: MCP_SUPPORTED_SCOPES
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
      return oauthErrorRedirect(redirectUri, state, "invalid_client", "Plaivra OAuth client is unknown, inactive, or revoked.");
    }

    const userScopes = await getUserAiScopes(connection.user_id);
    if (!userScopes.length) {
      return oauthErrorRedirect(redirectUri, state, "access_denied", "Review and save Plaivra AI Permissions before connecting ChatGPT.");
    }
    const permittedRequestedScopes = permittedOAuthScopes(requestedScope, userScopes);
    if (requestedScope.trim() && !permittedRequestedScopes.length) {
      return oauthErrorRedirect(redirectUri, state, "invalid_scope", "The requested Plaivra permissions are unsupported or have not been granted by the user.");
    }
    const scope = permittedRequestedScopes.join(" ");

    const consentParams: OAuthAuthorizationRequest = {
      ...params,
      requestedScope: scope,
      requestedResource: resource
    };
    const consentUrl = new URL("/oauth/authorize", url.origin);
    const consentSearch = canonicalAuthorizationSearch(consentParams);
    for (const [key, value] of consentSearch) consentUrl.searchParams.set(key, value);
    consentUrl.searchParams.set("continuation", createOAuthContinuation(consentParams));
    return NextResponse.redirect(consentUrl);
  } catch (error) {
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
    return NextResponse.json({ error: "invalid_request", error_description: "Too many authorization requests. Please try again later." }, { status: 429, headers: metadataHeaders() });
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
    const connection = await resolveClientId(params.clientId);
    if (!connection || connection.user_id !== authenticatedUserId) {
      return NextResponse.json({ error: "access_denied", error_description: "This OAuth client belongs to a different Plaivra account or is no longer active." }, { status: 403, headers: metadataHeaders() });
    }

    const callback = new URL(params.redirectUri);
    if (params.state) callback.searchParams.set("state", params.state);
    if (body.decision === "deny") {
      callback.searchParams.set("error", "access_denied");
      callback.searchParams.set("error_description", "The Plaivra account owner declined ChatGPT access.");
      return NextResponse.json({ redirect_to: callback.toString() }, { headers: metadataHeaders() });
    }

    const userScopes = await getUserAiScopes(connection.user_id);
    if (!userScopes.length) {
      return NextResponse.json({ error: "access_denied", error_description: "Review and save Plaivra AI Permissions before connecting ChatGPT." }, { status: 403, headers: metadataHeaders() });
    }
    const permittedRequestedScopes = permittedOAuthScopes(params.requestedScope, userScopes);
    if (params.requestedScope.trim() && !permittedRequestedScopes.length) {
      return NextResponse.json({ error: "invalid_scope", error_description: "The requested Plaivra permissions are unsupported or have not been granted by the user." }, { status: 400, headers: metadataHeaders() });
    }
    const scope = permittedRequestedScopes.join(" ");
    const code = await createAuthorizationCode(connection, params.redirectUri, params.codeChallenge, scope, resource);
    callback.searchParams.set("code", code);
    return NextResponse.json({ redirect_to: callback.toString() }, { headers: metadataHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: "server_error", error_description: error instanceof Error ? error.message : "Plaivra OAuth authorization failed." },
      { status: 500, headers: metadataHeaders() }
    );
  }
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

  if (request.headers.get("authorization")) {
    return NextResponse.json({ error: "invalid_client", error_description: "This public OAuth client must send client_id in the request body without client authentication." }, { status: 401, headers: metadataHeaders() });
  }

  if (form.has("client_secret") || form.has("client_assertion") || form.has("client_assertion_type")) {
    return NextResponse.json({ error: "invalid_client", error_description: "Client secrets and client assertions are not supported for this public OAuth client." }, { status: 401, headers: metadataHeaders() });
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
  const rateLimitKey = `token:${rateLimitDigest(clientId)}:${rateLimitDigest(code)}`;
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
  return NextResponse.json(
    {
      error: "invalid_request",
      error_description: "Dynamic client registration is not supported. Use the pre-registered Plaivra OAuth client ID shown in Settings."
    },
    { status: 404, headers: metadataHeaders() }
  );
}
