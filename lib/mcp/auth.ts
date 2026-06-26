import crypto from "node:crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import {
  MCP_SCOPES,
  MCP_DEFAULT_SCOPES,
  expandMcpScopes,
  migrateLegacyScopes
} from "@/lib/mcp/scopes";

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
  return `fitlife_mcp_${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashConnectionToken(token: string) {
  if (!serverEnv.fitlifeMcpTokenSecret) {
    throw new Error("FITLIFE_MCP_TOKEN_SECRET is required to hash ChatGPT connection tokens.");
  }
  return crypto.createHmac("sha256", serverEnv.fitlifeMcpTokenSecret).update(token).digest("hex");
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

async function rateLimit(supabase: SupabaseClient, connectionId: string) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const resetIso = new Date(now + 60_000).toISOString();

  const existing = await supabase
    .from("mcp_rate_limits")
    .select("connection_id,request_count,window_start,reset_at")
    .eq("connection_id", connectionId)
    .maybeSingle();

  if (existing.error) {
    return inMemoryRateLimit(connectionId);
  }

  const row = existing.data as { request_count?: number | null; reset_at?: string | null } | null;
  const resetAt = row?.reset_at ? Date.parse(row.reset_at) : 0;
  if (!row || !Number.isFinite(resetAt) || resetAt <= now) {
    const upsert = await supabase.from("mcp_rate_limits").upsert({
      connection_id: connectionId,
      request_count: 1,
      window_start: nowIso,
      reset_at: resetIso,
      updated_at: nowIso
    });
    return upsert.error ? inMemoryRateLimit(connectionId) : null;
  }

  const nextCount = Number(row.request_count ?? 0) + 1;
  const update = await supabase
    .from("mcp_rate_limits")
    .update({ request_count: nextCount, updated_at: nowIso })
    .eq("connection_id", connectionId);
  if (update.error) return inMemoryRateLimit(connectionId);

  if (nextCount > MAX_REQUESTS_PER_MINUTE) {
    return `Rate limit exceeded. Try again after ${Math.ceil((resetAt - now) / 1000)} seconds.`;
  }
  return null;
}

export async function authenticateMcpRequest(request: Request): Promise<McpContext | NextResponse> {
  const token = getBearerToken(request);
  if (!token) return unauthorizedMcpResponse(request);

  if (!serverEnv.supabaseServiceRoleKey) {
    return serviceUnavailable("Supabase service role is required for Plaivra MCP.");
  }

  let tokenHash = "";
  try {
    tokenHash = hashConnectionToken(token);
  } catch (error) {
    return serviceUnavailable("Plaivra MCP token configuration is incomplete.", error);
  }

  const supabase = createSupabaseAdminClient();
  const { data: connection, error } = await supabase
    .from("chatgpt_connections")
    .select("id,user_id,scopes,is_active,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) return badMcpRequest("Could not verify the ChatGPT connection token.", error);
  if (!connection || !connection.is_active || connection.revoked_at) {
    return unauthorizedMcpResponse(request, "ChatGPT connection token is invalid or revoked.");
  }

  const limitError = await rateLimit(supabase, connection.id);
  if (limitError) return NextResponse.json({ error: limitError }, { status: 429 });

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id,email,full_name,role")
    .eq("id", connection.user_id)
    .maybeSingle();

  if (profileError) return badMcpRequest("Could not load the linked Plaivra profile.", profileError);
  if (!profile) return unauthorizedMcpResponse(request, "Linked Plaivra profile was not found.", 403);

  await supabase.from("chatgpt_connections").update({ last_used_at: new Date().toISOString() }).eq("id", connection.id);

  // Source of truth: user_ai_permission_settings
  let resolvedScopes: string[] = [];
  const { data: permissionSettings, error: permissionError } = await supabase
    .from("user_ai_permission_settings")
    .select("access_mode,scopes")
    .eq("user_id", connection.user_id)
    .maybeSingle();

  if (permissionSettings && !permissionError) {
    // Use stored user AI permission settings as the source of truth
    resolvedScopes = expandMcpScopes(permissionSettings.scopes ?? []);
  } else if (connection.scopes && Array.isArray(connection.scopes) && connection.scopes.length > 0) {
    // Fallback: migrate legacy connection scopes for backward compatibility
    resolvedScopes = expandMcpScopes(migrateLegacyScopes(connection.scopes));
  }

  // Safety: if no valid permission settings and no legacy scopes, deny access
  if (!resolvedScopes.length || resolvedScopes.length === 0) {
    return unauthorizedMcpResponse(request, "AI permission settings are missing for this account. Please configure AI Permissions in Settings.", 403);
  }

  return {
    supabase,
    userId: connection.user_id,
    connectionId: connection.id,
    scopes: resolvedScopes,
    profile: profile as McpProfile
  };
}
