import { describe, it, expect } from "vitest";
import {
  requiredScopesForTool,
  canUseTool,
  handleMcpPost,
  mcpAuthenticationErrorResult,
  oauthSecurityScopesForTool,
  toolListPayload
} from "./server";
import { mcpTools } from "./tools";
import { MCP_SCOPES } from "./scopes";
import type { McpContext } from "./auth";

function mockContext(scopes: string[], role: "member" | "admin" = "member"): McpContext {
  return {
    supabase: {} as McpContext["supabase"],
    userId: "test-user",
    connectionId: "test-connection",
    scopes,
    profile: { id: "test-user", email: "test@test.com", full_name: "Test", role }
  };
}

describe("requiredScopesForTool", () => {
  it("returns admin scope for admin tools", () => {
    const adminTools = mcpTools.filter((t) => t.risk === "admin");
    for (const tool of adminTools) {
      expect(requiredScopesForTool(tool)).toContain(MCP_SCOPES.admin);
    }
  });

  it("returns read scopes for read tools", () => {
    const readTools = mcpTools.filter((t) => t.risk === "read" && !t.name.startsWith("admin"));
    for (const tool of readTools) {
      const scopes = requiredScopesForTool(tool);
      expect(scopes.length).toBeGreaterThan(0);
      expect(scopes.every((s) => s.endsWith(".read") || s === MCP_SCOPES.fullAccess || s === MCP_SCOPES.all)).toBe(true);
    }
  });

  it("maps nutrition tools to nutrition scope", () => {
    const nutritionTool = mcpTools.find((t) => t.name === "add_food_log");
    expect(nutritionTool).toBeDefined();
    expect(requiredScopesForTool(nutritionTool!)).toContain(MCP_SCOPES.nutritionWrite);
  });

  it("maps workout tools to workouts scope", () => {
    const workoutTool = mcpTools.find((t) => t.name === "create_custom_workout_plan");
    expect(workoutTool).toBeDefined();
    expect(requiredScopesForTool(workoutTool!)).toContain(MCP_SCOPES.workoutsWrite);
  });

  it("maps meal plan tools to meal_plans scope", () => {
    const mealPlanTool = mcpTools.find((t) => t.name === "create_meal_plan_item");
    expect(mealPlanTool).toBeDefined();
    expect(requiredScopesForTool(mealPlanTool!)).toContain(MCP_SCOPES.mealPlansWrite);
  });

  it("maps hydration tools to hydration scope", () => {
    const hydrationTool = mcpTools.find((t) => t.name === "add_water_log");
    expect(hydrationTool).toBeDefined();
    expect(requiredScopesForTool(hydrationTool!)).toContain(MCP_SCOPES.hydrationWrite);
  });

  it("maps progress tools to progress scope", () => {
    const progressTool = mcpTools.find((t) => t.name === "add_weight_entry");
    expect(progressTool).toBeDefined();
    expect(requiredScopesForTool(progressTool!)).toContain(MCP_SCOPES.progressWrite);
  });

  it("requires progress, workout, and nutrition reads for the cross-category progress summary", () => {
    const summary = mcpTools.find((t) => t.name === "get_progress_summary")!;
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

  it("maps wellness tools to wellness scope", () => {
    const wellnessTool = mcpTools.find((t) => t.name === "create_habit");
    expect(wellnessTool).toBeDefined();
    expect(requiredScopesForTool(wellnessTool!)).toContain(MCP_SCOPES.wellnessWrite);
  });

  it("maps profile tools to profile scope", () => {
    const profileTool = mcpTools.find((t) => t.name === "update_user_profile");
    expect(profileTool).toBeDefined();
    expect(requiredScopesForTool(profileTool!)).toContain(MCP_SCOPES.profileWrite);
  });
});

describe("canUseTool - full access", () => {
  it("allows all normal user tools with full_access", () => {
    const ctx = mockContext([MCP_SCOPES.fullAccess]);
    const normalTools = mcpTools.filter((t) => t.risk !== "admin");
    for (const tool of normalTools) {
      expect(canUseTool(ctx, tool)).toBe(true);
    }
  });
});

describe("canUseTool - section isolation", () => {
  it("nutrition-only token cannot access workout tools", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionWrite]);
    const workoutTool = mcpTools.find((t) => t.name === "create_custom_workout_plan")!;
    expect(canUseTool(ctx, workoutTool)).toBe(false);
  });

  it("workout-only token cannot access nutrition tools", () => {
    const ctx = mockContext([MCP_SCOPES.workoutsWrite]);
    const nutritionTool = mcpTools.find((t) => t.name === "add_food_log")!;
    expect(canUseTool(ctx, nutritionTool)).toBe(false);
  });

  it("meal-plan-only token cannot access progress tools", () => {
    const ctx = mockContext([MCP_SCOPES.mealPlansWrite]);
    const progressTool = mcpTools.find((t) => t.name === "add_weight_entry")!;
    expect(canUseTool(ctx, progressTool)).toBe(false);
  });
});

describe("canUseTool - read/write rules", () => {
  it("read-only token cannot write", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionRead]);
    const writeTool = mcpTools.find((t) => t.name === "add_food_log")!;
    expect(canUseTool(ctx, writeTool)).toBe(false);
  });

  it("write token implies read within same section", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionWrite]);
    const readTool = mcpTools.find((t) => t.name === "search_foods")!;
    expect(canUseTool(ctx, readTool)).toBe(true);
  });
});

