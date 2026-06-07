import { NextResponse } from "next/server";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { createConnectionToken, hashConnectionToken } from "@/lib/mcp/auth";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

const defaultScopes = [
  "fitlife.profile.read",
  "fitlife.summary.read",
  "fitlife.nutrition.write",
  "fitlife.training.write",
  "fitlife.progress.write"
];

function requiredConfig() {
  return requireServerKeys("ChatGPT MCP", [
    ["SUPABASE_SERVICE_ROLE_KEY", serverEnv.supabaseServiceRoleKey],
    ["FITLIFE_MCP_TOKEN_SECRET", serverEnv.fitlifeMcpTokenSecret]
  ]);
}

export async function GET(request: Request) {
  const missing = requiredConfig();
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chatgpt_connections")
    .select("id,label,scopes,is_active,last_used_at,revoked_at,created_at,updated_at")
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error) return jsonError(error.message, 400);

  return NextResponse.json({ connections: data ?? [], active_connection: (data ?? []).find((connection) => connection.is_active && !connection.revoked_at) ?? null });
}

export async function POST(request: Request) {
  const missing = requiredConfig();
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = (await request.json().catch(() => ({}))) as { label?: string; scopes?: string[] };
  const token = createConnectionToken();
  const supabase = createSupabaseAdminClient();

  await supabase.from("chatgpt_connections").update({ is_active: false, revoked_at: new Date().toISOString() }).eq("user_id", context.user.id).eq("is_active", true);

  const { data, error } = await supabase
    .from("chatgpt_connections")
    .insert({
      user_id: context.user.id,
      token_hash: hashConnectionToken(token),
      label: body.label?.trim() || "ChatGPT",
      scopes: Array.isArray(body.scopes) && body.scopes.length ? body.scopes : defaultScopes,
      is_active: true
    })
    .select("id,label,scopes,is_active,last_used_at,created_at")
    .single();

  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ connection: data, token, token_notice: "Copy this token now. FitLife stores only a hash and cannot show it again." });
}

export async function DELETE(request: Request) {
  const missing = requiredConfig();
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("is_active", true)
    .select("id,label,revoked_at");
  if (error) return jsonError(error.message, 400);

  return NextResponse.json({ revoked: data ?? [] });
}
