import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireEligibleUser, requireUser, serverEnv } from "@/lib/integrations/env";
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
    .select("id,oauth_client_id,scopes,is_active,created_at,last_used_at,revoked_at")
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
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json(
    {
      error: "Start the Plaivra connection from ChatGPT. Plaivra now uses CIMD and does not issue manual client IDs or setup tokens.",
      code: "cimd_connection_starts_in_chatgpt"
    },
    { status: 410 }
  );
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
    const tokenUpdate = await supabase
      .from("mcp_oauth_access_tokens")
      .update({ revoked_at: revokedAt })
      .eq("user_id", context.user.id)
      .is("revoked_at", null);
    if (tokenUpdate.error) {
      console.error("Plaivra OAuth token revocation failed:", tokenUpdate.error.message);
      return NextResponse.json({ error: "ChatGPT access was disabled, but token revocation needs a retry.", code: "token_revoke_failed" }, { status: 500 });
    }
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
