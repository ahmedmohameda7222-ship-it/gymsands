import { describe, expect, it } from "vitest";
import type { McpContext } from "./auth";
import { MCP_SCOPES } from "./scopes";
import { minimizeMcpOutput, sanitizeMcpToolResult, validateMcpToolInput, validateMcpToolOutput } from "./safety";
import { canUseTool, requiredScopesForTool, toolListPayload } from "./server";
import { executeMcpTool } from "./tool-executor-safe";
import { mcpTools, type McpToolDefinition } from "./tools";

const validId = "11111111-1111-4111-8111-111111111111";

function tool(name: string): McpToolDefinition {
  const found = mcpTools.find((item) => item.name === name);
  if (!found) throw new Error(`Missing test tool: ${name}`);
  return found;
}

function context(scopes: string[]): McpContext {
  return {
    supabase: {} as McpContext["supabase"],
    userId: validId,
    connectionId: "22222222-2222-4222-8222-222222222222",
    scopes,
    profile: { id: validId, email: "member@example.test", full_name: "Member", role: "member" }
  };
}

describe("curated MCP tool inventory and annotations", () => {
  it("has a unique, fully annotated public inventory", () => {
    expect(mcpTools.length).toBeGreaterThanOrEqual(20);
    expect(mcpTools.length).toBeLessThanOrEqual(35);
    expect(new Set(mcpTools.map((item) => item.name)).size).toBe(mcpTools.length);

    for (const item of mcpTools) {
      expect(item.name).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.description.length).toBeGreaterThan(0);
      expect(typeof item.annotations.readOnlyHint).toBe("boolean");
      expect(typeof item.annotations.destructiveHint).toBe("boolean");
      expect(item.annotations.openWorldHint).toBe(false);
      expect(item.outputSchema).toMatchObject({ type: "object" });
      expect(requiredScopesForTool(item).length, item.name).toBeGreaterThan(0);
    }
  });

  it("contains no obsolete queue, broad safety-profile, admin, or alias tools", () => {
    const names = new Set(mcpTools.map((item) => item.name));
    for (const removed of [
      "get_ai_action_requests",
      "create_ai_action_request",
      "update_ai_action_request_status",
      "get_safety_profile",
      "update_safety_profile",
      "save_chatgpt_workout_plan",
      "generate_workout_plan",
      "replace_meal_plan_item"
    ]) {
      expect(names.has(removed), removed).toBe(false);
    }
    expect([...names].some((name) => name.startsWith("admin_") || name === "get_admin_user_summary")).toBe(false);
  });

  it("marks reads as read-only, writes as mutable, and high-risk tools as destructive", () => {
    for (const item of mcpTools) {
      expect(item.annotations.readOnlyHint).toBe(item.risk === "read");
      expect(item.annotations.destructiveHint).toBe(item.risk === "high");
    }
  });

  it("shows only nutrition reads in a nutrition-read catalog", () => {
    const payload = toolListPayload(context([MCP_SCOPES.nutritionRead]));
    const names = payload.tools.map((item) => item.name);
    expect(names).toContain("search_foods");
    expect(names).toContain("get_daily_execution_context");
    expect(names).not.toContain("add_food_log");
    expect(names).not.toContain("get_workout_adjustment_context");
  });

  it("fails closed for an unmapped future tool", () => {
    const unmapped: McpToolDefinition = {
      name: "future_unmapped_tool",
      title: "Future tool",
      description: "Not mapped yet.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      outputSchema: { type: "object", properties: {}, additionalProperties: false },
      risk: "read",
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }
    };
    expect(requiredScopesForTool(unmapped)).toEqual([]);
    expect(canUseTool(context([MCP_SCOPES.fullAccess]), unmapped)).toBe(false);
  });
});

