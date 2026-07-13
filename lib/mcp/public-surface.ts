import type { McpContext } from "@/lib/mcp/auth";
import { fail } from "@/lib/mcp/tool-helpers";
import { executeMcpTool as executeCatalogTool, type McpToolResult } from "@/lib/mcp/tool-executor-safe";
import {
  MCP_CATALOG_VERSION,
  MCP_IDEMPOTENT_WRITE_TOOL_NAMES,
  MCP_PUBLIC_TOOL_NAMES,
  mcpTools,
  type McpToolDefinition
} from "@/lib/mcp/tools";

export const RETIRED_DAILY_CHECKIN_TOOLS = new Set(["get_daily_checkins", "upsert_daily_checkin"]);

export async function executeMcpTool(ctx: McpContext, toolName: string, input: unknown): Promise<McpToolResult> {
  if (RETIRED_DAILY_CHECKIN_TOOLS.has(toolName)) {
    return fail("tool_retired", "Daily Check-in is no longer an active Plaivra capability.");
  }
  return executeCatalogTool(ctx, toolName, input);
}

export {
  MCP_CATALOG_VERSION,
  MCP_IDEMPOTENT_WRITE_TOOL_NAMES,
  MCP_PUBLIC_TOOL_NAMES,
  mcpTools
};
export type { McpToolDefinition, McpToolResult };
