import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import {
  executeMcpTool,
  MCP_CATALOG_VERSION,
  MCP_IDEMPOTENT_WRITE_TOOL_NAMES,
  MCP_PUBLIC_TOOL_NAMES,
  RETIRED_DAILY_CHECKIN_TOOLS,
  mcpTools
} from "@/lib/mcp/public-surface";
import { executeMcpTool as executeUnderlyingTool } from "@/lib/mcp/tool-executor-safe";
import { toolListPayload } from "@/lib/mcp/server";

const context: McpContext = {
  supabase: {} as McpContext["supabase"],
  userId: "11111111-1111-4111-8111-111111111111",
  connectionId: "22222222-2222-4222-8222-222222222222",
  scopes: [MCP_SCOPES.fullAccess],
  profile: { id: "11111111-1111-4111-8111-111111111111", email: "member@example.test", full_name: "Member", role: "member" }
};

const retiredNames = ["get_daily_checkins", "upsert_daily_checkin"] as const;

describe("Daily Check-in MCP retirement", () => {
  it("removes both operations from every active catalog collection", () => {
    const names = new Set(mcpTools.map((tool) => tool.name));
    for (const name of retiredNames) {
      expect(names.has(name)).toBe(false);
      expect(MCP_PUBLIC_TOOL_NAMES).not.toContain(name);
      expect(MCP_IDEMPOTENT_WRITE_TOOL_NAMES.has(name)).toBe(false);
    }
    expect(RETIRED_DAILY_CHECKIN_TOOLS).toEqual(new Set(retiredNames));
    expect(MCP_CATALOG_VERSION).toBe("2026-07-2");
  });

  it("does not advertise either operation through tools/list", () => {
    const advertised = toolListPayload(context).tools.map((tool) => tool.name);
    for (const name of retiredNames) expect(advertised).not.toContain(name);
  });

  it("rejects retired calls at the public tombstone boundary", async () => {
    for (const name of retiredNames) {
      const result = await executeMcpTool(context, name, {});
      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({ code: "tool_retired" });
    }
  });

  it("cannot dispatch either operation through the underlying executor", async () => {
    for (const name of retiredNames) {
      const result = await executeUnderlyingTool(context, name, {});
      expect(result.isError).toBe(true);
      expect(result.structuredContent.code).not.toBeUndefined();
    }
  });

  it("keeps reviewed documentation aligned with the active catalog", () => {
    const manifest = JSON.parse(readFileSync("docs/chatgpt-app/public-tool-catalog.json", "utf8")) as { publicTools: string[] };
    expect(manifest.publicTools).toEqual([...MCP_PUBLIC_TOOL_NAMES]);
    for (const name of retiredNames) expect(manifest.publicTools).not.toContain(name);
  });

  it("preserves the historical database schema without a destructive migration", () => {
    const migration = readFileSync("supabase/migrations/20260702174951_chatgpt_execution_layer_foundation.sql", "utf8");
    expect(migration).toContain("user_daily_checkins");
    expect(migration).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?(?:public\.)?user_daily_checkins/i);
  });
});
