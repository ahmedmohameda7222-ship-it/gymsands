import { NextResponse } from "next/server";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { getSavedUserAiScopes, rotateMcpConnection } from "@/lib/mcp/connections";
import { oauthRateLimit } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

function requireMcpConnectionConfig() {
  return requireServerKeys("Plaivra MCP", [
    ["SUPABASE_SERVICE_ROLE_KEY", serverEnv.supabaseServiceRoleKey],
    ["PLAIVRA_MCP_TOKEN_SECRET", serverEnv.plaivraMcpTokenSecret]
  ]);
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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
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
    return NextResponse.json({ error: "Too many connection requests. Please try again later." }, { status: 429 });
  }

  const supabase = createSupabaseAdminClient();

  const userScopes = await getSavedUserAiScopes(supabase, context.user.id);
  if (!userScopes.length) {
    return NextResponse.json(
      { error: "AI permission settings are missing. Configure AI Permissions in Settings before connecting ChatGPT." },
      { status: 409 }
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
    return NextResponse.json({ error: "Could not securely rotate the ChatGPT connection. No new connection was created." }, { status: 409 });
  }

  const connection = Array.isArray(data) ? data[0] : data;
  if (!connection) {
    return NextResponse.json({ error: "Could not securely rotate the ChatGPT connection. No new connection was created." }, { status: 409 });
  }

  return NextResponse.json({
    token,
    client_id: connection.id,
    connection,
    message: "Copy your Plaivra ChatGPT connection code now. It is shown only once. Use the client_id in your ChatGPT OAuth settings."
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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Plaivra MCP revoke unexpected error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unexpected error" }, { status: 500 });
  }
}
