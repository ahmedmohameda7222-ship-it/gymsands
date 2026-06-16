import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { requireUser } from "@/lib/integrations/env";

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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ settings: data ?? null });
}

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const accessMode = body.access_mode === "custom" ? "custom" : "full";
  const rawScopes = Array.isArray(body.scopes) ? body.scopes : [];
  const scopes = rawScopes.map((s) => String(s).trim()).filter(Boolean);

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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ settings: data });
}