describe("canUseTool - read tool section isolation", () => {
  it("nutrition.write can access nutrition read tools", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionWrite]);
    const searchFoods = mcpTools.find((t) => t.name === "search_foods")!;
    const getFoodLogs = mcpTools.find((t) => t.name === "get_food_logs_by_date")!;
    expect(canUseTool(ctx, searchFoods)).toBe(true);
    expect(canUseTool(ctx, getFoodLogs)).toBe(true);
  });

  it("nutrition.write cannot access workout read tools", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionWrite]);
    const getWorkoutPlans = mcpTools.find((t) => t.name === "get_workout_plans")!;
    const getTodayWorkout = mcpTools.find((t) => t.name === "get_today_workout")!;
    expect(canUseTool(ctx, getWorkoutPlans)).toBe(false);
    expect(canUseTool(ctx, getTodayWorkout)).toBe(false);
  });

  it("nutrition.write cannot access progress read tools", () => {
    const ctx = mockContext([MCP_SCOPES.nutritionWrite]);
    const getProgressSummary = mcpTools.find((t) => t.name === "get_progress_summary")!;
    const getPersonalRecords = mcpTools.find((t) => t.name === "get_personal_records")!;
    expect(canUseTool(ctx, getProgressSummary)).toBe(false);
    expect(canUseTool(ctx, getPersonalRecords)).toBe(false);
  });

  it("workouts.read cannot access nutrition read tools", () => {
    const ctx = mockContext([MCP_SCOPES.workoutsRead]);
    const searchFoods = mcpTools.find((t) => t.name === "search_foods")!;
    const getFoodLogs = mcpTools.find((t) => t.name === "get_food_logs_by_date")!;
    expect(canUseTool(ctx, searchFoods)).toBe(false);
    expect(canUseTool(ctx, getFoodLogs)).toBe(false);
  });

  it("profile.read cannot access get_today_summary", () => {
    const ctx = mockContext([MCP_SCOPES.profileRead]);
    const getTodaySummary = mcpTools.find((t) => t.name === "get_today_summary")!;
    expect(canUseTool(ctx, getTodaySummary)).toBe(false);
  });

  it("full_access can access all normal read and write tools", () => {
    const ctx = mockContext([MCP_SCOPES.fullAccess]);
    const normalTools = mcpTools.filter((t) => t.risk !== "admin");
    for (const tool of normalTools) {
      expect(canUseTool(ctx, tool)).toBe(true);
    }
  });

  it("admin tools remain blocked for normal users even with plaivra.admin", () => {
    const ctx = mockContext([MCP_SCOPES.admin, MCP_SCOPES.fullAccess], "member");
    const adminTools = mcpTools.filter((t) => t.risk === "admin");
    for (const tool of adminTools) {
      expect(canUseTool(ctx, tool)).toBe(false);
    }
  });
});

describe("canUseTool - admin protection", () => {
  it("admin tools are not available to normal users even with admin scope", () => {
    const ctx = mockContext([MCP_SCOPES.admin, MCP_SCOPES.fullAccess], "member");
    const adminTools = mcpTools.filter((t) => t.risk === "admin");
    for (const tool of adminTools) {
      expect(canUseTool(ctx, tool)).toBe(false);
    }
  });

  it("admin tools are available to admins with admin scope", () => {
    const ctx = mockContext([MCP_SCOPES.admin, MCP_SCOPES.fullAccess], "admin");
    const adminTools = mcpTools.filter((t) => t.risk === "admin");
    for (const tool of adminTools) {
      expect(canUseTool(ctx, tool)).toBe(true);
    }
  });
});

describe("canUseTool - safe defaults", () => {
  it("empty scopes deny all tools", () => {
    const ctx = mockContext([]);
    for (const tool of mcpTools) {
      expect(canUseTool(ctx, tool)).toBe(false);
    }
  });

  it("only admin scope denies normal tools", () => {
    const ctx = mockContext([MCP_SCOPES.admin]);
    const normalTools = mcpTools.filter((t) => t.risk !== "admin");
    for (const tool of normalTools) {
      expect(canUseTool(ctx, tool)).toBe(false);
    }
  });
});

describe("OAuth tool metadata and challenges", () => {
  it("declares one OAuth security scheme with the canonical required scopes for every visible tool", () => {
    const payload = toolListPayload(mockContext([MCP_SCOPES.fullAccess]));
    for (const item of payload.tools) {
      const definition = mcpTools.find((tool) => tool.name === item.name)!;
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

  it("returns mcp/www_authenticate for an unauthenticated tool call", async () => {
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
    expect(json.result._meta["mcp/www_authenticate"][0]).toContain('error="invalid_token"');
    expect(json.result._meta["mcp/www_authenticate"][0]).toContain(
      'resource_metadata="https://plaivra.com/.well-known/oauth-protected-resource"'
    );
    expect(json.result._meta["mcp/www_authenticate"][0]).toContain(
      `scope="${MCP_SCOPES.profileRead}"`
    );
  });

  it("includes error, description, and canonical scopes in insufficient-scope challenges", () => {
    const result = mcpAuthenticationErrorResult(
      new Request("https://plaivra.com/api/mcp"),
      "insufficient_scope",
      "Additional Plaivra permission is required.",
      [MCP_SCOPES.fullAccess, MCP_SCOPES.all]
    );
    const challenge = result._meta?.["mcp/www_authenticate"]?.[0] ?? "";
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('error_description="Additional Plaivra permission is required."');
    expect(challenge).toContain(`scope="${MCP_SCOPES.fullAccess}"`);
    expect(challenge).not.toContain(MCP_SCOPES.all);
  });
});
