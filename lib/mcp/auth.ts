import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  resolveSavedAiPermissionScopes
} from "@/lib/mcp/scopes";
import { getAccessTokenAuthenticationRecord } from "@/lib/mcp/oauth";

export type McpProfile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: "member" | "admin";
};

export type McpContext = {
  supabase: SupabaseClient;
  userId: string;
  connectionId: string;
  scopes: string[];
  profile: McpProfile;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const MAX_REQUESTS_PER_MINUTE = 60;

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function createConnectionToken() {
  return `plaivra_mcp_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashConnectionToken(token: string) {
  if (!serverEnv.plaivraMcpTokenSecret) {
    throw new Error("PLAIVRA_MCP_TOKEN_SECRET is required to hash ChatGPT connection tokens.");
  }
  return crypto.createHmac("sha256", serverEnv.plaivraMcpTokenSecret).update(token).digest("hex");
}

function protectedResourceUrl(request: Request) {
  const url = new URL(request.url);
  return `${url.origin}/.well-known/oauth-protected-resource`;
}

export function unauthorizedMcpResponse(request: Request, message = "Plaivra ChatGPT connection is required.", status = 401) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: {
        "WWW-Authenticate": `Bearer realm="Plaivra MCP", resource_metadata="${protectedResourceUrl(request)}"`
      }
    }
  );
}

function serviceUnavailable(message: string, details?: unknown) {
  return NextResponse.json(
    process.env.NODE_ENV === "development" && details ? { error: message, details } : { error: message },
    { status: 503 }
  );
}

function badMcpRequest(message: string, details?: unknown) {
  return NextResponse.json(
    process.env.NODE_ENV === "development" && details ? { error: message, details } : { error: message },
    { status: 400 }
  );
}

function inMemoryRateLimit(connectionId: string) {
  const now = Date.now();
  const current = rateLimitBuckets.get(connectionId);
  if (!current || current.resetAt <= now) {
    rateLimitBuckets.set(connectionId, { count: 1, resetAt: now + 60_000 });
    return null;
  }
  current.count += 1;
  if (current.count > MAX_REQUESTS_PER_MINUTE) {
    return `Rate limit exceeded. Try again after ${Math.ceil((current.resetAt - now) / 1000)} seconds.`;
  }
  return null;
}

export async function rateLimit(supabase: SupabaseClient, connectionId: string) {
  const { data, error } = await supabase.rpc("consume_mcp_rate_limit", {
    p_connection_id: connectionId,
    p_limit: MAX_REQUESTS_PER_MINUTE,
    p_window_seconds: 60
  });

  if (error) return inMemoryRateLimit(connectionId);

  const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean; reset_at?: string | null } | null;
  if (!row) return inMemoryRateLimit(connectionId);
  if (row.allowed !== false) return null;
  const resetAt = row.reset_at ? Date.parse(row.reset_at) : Date.now() + 60_000;
  return `Rate limit exceeded. Try again after ${Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))} seconds.`;
}

export function connectionIsUsable<T extends { is_active?: boolean | null; revoked_at?: string | null }>(
  connection: T | null
): connection is T & { is_active: true } {
  return Boolean(connection?.is_active && !connection.revoked_at);
}

export function resolveMcpPermissionScopes(
  permissionSettings: { access_mode?: unknown; scopes?: unknown } | null,
  permissionError?: unknown
) {
  if (permissionError || !permissionSettings || !Array.isArray(permissionSettings.scopes)) return [];
  return resolveSavedAiPermissionScopes(permissionSettings.access_mode, permissionSettings.scopes);
}

async function auditMcpAuthenticationDenied(
  supabase: SupabaseClient,
  userId: string | null,
  connectionId: string | null,
  reasonCode: "expired_token" | "revoked_connection" | "invalid_resource" | "missing_permissions" | "stale_permissions"
) {
  if (!userId || !connectionId) return;
  await supabase.from("mcp_audit_logs").insert({
    user_id: userId,
    connection_id: connectionId,
    tool_name: "connection_authorization",
    input: { version: 1, tool_name: "connection_authorization", input_keys: [], object_ids: {}, counts: {}, flags: {} },
    output_summary: { is_error: true, denied: true, reason_code: reasonCode },
    status: "error",
    error_message: null
  });
}

export async function authenticateMcpRequest(request: Request): Promise<McpContext | NextResponse> {
  const url = new URL(request.url);
  const token = getBearerToken(request);
  if (!token) return unauthorizedMcpResponse(request);

  if (!serverEnv.supabaseServiceRoleKey) {
    return serviceUnavailable("Supabase service role is required for Plaivra MCP.");
  }

  const supabase = createSupabaseAdminClient();

  let connectionId: string | null = null;
  let userId: string | null = null;
  let tokenScopes: string[] | null = null;
  let tokenResource: string | null = null;

  // Phase 2: OAuth access tokens (plaivra_mcp_at_...)
  if (token.startsWith("plaivra_mcp_at_")) {
    try {
      const accessRecord = await getAccessTokenAuthenticationRecord(token);
      if (!accessRecord) {
        return unauthorizedMcpResponse(request, "Access token is invalid or expired. Reconnect Plaivra from ChatGPT settings.");
      }
      connectionId = accessRecord.connection_id;
      userId = accessRecord.user_id;
      if (accessRecord.expired) {
        await auditMcpAuthenticationDenied(supabase, userId, connectionId, "expired_token");
        return unauthorizedMcpResponse(request, "Access token is invalid or expired. Reconnect Plaivra from ChatGPT settings.");
      }
      tokenScopes = Array.isArray(accessRecord.scope) ? accessRecord.scope : [];
      tokenResource = accessRecord.resource ?? null;
    } catch (error) {
      return serviceUnavailable("Plaivra MCP token verification failed.", error);
    }
  } else {
    // Legacy connection secrets are no longer accepted as access tokens.
    return unauthorizedMcpResponse(request, "Access token is invalid or expired. Reconnect Plaivra from ChatGPT settings.");
  }

  if (!connectionId || !userId) {
    return unauthorizedMcpResponse(request, "ChatGPT connection token is invalid or revoked.");
  }

  // Verify the underlying connection is still active and not revoked
  const { data: connection, error: connectionError } = await supabase
    .from("chatgpt_connections")
    .select("id,user_id,is_active,revoked_at")
    .eq("id", connectionId)
    .maybeSingle();

  if (connectionError) return badMcpRequest("Could not verify the ChatGPT connection.", connectionError);
  if (!connectionIsUsable(connection)) {
    await auditMcpAuthenticationDenied(supabase, userId, connectionId, "revoked_connection");
    return unauthorizedMcpResponse(request, "ChatGPT connection is inactive or revoked. Reconnect in Plaivra Settings.");
  }

  const limitError = await rateLimit(supabase, connectionId);
  if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) return badMcpRequest("Could not load the linked Plaivra profile.", profileError);
  if (!profile) return unauthorizedMcpResponse(request, "Linked Plaivra profile was not found.", 403);

  await supabase.from("chatgpt_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connectionId);

  // Verify the token was minted for this protected resource.
  const canonicalResource = serverEnv.plaivraMcpBaseUrl || `${url.origin}/api/mcp`;
  if (!tokenResource || tokenResource !== canonicalResource) {
    await auditMcpAuthenticationDenied(supabase, userId, connectionId, "invalid_resource");
    return unauthorizedMcpResponse(request, "Access token resource mismatch. Reconnect Plaivra from ChatGPT settings.", 401);
  }

  // Sole authorization source of truth: user_ai_permission_settings.
  const { data: permissionSettings, error: permissionError } = await supabase
    .from("user_ai_permission_settings")
    .select("access_mode,scopes")
    .eq("user_id", userId)
    .maybeSingle();

  const resolvedScopes = resolveMcpPermissionScopes(permissionSettings, permissionError);

  if (!resolvedScopes.length) {
    await auditMcpAuthenticationDenied(supabase, userId, connectionId, "missing_permissions");
    return unauthorizedMcpResponse(request, "AI permission settings are missing for this account. Please configure AI Permissions in Settings.", 403);
  }

  // The token must not grant broader access than the user's saved AI permissions.
  const allowedScopeSet = new Set(resolvedScopes);
  const effectiveScopes = tokenScopes?.filter((s) => allowedScopeSet.has(s)) ?? [];

  if (!effectiveScopes.length) {
    await auditMcpAuthenticationDenied(supabase, userId, connectionId, "stale_permissions");
    return unauthorizedMcpResponse(request, "AI permission settings have changed. Reconnect Plaivra from ChatGPT settings to refresh permissions.", 403);
  }

  return {
    supabase,
    userId,
    connectionId,
    scopes: effectiveScopes,
    profile: profile as McpProfile
  };
}
