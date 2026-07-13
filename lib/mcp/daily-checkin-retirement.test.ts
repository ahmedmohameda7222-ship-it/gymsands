import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_CATALOG_VERSION, RETIRED_DAILY_CHECKIN_TOOLS, mcpTools } from "@/lib/mcp/public-surface";

describe("Daily Check-in MCP retirement", () => {
  it("removes read and write operations from the active public catalog", () => {
    const names = new Set(mcpTools.map((tool) => tool.name));
    expect(names.has("get_daily_checkins")).toBe(false);
    expect(names.has("upsert_daily_checkin")).toBe(false);
    expect(RETIRED_DAILY_CHECKIN_TOOLS).toEqual(new Set(["get_daily_checkins", "upsert_daily_checkin"]));
    expect(MCP_CATALOG_VERSION).toBe("2026-07-2");
  });

  it("removes Daily Check-in from server permission maps and reviewed docs", () => {
    const server = readFileSync("lib/mcp/server.ts", "utf8");
    const manifest = readFileSync("docs/chatgpt-app/public-tool-catalog.json", "utf8");
    expect(server).not.toContain('"get_daily_checkins"');
    expect(server).not.toContain('"upsert_daily_checkin"');
    expect(JSON.parse(manifest).publicTools).not.toContain("upsert_daily_checkin");
  });

  it("preserves the historical database migration instead of deleting stored records", () => {
    const migration = readFileSync("supabase/migrations/20260702174951_chatgpt_execution_layer_foundation.sql", "utf8");
    expect(migration).toContain("user_daily_checkins");
    expect(migration).not.toMatch(/drop\s+table\s+(if\s+exists\s+)?(?:public\.)?user_daily_checkins/i);
  });
});
