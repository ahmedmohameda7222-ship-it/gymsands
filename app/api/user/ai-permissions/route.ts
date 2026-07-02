import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  MCP_SCOPES,
  MCP_FULL_ACCESS_SCOPES,
  supportedScopeSet,
  expandMcpScopes,
  normalizeMcpScopes
} from "@/lib/mcp/scopes";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_ai_permission_settings")
    .select("*")
    .eq("user_id", context.user.id)
    .maybeSingle();

  if (error) {
    console.error("Plaivra AI permissions load failed:", error.message);
    return NextResponse.json({ error: "AI permissions could not be loaded.", code: "ai_permissions_load_failed" }, { status: 500 });
  }

  return NextResponse.json({ settings: data ?? null });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-permissions-save", 10, 60_000);
  if (limited) return limited;

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (body.access_mode !== "custom" && body.access_mode !== "full") {
    return NextResponse.json({ error: "access_mode must be full or custom." }, { status: 400 });
  }
  const accessMode = body.access_mode;

  let scopes: string[];
  if (accessMode === "full") {
    // Derive the full normal-user scope list server-side. Do not trust body.scopes.
    scopes = [...MCP_FULL_ACCESS_SCOPES];
  } else {
    // Custom mode: validate and normalize submitted scopes
    const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];
    const candidateScopes = rawScopes
      .map((s) => String(s).trim())
      .filter(Boolean);

    // Reject unknown scopes
    const invalidScopes = candidateScopes.filter(
      (s) => !supportedScopeSet.has(s)
    );
    if (invalidScopes.length > 0) {
      return NextResponse.json(
        { error: `Invalid scopes: ${invalidScopes.join(", ")}` },
        { status: 400 }
      );
    }

    // Never allow normal users to save plaivra.admin
    if (
      candidateScopes.includes(MCP_SCOPES.admin) ||
      candidateScopes.includes(MCP_SCOPES.all) ||
      candidateScopes.includes(MCP_SCOPES.fullAccess)
    ) {
      return NextResponse.json(
        { error: "Full, all, and admin scopes are not allowed in custom mode." },
        { status: 400 }
      );
    }

    // Normalize and expand write->read within the same section only
    const normalized = normalizeMcpScopes(candidateScopes, []);
    scopes = expandMcpScopes(normalized);
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("user_ai_permission_settings")
    .upsert(
      {
        user_id: context.user.id,
        access_mode: accessMode,
        scopes
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("Plaivra AI permissions save failed:", error.message);
    return NextResponse.json({ error: "AI permissions could not be saved.", code: "ai_permissions_save_failed" }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
