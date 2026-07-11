import { describe, expect, it } from "vitest";
import { sanitizeMcpToolResult, validateMcpToolOutput } from "@/lib/mcp/safety";
import { mcpTools, type McpToolDefinition } from "@/lib/mcp/tools";
import type { McpToolResult } from "@/lib/mcp/tool-helpers";

type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  format?: string;
  minimum?: number;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
};

const DATE_FIELD = /^(?:date|start_date|end_date|record_date|measured_at|plan_date|log_date)$/;

function sample(schema: Schema, field = ""): unknown {
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries((schema.required ?? []).map((key) => [key, sample(properties[key] ?? {}, key)]));
  }
  if (schema.type === "array") return [];
  if (schema.type === "boolean") return true;
  if (schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "string") {
    if (schema.format === "date-time") return "2026-07-11T12:00:00.000Z";
    if (schema.format === "uuid" || field.endsWith("_id")) return "11111111-1111-4111-8111-111111111111";
    if (DATE_FIELD.test(field)) return "2026-07-11";
    return "sample";
  }
  return {};
}

function resultFor(tool: McpToolDefinition): McpToolResult {
  const structuredContent = sample(tool.outputSchema) as Record<string, unknown>;
  return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
}

describe("public MCP output contracts", () => {
  it("has an executable closed output contract for all 35 public tools", () => {
    expect(mcpTools).toHaveLength(35);
    for (const tool of mcpTools) {
      expect(tool.outputSchema, tool.name).toBeTruthy();
      const result = resultFor(tool);
      expect(validateMcpToolOutput(tool, result), tool.name).toEqual({
        success: true,
        value: result.structuredContent
      });
    }
  });

  it("omits unavailable optional context values before contract validation", () => {
    const fixtures: Record<string, Record<string, unknown>> = {
      get_training_planning_context: {
        schema_version: "2026-07-1", task: "training_planning", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          planning_profile: { goal: null, training_level: null, training_place: null, training_days_per_week: null, workout_duration_minutes: null },
          functional_constraints: { user_authored_labels: [], areas_to_protect: [], movement_restrictions: null, retained_legacy_notes: null, medical_interpretation_allowed: false },
          existing_plans: []
        }
      },
      get_nutrition_planning_context: {
        schema_version: "2026-07-1", task: "nutrition_planning", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          goal: null, nutrition_preferences: [],
          user_confirmed_restrictions: { legacy_free_text: null, planning_restrictions: null, allergies: null, medical_interpretation_allowed: false },
          default_targets: null, target_profiles: [],
          planning_preferences: { weekly_food_budget: null, budget_currency: null, max_cooking_time_minutes: null, meal_prep_days: [], cooking_skill: null, kitchen_equipment: [], preferred_cuisines: [], disliked_foods: [], repeat_tolerance: null, meals_per_day: null, ingredient_reuse_preference: null, grocery_style_preference: null }
        }
      },
      get_workout_adjustment_context: {
        schema_version: "2026-07-1", task: "workout_adjustment", generated_at: "2026-07-11T12:00:00.000Z",
        data_minimization: "task_specific", interpretation_notice: "notice",
        sections: {
          requested_plan_exercise_id: null, active_plan: null, recent_sessions: [],
          functional_constraints: { user_authored_labels: [], areas_to_protect: [], movement_restrictions: null, retained_legacy_notes: null, medical_interpretation_allowed: false }
        }
      }
    };

    for (const [name, structuredContent] of Object.entries(fixtures)) {
      const tool = mcpTools.find((candidate) => candidate.name === name);
      expect(tool).toBeTruthy();
      const original: McpToolResult = { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
      const sanitized = sanitizeMcpToolResult(original, tool!.outputSchema);
      expect(JSON.stringify(sanitized.structuredContent), name).not.toContain(":null");
      expect(validateMcpToolOutput(tool!, sanitized), name).toMatchObject({ success: true });
    }
  });
});
