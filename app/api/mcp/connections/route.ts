import { NextResponse } from "next/server";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { MCP_DEFAULT_SCOPES, expandMcpScopes } from "@/lib/mcp/scopes";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";

export const runtime = "nodejs";

function requireMcpConnectionConfig() {
  return requireServerKeys("Plaivra MCP", [
    ["SUPABASE_SERVICE_ROLE_KEY", serverEnv.supabaseServiceRoleKey],
    ["PLAIVRA_MCP_TOKEN_SECRET", serverEnv.plaivraMcpTokenSecret]
  ]);
}

async function getOrCreateUserAiScopes(supabase: ReturnType<typeof createSupabaseAdminClient>, userId: string): Promise<string[]> {
  const { data: settings } = await supabase
    .from("user_ai_permission_settings")
    .select("scopes")
    .eq("user_id", userId)
    .maybeSingle();

  if (settings && Array.isArray(settings.scopes) && settings.scopes.length > 0) {
    return expandMcpScopes(settings.scopes);
  }

  // Default: create explicit full access settings for backward compatibility
  const defaultScopes = MCP_DEFAULT_SCOPES;
  await supabase
    .from("user_ai_permission_settings")
    .upsert({ user_id: userId, access_mode: "full", scopes: defaultScopes }, { onConflict: "user_id" });

  return defaultScopes;
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

  const token = createConnectionToken();
  const tokenHash = hashConnectionToken(token);
  const supabase = createSupabaseAdminClient();

  try {
    const { error: revokeError } = await supabase
      .from("chatgpt_connections")
      .update({ is_active: false, revoked_at: new Date().toISOString() })
      .eq("user_id", context.user.id)
      .eq("is_active", true);
    if (revokeError) {
      console.warn("Plaivra MCP could not revoke previous connections:", revokeError.message);
    }
  } catch {
    // Non-blocking: continue to create new token even if revoke fails
  }

  const userScopes = await getOrCreateUserAiScopes(supabase, context.user.id);

  const { data, error } = await supabase
    .from("chatgpt_connections")
    .insert({
      user_id: context.user.id,
      token_hash: tokenHash,
      scopes: userScopes,
      is_active: true
    })
    .select("id,scopes,is_active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    token,
    connection: data,
    message: "Copy this Plaivra ChatGPT connection code now. It is shown only once."
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
