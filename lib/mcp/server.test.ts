import { describe, expect, it } from "vitest";
import type { McpContext } from "./auth";
import { MCP_SCOPES } from "./scopes";
import {
  canUseTool,
  handleMcpPost,
  mcpAuthenticationErrorResult,
  oauthSecurityScopesForTool,
  requiredScopesForTool,
  toolListPayload
} from "./server";
import { mcpTools } from "./tools";

function mockContext(scopes: string[]): McpContext {
  return {
    supabase: {} as McpContext["supabase"],
    userId: "test-user",
    connectionId: "test-connection",
    scopes,
    profile: { id: "test-user", email: "test@test.com", full_name: "Test", role: "member" }
  };
}

function tool(name: string) {
  const definition = mcpTools.find((item) => item.name === name);
  if (!definition) throw new Error(`Missing test tool: ${name}`);
  return definition;
}

describe("public MCP catalog", () => {
  it("contains only explicitly supported public tools", () => {
    const names = new Set(mcpTools.map((item) => item.name));

    expect(names.has("create_custom_workout_plan")).toBe(true);
    expect(names.has("create_week_meal_plan")).toBe(true);
    expect(names.has("get_nutrition_preference_profile")).toBe(true);

    expect(names.has("get_ai_action_requests")).toBe(false);
    expect(names.has("create_ai_action_request")).toBe(false);
    expect(names.has("update_ai_action_request_status")).toBe(false);
    expect(names.has("get_safety_profile")).toBe(false);
    expect(names.has("update_safety_profile")).toBe(false);
    expect(names.has("save_chatgpt_workout_plan")).toBe(false);
    expect(names.has("generate_workout_plan")).toBe(false);
    expect(names.has("replace_meal_plan_item")).toBe(false);
    expect([...names].some((name) => name.startsWith("admin_"))).toBe(false);
  });

  it("maps every public tool to at least one non-admin scope", () => {
    for (const definition of mcpTools) {
      const scopes = requiredScopesForTool(definition);
      expect(scopes.length, definition.name).toBeGreaterThan(0);
      expect(scopes, definition.name).not.toContain(MCP_SCOPES.admin);
    }
  });

  it("declares accurate read-only annotations", () => {
    for (const definition of mcpTools) {
      expect(definition.annotations.readOnlyHint).toBe(definition.risk === "read");
      expect(definition.annotations.destructiveHint).toBe(definition.risk === "high");
      expect(definition.annotations.openWorldHint).toBe(false);
    }
  });
});

describe("requiredScopesForTool", () => {
  it("maps core profile tools", () => {
    expect(requiredScopesForTool(tool("get_user_profile"))).toEqual([MCP_SCOPES.profileRead]);
    expect(requiredScopesForTool(tool("update_user_profile"))).toEqual([MCP_SCOPES.profileWrite]);
  });

  it("maps nutrition preference tools to nutrition rather than broad profile access", () => {
    expect(requiredScopesForTool(tool("get_nutrition_preference_profile"))).toEqual([MCP_SCOPES.nutritionRead]);
    expect(requiredScopesForTool(tool("update_nutrition_preference_profile"))).toEqual([MCP_SCOPES.nutritionWrite]);
  });

  it("maps each main write domain", () => {
    expect(requiredScopesForTool(tool("add_food_log"))).toEqual([MCP_SCOPES.nutritionWrite]);
    expect(requiredScopesForTool(tool("create_meal_plan_item"))).toEqual([MCP_SCOPES.mealPlansWrite]);
    expect(requiredScopesForTool(tool("add_water_log"))).toEqual([MCP_SCOPES.hydrationWrite]);
    expect(requiredScopesForTool(tool("create_custom_workout_plan"))).toEqual([MCP_SCOPES.workoutsWrite]);
    expect(requiredScopesForTool(tool("add_weight_entry"))).toEqual([MCP_SCOPES.progressWrite]);
    expect(requiredScopesForTool(tool("create_habit"))).toEqual([MCP_SCOPES.wellnessWrite]);
    expect(requiredScopesForTool(tool("update_calorie_target"))).toEqual([MCP_SCOPES.settingsWrite]);
  });

  it("requires all three read scopes for the cross-domain progress summary", () => {
    const summary = tool("get_progress_summary");
    expect(requiredScopesForTool(summary)).toEqual([
      MCP_SCOPES.progressRead,
      MCP_SCOPES.workoutsRead,
      MCP_SCOPES.nutritionRead
    ]);

    expect(canUseTool(mockContext([MCP_SCOPES.progressRead]), summary)).toBe(false);
    expect(canUseTool(mockContext([
      MCP_SCOPES.progressRead,
      MCP_SCOPES.workoutsRead,
      MCP_SCOPES.nutritionRead
    ]), summary)).toBe(true);
  });

  it("keeps the broad today summary behind explicit full access", () => {
    const summary = tool("get_today_summary");
    expect(canUseTool(mockContext([MCP_SCOPES.profileRead]), summary)).toBe(false);
    expect(canUseTool(mockContext([MCP_SCOPES.fullAccess]), summary)).toBe(true);
  });
});

