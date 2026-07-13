import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { MCP_CATALOG_VERSION, MCP_IDEMPOTENT_WRITE_TOOL_NAMES, mcpTools } from "@/lib/mcp/public-surface";

describe("versioned public MCP catalog", () => {
  it("matches the reviewed manifest exactly", async () => {
    const manifest = JSON.parse(await readFile(path.join(process.cwd(), "docs/chatgpt-app/public-tool-catalog.json"), "utf8")) as {
      catalogVersion: string;
      publicToolCount: number;
      publicTools: string[];
    };
    expect(manifest.catalogVersion).toBe(MCP_CATALOG_VERSION);
    expect(manifest.publicToolCount).toBe(mcpTools.length);
    expect([...mcpTools.map((tool) => tool.name)]).toEqual(manifest.publicTools);
  });

  it("keeps broad reads, queues, aliases, admin tools, internal CRUD, and Daily Check-in out", () => {
    const publicNames = new Set(mcpTools.map((tool) => tool.name));
    for (const hidden of [
      "get_user_profile", "get_today_summary", "get_progress_summary",
      "get_ai_action_requests", "create_ai_action_request", "update_ai_action_request_status",
      "get_safety_profile", "update_safety_profile", "save_chatgpt_workout_plan", "generate_workout_plan",
      "create_kitchen", "update_kitchen", "delete_kitchen", "create_workout_plan_day", "add_exercise_to_plan_day",
      "get_habits", "create_habit", "add_supplement_log", "get_admin_user_summary",
      "get_daily_checkins", "upsert_daily_checkin"
    ]) expect(publicNames.has(hidden), hidden).toBe(false);
  });

  it("publishes an output schema and idempotency annotation for every applicable tool", () => {
    for (const tool of mcpTools) {
      expect(tool.outputSchema, tool.name).toMatchObject({ type: "object" });
      if (MCP_IDEMPOTENT_WRITE_TOOL_NAMES.has(tool.name)) {
        expect((tool.inputSchema.required as string[])).toContain("idempotency_key");
        expect(tool.annotations.idempotentHint).toBe(true);
      }
    }
  });

  it("uses optimistic concurrency on every public update surface", async () => {
    for (const name of ["update_food_log", "update_meal_plan_item", "activate_workout_plan"]) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.inputSchema.required).toContain("expected_updated_at");
    }
    const executor = await readFile(path.join(process.cwd(), "lib/mcp/tool-executor.ts"), "utf8");
    const safeExecutor = await readFile(path.join(process.cwd(), "lib/mcp/tool-executor-safe.ts"), "utf8");
    expect(executor).toContain('.eq("updated_at", getString(input, "expected_updated_at"))');
    expect(safeExecutor).toContain('.eq("updated_at", getString(input, "expected_updated_at"))');
    expect(`${executor}\n${safeExecutor}`).toContain("version_conflict");
  });
});
