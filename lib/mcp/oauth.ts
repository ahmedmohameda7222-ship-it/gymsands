import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { hashConnectionToken } from "@/lib/mcp/auth";
import { MCP_DEFAULT_SCOPES, MCP_FULL_ACCESS_SCOPES, MCP_SUPPORTED_SCOPES, normalizeMcpScopes } from "@/lib/mcp/scopes";

type AuthorizationCodePayload = {
  clientHash: string;
  redirectUri: string;
  scope: string;
  exp: number;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  if (!serverEnv.fitlifeMcpTokenSecret) {
    throw new Error("FITLIFE_MCP_TOKEN_SECRET is required for FitLife MCP OAuth.");
  }

  return crypto.createHmac("sha256", serverEnv.fitlifeMcpTokenSecret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createAuthorizationCode(payload: AuthorizationCodePayload) {
  const encoded = base64UrlEncode(JSON.stringify(payload));
  return `fitlife_code_${encoded}.${sign(encoded)}`;
}

function verifyAuthorizationCode(code: string): AuthorizationCodePayload {
  if (!code.startsWith("fitlife_code_")) {
    throw new Error("Invalid authorization code.");
  }

  const body = code.slice("fitlife_code_".length);
  const [encoded, signature] = body.split(".");
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new Error("Invalid authorization code signature.");
  }

  const payload = JSON.parse(base64UrlDecode(encoded)) as AuthorizationCodePayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Authorization code expired.");
  }

  return payload;
}

function originFromRequest(request: Request) {
  const url = new URL(request.url);
  return url.origin;
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

async function getConnectionForClientId(clientId: string) {
  if (!clientId.startsWith("fitlife_mcp_")) {
    return null;
  }

  const tokenHash = hashConnectionToken(clientId);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chatgpt_connections")
    .select("id,user_id,scopes,is_active,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !data.is_active || data.revoked_at) return null;
  return { ...data, tokenHash };
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
      code_challenge_methods_supported: ["S256", "plain"],
      scopes_supported: MCP_SUPPORTED_SCOPES,
      registration_endpoint: `${origin}/api/oauth/register`
    },
    { headers: metadataHeaders() }
  );
}

export function oauthProtectedResourceMetadata(request: Request) {
  const origin = originFromRequest(request);
  const resource = serverEnv.fitlifeMcpBaseUrl || `${origin}/api/mcp`;

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

  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    return NextResponse.json({ error: "invalid_redirect_uri", error_description: "ChatGPT OAuth callback URL is required." }, { status: 400 });
  }

  if (responseType !== "code") {
    return oauthErrorRedirect(redirectUri, state, "unsupported_response_type", "FitLife MCP supports only authorization_code OAuth.");
  }

  if (!clientId) {
    return oauthErrorRedirect(redirectUri, state, "invalid_client", "Use your FitLife connection token as the OAuth Client ID.");
  }

  try {
    const connection = await getConnectionForClientId(clientId);
    if (!connection) {
      return oauthErrorRedirect(redirectUri, state, "access_denied", "FitLife connection token is invalid or revoked.");
    }

    const scope = normalizeMcpScopes(requestedScope, MCP_FULL_ACCESS_SCOPES).join(" ");

    const code = createAuthorizationCode({
      clientHash: connection.tokenHash,
      redirectUri,
      scope,
      exp: Math.floor(Date.now() / 1000) + 5 * 60
    });

    const callback = new URL(redirectUri);
    callback.searchParams.set("code", code);
    if (state) callback.searchParams.set("state", state);
    return NextResponse.redirect(callback);
  } catch (error) {
    return oauthErrorRedirect(redirectUri, state, "server_error", error instanceof Error ? error.message : "FitLife OAuth authorization failed.");
  }
}

export async function handleOAuthToken(request: Request) {
  const form = await readTokenRequestForm(request);
  const grantType = form.get("grant_type");
  const code = form.get("code") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const clientId = getClientIdFromTokenRequest(request, form);

  if (grantType !== "authorization_code") {
    return NextResponse.json({ error: "unsupported_grant_type" }, { status: 400, headers: metadataHeaders() });
  }

  if (!code || !clientId) {
    return NextResponse.json({ error: "invalid_request", error_description: "code and client_id are required." }, { status: 400, headers: metadataHeaders() });
  }

  try {
    const connection = await getConnectionForClientId(clientId);
    if (!connection) {
      return NextResponse.json({ error: "invalid_client", error_description: "FitLife connection token is invalid or revoked." }, { status: 401, headers: metadataHeaders() });
    }

    const payload = verifyAuthorizationCode(code);
    if (payload.clientHash !== connection.tokenHash) {
      return NextResponse.json({ error: "invalid_grant", error_description: "Authorization code does not match this client." }, { status: 400, headers: metadataHeaders() });
    }

    if (redirectUri && redirectUri !== payload.redirectUri) {
      return NextResponse.json({ error: "invalid_grant", error_description: "redirect_uri does not match authorization request." }, { status: 400, headers: metadataHeaders() });
    }

    return NextResponse.json(
      {
        access_token: clientId,
        token_type: "Bearer",
        expires_in: 60 * 60 * 24 * 30,
        scope: payload.scope || MCP_FULL_ACCESS_SCOPES.join(" ")
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
      client_id: "Paste your FitLife fitlife_mcp_ token here as OAuth Client ID",
      client_id_issued_at: Math.floor(Date.now() / 1000),
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code"],
      response_types: ["code"]
    },
    { status: 201, headers: metadataHeaders() }
  );
}