describe("MCP runtime input validation", () => {
  it("rejects invalid enums, UUIDs, dates, ranges, and overlong strings", () => {
    expect(validateMcpToolInput(tool("add_food_log"), { meal_type: "Brunch", items: [] }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_food_log"), { meal_type: "Breakfast", items: [] }).success).toBe(false);
    expect(validateMcpToolInput(tool("get_workout_plan_by_id"), { plan_id: "not-a-uuid" }).success).toBe(false);
    expect(validateMcpToolInput(tool("get_meal_plan_for_date"), { date: "2026-02-30" }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 100_000 }).success).toBe(false);
    expect(validateMcpToolInput(tool("create_custom_food"), { food_name: "x".repeat(301), serving_size: "1", calories: 1, protein_g: 1, carbs_g: 1, fat_g: 1 }).success).toBe(false);
  });

  it("rejects caller identity overrides and undeclared fields", () => {
    const override = validateMcpToolInput(tool("add_water_log"), { amount_ml: 250, user_id: validId });
    expect(override.success).toBe(false);
    if (!override.success) expect(override.errors.join(" ")).toContain("server-controlled");
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 250, table: "profiles" }).success).toBe(false);
  });

  it("requires confirm:true for every destructive tool", () => {
    const ids: Record<string, string> = {
      delete_food_log: "food_log_id",
      delete_meal_plan_item: "meal_plan_item_id",
      delete_workout_plan: "plan_id"
    };

    for (const item of mcpTools.filter((candidate) => candidate.annotations.destructiveHint)) {
      const idField = ids[item.name];
      expect(idField, item.name).toBeDefined();
      expect(validateMcpToolInput(item, { [idField]: validId }).success).toBe(false);
      expect(validateMcpToolInput(item, { [idField]: validId, confirm: true }).success).toBe(true);
    }
  });

  it("requires replay keys for create/log/composite tools and versions for updates", () => {
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 250 }).success).toBe(false);
    expect(validateMcpToolInput(tool("add_water_log"), { amount_ml: 250, idempotency_key: "request-key-0001" }).success).toBe(true);
    expect(validateMcpToolInput(tool("update_food_log"), { food_log_id: validId, calories: 100 }).success).toBe(false);
    expect(validateMcpToolInput(tool("update_food_log"), { food_log_id: validId, expected_updated_at: "2026-07-10T20:00:00Z", calories: 100 }).success).toBe(true);
    expect(tool("activate_workout_plan").annotations.destructiveHint).toBe(false);
  });

  it("keeps a direct executor confirmation guard on meal-plan deletion", async () => {
    const result = await executeMcpTool(
      context([MCP_SCOPES.mealPlansWrite]),
      "delete_meal_plan_item",
      { meal_plan_item_id: validId }
    );
    expect(result.structuredContent.requires_confirmation).toBe(true);
  });
});

describe("MCP output minimization", () => {
  it("validates success outputSchema and stable error envelopes", () => {
    const definition = tool("add_water_log");
    expect(validateMcpToolOutput(definition, {
      structuredContent: { ok: true, log: { id: validId }, logged_ml: 250 },
      content: [{ type: "text", text: "saved" }]
    }).success).toBe(true);
    expect(validateMcpToolOutput(definition, {
      structuredContent: { ok: true, logged_ml: 250 },
      content: [{ type: "text", text: "missing log" }]
    }).success).toBe(false);
    expect(validateMcpToolOutput(definition, {
      isError: true,
      structuredContent: { ok: false, code: "version_conflict", message: "Fetch the record again." },
      content: [{ type: "text", text: "Fetch the record again." }]
    }).success).toBe(true);
  });
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

  it("projects database rows to the reviewed output schema before validation", () => {
    const definition = tool("add_water_log");
    const result = sanitizeMcpToolResult({
      structuredContent: {
        ok: true,
        log: { id: validId, amount_ml: 250, updated_at: "2026-07-11T10:00:00Z", future_private_column: "must not ship" },
        logged_ml: 250,
        internal_trace: "must not ship"
      },
      content: [{ type: "text", text: "saved" }]
    }, definition.outputSchema);
    expect(result.structuredContent).not.toHaveProperty("internal_trace");
    expect(result.structuredContent.log).not.toHaveProperty("future_private_column");
    expect(result.structuredContent.log).toHaveProperty("updated_at");
    expect(validateMcpToolOutput(definition, result).success).toBe(true);
  });
});
