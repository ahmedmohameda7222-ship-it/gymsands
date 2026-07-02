import { describe, expect, it } from "vitest";
import type { McpContext } from "./auth";
import { MCP_SCOPES } from "./scopes";
import { minimizeMcpOutput, sanitizeMcpToolResult, validateMcpToolInput } from "./safety";
import { canUseTool, requiredScopesForTool, toolListPayload } from "./server";
import { executeMcpTool } from "./tool-executor-safe";
import { mcpTools, type McpToolDefinition } from "./tools";

const validId = "11111111-1111-4111-8111-111111111111";

function tool(name: string): McpToolDefinition {
  const found = mcpTools.find((item) => item.name === name);
  if (!found) throw new Error(`Missing test tool: ${name}`);
  return found;
}

function context(scopes: string[], role: "member" | "admin" = "member"): McpContext {
  return {
    supabase: {} as McpContext["supabase"],
    userId: validId,
    connectionId: "22222222-2222-4222-8222-222222222222",
    scopes,
    profile: { id: validId, email: "member@example.test", full_name: "Member", role }
  };
}

describe("Phase 3 MCP tool inventory and annotations", () => {
  it("has a unique, fully annotated 97-tool inventory", () => {
    expect(mcpTools).toHaveLength(97);
    expect(new Set(mcpTools.map((item) => item.name)).size).toBe(mcpTools.length);
    for (const item of mcpTools) {
      expect(item.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(typeof item.annotations.readOnlyHint).toBe("boolean");
      expect(typeof item.annotations.destructiveHint).toBe("boolean");
      expect(item.annotations.openWorldHint).toBe(false);
      expect(requiredScopesForTool(item).length).toBeGreaterThan(0);
    }
  });

  it("marks reads as read-only, writes as mutable, and high-risk tools as destructive", () => {
    for (const item of mcpTools) {
      if (item.risk === "read") expect(item.annotations.readOnlyHint).toBe(true);
      if (["low", "medium", "high"].includes(item.risk)) expect(item.annotations.readOnlyHint).toBe(false);
      expect(item.annotations.destructiveHint).toBe(item.risk === "high");
    }
  });

  it("hides admin and unrelated tools from a normal nutrition-only catalog", () => {
    const payload = toolListPayload(context([MCP_SCOPES.nutritionRead]));
    const names = payload.tools.map((item) => item.name);
    expect(names).toContain("search_foods");
    expect(names).not.toContain("add_food_log");
    expect(names).not.toContain("get_workout_plans");
    expect(names.some((name) => name.startsWith("admin_") || name === "get_admin_user_summary")).toBe(false);
  });

  it("fails closed for an unmapped future tool", () => {
    const unmapped: McpToolDefinition = {
      name: "future_unmapped_tool",
      title: "Future tool",
      description: "Not mapped yet.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      risk: "read",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    };
    expect(requiredScopesForTool(unmapped)).toEqual([]);
    expect(canUseTool(context([MCP_SCOPES.fullAccess]), unmapped)).toBe(false);
  });
});

describe("Phase 3 MCP runtime input validation", () => {
  it("rejects invalid enums, UUIDs, dates, ranges, and overlong strings", () => {
    expect(validateMcpToolInput(tool("add_food_log"), { meal_type: "Brunch", items: [] }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_food_log"), { meal_type: "Breakfast", items: [] }).success).toBe(false);
    expect(validateMcpToolInput(tool("get_workout_plan_by_id"), { plan_id: "not-a-uuid" }).success).toBe(false);
    expect(validateMcpToolInput(tool("get_meal_plan_for_date"), { date: "2026-02-30" }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 100_000 }).success).toBe(false);
    expect(validateMcpToolInput(tool("create_kitchen"), { name: "x".repeat(301) }).success).toBe(false);
  });

  it("rejects caller identity overrides and undeclared fields", () => {
    const override = validateMcpToolInput(tool("add_water_log"), { amount_ml: 250, user_id: validId });
    expect(override.success).toBe(false);
    if (!override.success) expect(override.errors.join(" ")).toContain("server-controlled");
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 250, table: "profiles" }).success).toBe(false);
  });

  it("requires confirm:true for every destructive tool", () => {
    const ids: Record<string, string> = {
      delete_kitchen: "kitchen_id",
      delete_food_log: "food_log_id",
      delete_meal_plan_item: "meal_plan_item_id",
      delete_water_log: "water_log_id",
      delete_workout_plan_day: "plan_day_id",
      delete_plan_exercise: "plan_exercise_id",
      activate_workout_plan: "plan_id",
      delete_workout_plan: "plan_id"
    };
    for (const item of mcpTools.filter((candidate) => candidate.annotations.destructiveHint)) {
      const idField = ids[item.name];
      expect(idField).toBeDefined();
      expect(validateMcpToolInput(item, { [idField]: validId }).success).toBe(false);
      expect(validateMcpToolInput(item, { [idField]: validId, confirm: true }).success).toBe(true);
    }
  });

  it("keeps a direct executor confirmation guard on meal-plan deletion", async () => {
    const result = await executeMcpTool(context([MCP_SCOPES.mealPlansWrite]), "delete_meal_plan_item", { meal_plan_item_id: validId });
    expect(result.structuredContent.requires_confirmation).toBe(true);
  });
});

describe("Phase 3 MCP output minimization", () => {
  it("removes ownership, connection, token, secret, and raw note fields recursively", () => {
    const minimized = minimizeMcpOutput({
      user_id: validId,
      connection_id: validId,
      notes: "private body note",
      nested: { token: "plaivra_mcp_at_supersecret", secret: "hidden", id: validId, name: "Squat" }
    });
    expect(minimized).toEqual({ nested: { id: validId, name: "Squat" } });
  });

  it("redacts token-like values from structured and text output", () => {
    const rawToken = "plaivra_mcp_at_supersecret";
    const result = sanitizeMcpToolResult({
      structuredContent: { ok: true, message: rawToken },
      content: [{ type: "text", text: JSON.stringify({ ok: true, message: rawToken }) }]
    });
    expect(JSON.stringify(result)).not.toContain(rawToken);
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });
});
