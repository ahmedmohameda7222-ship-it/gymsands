import { NextResponse } from "next/server";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { MCP_DEFAULT_SCOPES, normalizeMcpScopes } from "@/lib/mcp/scopes";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";

export const runtime = "nodejs";

function requireMcpConnectionConfig() {
  return requireServerKeys("FitLife MCP", [
    ["SUPABASE_SERVICE_ROLE_KEY", serverEnv.supabaseServiceRoleKey],
    ["FITLIFE_MCP_TOKEN_SECRET", serverEnv.fitlifeMcpTokenSecret]
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

  const token = createConnectionToken();
  const tokenHash = hashConnectionToken(token);
  const supabase = createSupabaseAdminClient();
  const body = (await request.json().catch(() => ({}))) as { scopes?: unknown };
  const scopes = normalizeMcpScopes(body.scopes, MCP_DEFAULT_SCOPES);

  await supabase
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("is_active", true)
    .is("revoked_at", null);

  const { data, error } = await supabase
    .from("chatgpt_connections")
    .insert({
      user_id: context.user.id,
      token_hash: tokenHash,
      scopes,
      is_active: true
    })
    .select("id,scopes,is_active,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    token,
    connection: data,
    message: "Copy this FitLife ChatGPT connection token now. It is shown only once."
  });
}

export async function DELETE(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const missingConfig = requireMcpConnectionConfig();
  if (missingConfig) return missingConfig;

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("is_active", true)
    .is("revoked_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