describe("canUseTool", () => {
  it("allows all curated tools with explicit full access", () => {
    const context = mockContext([MCP_SCOPES.fullAccess]);
    for (const definition of mcpTools) {
      expect(canUseTool(context, definition), definition.name).toBe(true);
    }
  });

  it("fails closed when no scopes are granted", () => {
    const context = mockContext([]);
    for (const definition of mcpTools) {
      expect(canUseTool(context, definition), definition.name).toBe(false);
    }
  });

  it("does not treat an internal admin scope as public product access", () => {
    const context = mockContext([MCP_SCOPES.admin]);
    for (const definition of mcpTools) {
      expect(canUseTool(context, definition), definition.name).toBe(false);
    }
  });

  it("keeps sections isolated", () => {
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionWrite]), tool("add_food_log"))).toBe(true);
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionWrite]), tool("search_foods"))).toBe(true);
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionWrite]), tool("create_custom_workout_plan"))).toBe(false);
    expect(canUseTool(mockContext([MCP_SCOPES.workoutsWrite]), tool("add_food_log"))).toBe(false);
    expect(canUseTool(mockContext([MCP_SCOPES.mealPlansWrite]), tool("add_weight_entry"))).toBe(false);
  });

  it("does not let a read scope perform a write", () => {
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionRead]), tool("add_food_log"))).toBe(false);
    expect(canUseTool(mockContext([MCP_SCOPES.workoutsRead]), tool("create_custom_workout_plan"))).toBe(false);
  });

  it("lets a section write scope use read tools from the same section only", () => {
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionWrite]), tool("get_today_calories"))).toBe(true);
    expect(canUseTool(mockContext([MCP_SCOPES.nutritionWrite]), tool("get_workout_plans"))).toBe(false);
  });
});

describe("OAuth tool metadata and authentication challenges", () => {
  it("declares one canonical OAuth security scheme for every visible tool", () => {
    const payload = toolListPayload(mockContext([MCP_SCOPES.fullAccess]));
    expect(payload.tools.length).toBe(mcpTools.length);

    for (const item of payload.tools) {
      const definition = tool(item.name);
      expect(item.securitySchemes).toEqual([
        { type: "oauth2", scopes: oauthSecurityScopesForTool(definition) }
      ]);
      expect(item.securitySchemes[0].scopes).not.toContain(MCP_SCOPES.admin);
      expect(item.securitySchemes[0].scopes).not.toContain(MCP_SCOPES.all);
    }
  });

  it("keeps the unauthenticated tools/list HTTP discovery challenge", async () => {
    const request = new Request("https://plaivra.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
    });

    const response = await handleMcpPost(request);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://plaivra.com/.well-known/oauth-protected-resource"'
    );
  });

  it("returns an MCP authentication challenge for an unauthenticated tool call", async () => {
    const request = new Request("https://plaivra.com/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "get_user_profile", arguments: {} }
      })
    });

    const response = await handleMcpPost(request);
    expect(response.status).toBe(200);
    const json = await response.json() as {
      result: { isError: boolean; _meta: { "mcp/www_authenticate": string[] } };
    };

    expect(json.result.isError).toBe(true);
    const challenge = json.result._meta["mcp/www_authenticate"][0];
    expect(challenge).toContain('error="invalid_token"');
    expect(challenge).toContain('resource_metadata="https://plaivra.com/.well-known/oauth-protected-resource"');
    expect(challenge).toContain(`scope="${MCP_SCOPES.profileRead}"`);
  });

  it("removes legacy blanket scopes from public challenges", () => {
    const result = mcpAuthenticationErrorResult(
      new Request("https://plaivra.com/api/mcp"),
      "insufficient_scope",
      "Additional Plaivra permission is required.",
      [MCP_SCOPES.fullAccess, MCP_SCOPES.all]
    );

    const challenge = result._meta?.["mcp/www_authenticate"]?.[0] ?? "";
    expect(challenge).toContain(MCP_SCOPES.fullAccess);
    expect(challenge).not.toContain(MCP_SCOPES.all);
  });
});
