import type { McpContext } from "@/lib/mcp/auth";
import { fail } from "@/lib/mcp/tool-helpers";
import { executeMcpTool as executeCatalogTool, type McpToolResult } from "@/lib/mcp/tool-executor-safe";
import {
  MCP_IDEMPOTENT_WRITE_TOOL_NAMES as catalogIdempotentWriteTools,
  mcpTools as catalogTools,
  type McpToolDefinition
} from "@/lib/mcp/tools";

export const MCP_CATALOG_VERSION = "2026-07-2";
export const RETIRED_DAILY_CHECKIN_TOOLS = new Set(["get_daily_checkins", "upsert_daily_checkin"]);
export const mcpTools: McpToolDefinition[] = catalogTools.filter((tool) => !RETIRED_DAILY_CHECKIN_TOOLS.has(tool.name));
export const MCP_IDEMPOTENT_WRITE_TOOL_NAMES = new Set(
  Array.from(catalogIdempotentWriteTools).filter((name) => !RETIRED_DAILY_CHECKIN_TOOLS.has(name))
);

export async function executeMcpTool(ctx: McpContext, toolName: string, input: unknown): Promise<McpToolResult> {
  if (RETIRED_DAILY_CHECKIN_TOOLS.has(toolName)) {
    return fail("tool_retired", "Daily Check-in is no longer an active Plaivra capability.");
  }
  return executeCatalogTool(ctx, toolName, input);
}

export type { McpToolDefinition, McpToolResult };
