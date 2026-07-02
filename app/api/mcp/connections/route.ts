import { NextResponse } from "next/server";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireUser, serverEnv } from "@/lib/integrations/env";
import { getSavedUserAiScopes, rotateMcpConnection } from "@/lib/mcp/connections";
import { oauthRateLimit } from "@/lib/mcp/oauth";
import { CHATGPT_CONNECTION_CONSENT_VERSION } from "@/lib/legal/versions";

export const runtime = "nodejs";

function requireMcpConnectionConfig() {
  if (serverEnv.supabaseServiceRoleKey && serverEnv.plaivraMcpTokenSecret) return null;
  return NextResponse.json(
    { error: "ChatGPT connection setup is not configured for this deployment.", code: "mcp_not_configured" },
    { status: 503 }
  );
}

export async function GET(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const missingConfig = requireMcpConnectionConfig();
  if (missingConfig) return missingConfig;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chatgpt_connections")
    .select("id,scopes,is_active,created_at,last_used_at,revoked_at")
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    console.error("Plaivra MCP connection list failed:", error.message);
    return NextResponse.json({ error: "ChatGPT connections could not be loaded.", code: "connection_list_failed" }, { status: 500 });
  }
  return NextResponse.json({ connections: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const missingConfig = requireMcpConnectionConfig();
  if (missingConfig) return missingConfig;

  // Rate limit connection creation by user_id
  const rateLimitKey = `connection_create:${context.user.id}`;
  const rateLimitError = await oauthRateLimit(rateLimitKey, 10, 60);
  if (rateLimitError) {
    return NextResponse.json(
      { error: "Too many connection requests. Please try again later.", code: "connection_rate_limited" },
      { status: 429 }
    );
  }

  const supabase = createSupabaseAdminClient();

  let userScopes: string[];
  try {
    userScopes = await getSavedUserAiScopes(supabase, context.user.id);
  } catch (error) {
    console.error("Plaivra MCP AI permission lookup failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      { error: "AI permission settings could not be loaded. Please try again.", code: "ai_permissions_lookup_failed" },
      { status: 500 }
    );
  }

  if (!userScopes.length) {
    return NextResponse.json(
      { error: "AI permission settings are missing. Configure AI Permissions in Settings before connecting ChatGPT.", code: "missing_ai_permissions" },
      { status: 403 }
    );
  }

  const token = createConnectionToken();
  const tokenHash = hashConnectionToken(token);
  const { data, error } = await rotateMcpConnection(supabase, {
    userId: context.user.id,
    tokenHash,
    scopes: userScopes
  });

  if (error || !data) {
    console.error("Plaivra MCP secure rotation failed:", error?.message ?? "No connection returned");
    return NextResponse.json({ error: "Could not securely rotate the ChatGPT connection. No new connection was created.", code: "connection_rotation_failed" }, { status: 500 });
  }

  const connection = Array.isArray(data) ? data[0] : data;
  if (!connection) {
    return NextResponse.json({ error: "Could not securely rotate the ChatGPT connection. No new connection was created.", code: "connection_rotation_failed" }, { status: 500 });
  }

  return NextResponse.json({
    client_id: connection.id,
    ...(serverEnv.plaivraAllowLegacyMcpClientId ? { token } : {}),
    connection,
    message: serverEnv.plaivraAllowLegacyMcpClientId
      ? "Use client_id in ChatGPT OAuth settings. A temporary legacy setup code is also included for private compatibility."
      : "Use client_id in ChatGPT OAuth settings and leave the client secret empty."
  });
}

export async function DELETE(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const missingConfig = requireMcpConnectionConfig();
  if (missingConfig) return missingConfig;

  const supabase = createSupabaseAdminClient();
  try {
    const { error } = await supabase
      .from("chatgpt_connections")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("user_id", context.user.id)
      .eq("is_active", true);

    if (error) {
      console.error("Plaivra MCP revoke error:", error.message);
      return NextResponse.json({ error: "ChatGPT access could not be revoked.", code: "connection_revoke_failed" }, { status: 500 });
    }
    const revokedAt = new Date().toISOString();
    const consentUpdate = await supabase
      .from("user_consents")
      .update({ granted: false, revoked_at: revokedAt })
      .eq("user_id", context.user.id)
      .eq("consent_type", "chatgpt_connection")
      .eq("version", CHATGPT_CONNECTION_CONSENT_VERSION);
    if (consentUpdate.error) {
      console.error("Plaivra ChatGPT consent revocation audit failed:", consentUpdate.error.message);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Plaivra MCP revoke unexpected error:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "ChatGPT access could not be revoked.", code: "connection_revoke_failed" }, { status: 500 });
  }
}
