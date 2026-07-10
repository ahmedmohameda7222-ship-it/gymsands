import type { SupabaseClient } from "@supabase/supabase-js";
import { mcpTools } from "@/lib/mcp/tools";

type AuditRow = {
  id: string;
  tool_name: string;
  output_summary: unknown;
  status: "success" | "error";
  created_at: string;
};

export type PublicMcpActivity = {
  id: string;
  timestamp: string;
  action: string;
  status: "allowed" | "denied" | "failed";
  category: "read" | "write" | "destructive";
  summary: string;
  connectionLabel: "ChatGPT";
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function categoryForTool(toolName: string): PublicMcpActivity["category"] {
  if (toolName === "connection_authorization") return "read";
  const risk = mcpTools.find((tool) => tool.name === toolName)?.risk;
  if (risk === "high") return "destructive";
  if (risk === "read") return "read";
  return "write";
}

function safeActionName(toolName: string) {
  if (toolName === "connection_authorization") return "Connection authorization";
  const knownTool = mcpTools.find((tool) => tool.name === toolName);
  return knownTool?.title ?? "Plaivra action";
}

function safeSummary(status: PublicMcpActivity["status"], reasonCode: unknown) {
  if (status === "allowed") return "ChatGPT completed this action within your saved permissions.";
  if (reasonCode === "missing_scope" || reasonCode === "missing_permissions" || reasonCode === "stale_permissions") {
    return "Plaivra denied this action because the saved AI permissions did not allow it.";
  }
  if (reasonCode === "expired_token" || reasonCode === "revoked_connection") {
    return "Plaivra denied this request because the ChatGPT connection was expired or revoked.";
  }
  if (reasonCode === "invalid_resource") return "Plaivra denied this request because it targeted an invalid resource.";
  if (reasonCode === "confirmation_required") return "Plaivra stopped this action because explicit confirmation was missing.";
  if (reasonCode === "invalid_input") return "Plaivra rejected this action because its input was invalid.";
  return status === "denied" ? "Plaivra denied this action safely." : "The action failed without exposing private details.";
}

export function toPublicMcpActivity(row: AuditRow): PublicMcpActivity {
  const output = record(row.output_summary);
  const status: PublicMcpActivity["status"] = output.denied === true
    ? "denied"
    : row.status === "success"
      ? "allowed"
      : "failed";
  return {
    id: row.id,
    timestamp: row.created_at,
    action: safeActionName(row.tool_name),
    status,
    category: categoryForTool(row.tool_name),
    summary: safeSummary(status, output.reason_code),
    connectionLabel: "ChatGPT"
  };
}

export async function getMcpActivityForUser(supabase: SupabaseClient, userId: string, limit = 25) {
  const safeLimit = Math.min(Math.max(limit, 1), 50);
  const { data, error } = await supabase
    .from("mcp_audit_logs")
    .select("id,tool_name,output_summary,status,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as AuditRow[]).map(toPublicMcpActivity);
}
