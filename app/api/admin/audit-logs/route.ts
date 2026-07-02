import { NextResponse } from "next/server";
import { developmentDatabaseDetails, friendlyDatabaseWarning } from "@/lib/admin/migration-safety";
import { requireAdmin } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin-audit-logs", 30, 60_000);
  if (limited) return limited;

  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;

  const [adminRows, connectorRows] = await Promise.all([
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

  const warnings = [
    friendlyDatabaseWarning("Admin change log", adminRows.error, "migration 018"),
    friendlyDatabaseWarning("Connector call log", connectorRows.error)
  ].filter((warning): warning is string => Boolean(warning));

  return NextResponse.json({
    admin_logs: adminRows.error ? [] : adminRows.data ?? [],
    mcp_logs: connectorRows.error ? [] : connectorRows.data ?? [],
    warnings,
    debug_warnings: developmentDatabaseDetails([adminRows.error, connectorRows.error].filter(Boolean))
  });
}
