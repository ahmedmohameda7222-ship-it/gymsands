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
  additionalProperties?: boolean;
  anyOf?: Schema[];
};

const DATE_FIELD = /^(?:date|start_date|end_date|record_date|measured_at|plan_date|log_date)$/;

function sample(schema: Schema, field = ""): unknown {
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.anyOf?.length) return sample(schema.anyOf.find((candidate) => candidate.type !== "null") ?? schema.anyOf[0], field);
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
  if (schema.type === "null") return null;
  return {};
}

function resultFor(tool: McpToolDefinition): McpToolResult {
  const structuredContent = sample(tool.outputSchema) as Record<string, unknown>;
  return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent) }] };
}

function assertClosedObjects(schema: Schema, path: string) {
  if (schema.anyOf?.length) schema.anyOf.forEach((candidate, index) => assertClosedObjects(candidate, `${path}.anyOf[${index}]`));
  if (schema.type === "object") {
    expect((schema as Schema & { additionalProperties?: boolean }).additionalProperties, path).toBe(false);
    for (const [key, child] of Object.entries(schema.properties ?? {})) assertClosedObjects(child, `${path}.${key}`);
  }
  if (schema.type === "array" && schema.items) assertClosedObjects(schema.items, `${path}[]`);
}

describe("public MCP output contracts", () => {
  it("has an executable recursively closed output contract for all 34 public tools", () => {
    expect(mcpTools).toHaveLength(34);
    for (const tool of mcpTools) {
      expect(tool.outputSchema, tool.name).toBeTruthy();
      assertClosedObjects(tool.outputSchema as Schema, tool.name);
      const result = resultFor(tool);
      expect(validateMcpToolOutput(tool, result), tool.name).toEqual({
        success: true,
        value: result.structuredContent
      });
    }
  });

  it("preserves required nullable Food totals while keeping real zero numeric", () => {
    const tool = mcpTools.find((candidate) => candidate.name === "add_food_log");
    expect(tool).toBeTruthy();
    const structuredContent = {
      ok: true,
      saved_items: [{ food_name: "Known calories, unknown protein", calories: 100, protein_g: null, carbs_g: 0, fat_g: 2 }],
      totals: { calories: 100, protein_g: null, carbs_g: 0, fat_g: 2 }
    };
    const original: McpToolResult = {
      structuredContent,
      content: [{ type: "text", text: JSON.stringify(structuredContent) }]
    };

    const sanitized = sanitizeMcpToolResult(original, tool!.outputSchema);

    expect(sanitized.structuredContent).toMatchObject({
      saved_items: [{ calories: 100, carbs_g: 0, fat_g: 2 }],
      totals: { calories: 100, protein_g: null, carbs_g: 0, fat_g: 2 }
    });
    expect((sanitized.structuredContent.saved_items as Array<Record<string, unknown>>)[0]?.protein_g).toBeUndefined();
    expect(validateMcpToolOutput(tool!, sanitized)).toMatchObject({ success: true });
    expect(sanitized.content[0]?.text).toContain('"protein_g":null');
    expect(sanitized.content[0]?.text).toContain('"carbs_g":0');
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
          goal: null, nutrition_goal: null, nutrition_preferences: [],
          user_confirmed_restrictions: {
            allergies: [], dietary_restrictions: [], legacy_free_text: null,
            planning_restrictions: null, legacy_planning_restrictions: null,
            medical_interpretation_allowed: false
          },
          effective_target: {
            date: "2026-07-11", available: false, effective_from: null, effective_to: null,
            calories: null, protein_g: null, carbs_g: null, fat_g: null, water_ml: null, source: null
          },
          planning_preferences: {
            meals_per_day: null, preferred_cuisines: [], liked_foods: [], disliked_foods: [],
            cooking_skill: null, max_cooking_time_minutes: null, meal_prep_preference: null,
            meal_prep_days: [], weekly_food_budget: null, budget_currency: null,
            eating_schedule: null, supplements: [], tracks_calories_or_macros: null,
            kitchen_equipment: [], repeat_tolerance: null, ingredient_reuse_preference: null,
            grocery_style_preference: null
          }
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
