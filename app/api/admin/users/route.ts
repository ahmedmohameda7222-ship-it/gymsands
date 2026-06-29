import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/integrations/env";
import { createSupabaseAdminClient } from "@/lib/server/supabase-admin";
import { isUuid } from "@/lib/utils";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id,email,full_name,role,created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const logResult = await supabase.from("admin_data_access_logs").insert({
    admin_user_id: context.user.id,
    target_user_id: null,
    target_table: "profiles",
    target_record_id: null,
    action: "list",
    access_reason: "Admin user-management page"
  });
  if (logResult.error) console.warn("Could not record admin profile access:", logResult.error.message);

  return NextResponse.json({ users: data ?? [] });
}

export async function POST(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  let body: { user_id?: string; role?: "member" | "admin" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (!isUuid(body.user_id) || (body.role !== "member" && body.role !== "admin")) {
    return NextResponse.json({ error: "A valid user_id and role are required." }, { status: 400 });
  }
  if (body.user_id === context.user.id) {
    return NextResponse.json({ error: "Admins cannot change their own role." }, { status: 403 });
  }

  const supabase = createSupabaseAdminClient();
  const existing = await supabase.from("profiles").select("role").eq("id", body.user_id).maybeSingle();
  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  if (!existing.data) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const update = await supabase.from("profiles").update({ role: body.role }).eq("id", body.user_id);
  if (update.error) return NextResponse.json({ error: update.error.message }, { status: 400 });

  const audit = await supabase.from("admin_audit_logs").insert({
    admin_user_id: context.user.id,
    target_user_id: body.user_id,
    action: "profile.role.update",
    entity_table: "profiles",
    entity_id: body.user_id,
    old_value: { role: existing.data.role },
    new_value: { role: body.role }
  });
  if (audit.error) console.warn("Could not record admin role update:", audit.error.message);

  return NextResponse.json({ ok: true });
}
