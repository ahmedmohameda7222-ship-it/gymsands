import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/integrations/env";

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const [adminAudit, mcpAudit] = await Promise.all([
    context.supabase
      .from("admin_audit_logs")
      .select("id,admin_user_id,target_user_id,action,entity_table,entity_id,old_value,new_value,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    context.supabase
      .from("mcp_audit_logs")
      .select("id,user_id,connection_id,tool_name,status,error_message,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
  ]);

  return NextResponse.json({
    admin_logs: adminAudit.error ? [] : adminAudit.data ?? [],
    mcp_logs: mcpAudit.error ? [] : mcpAudit.data ?? [],
    warnings: [adminAudit.error?.message, mcpAudit.error?.message].filter(Boolean)
  });
}
