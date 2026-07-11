import { describe, expect, it } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeMcpTool } from "@/lib/mcp/tool-executor-safe";
import { mcpTools } from "@/lib/mcp/tools";

type Schema = {
  type?: string;
  const?: unknown;
  enum?: unknown[];
  minimum?: number;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
  format?: string;
};

const UUID = "11111111-1111-4111-8111-111111111111";

function inputSample(schema: Schema, field = ""): unknown {
  if (Object.prototype.hasOwnProperty.call(schema, "const")) return schema.const;
  if (schema.enum?.length) return schema.enum[0];
  if (schema.type === "object") {
    const properties = schema.properties ?? {};
    return Object.fromEntries((schema.required ?? []).map((key) => [key, inputSample(properties[key] ?? {}, key)]));
  }
  if (schema.type === "array") return [inputSample(schema.items ?? {}, field)];
  if (schema.type === "boolean") return true;
  if (schema.type === "number") return schema.minimum ?? 1;
  if (schema.type === "string") {
    if (field === "idempotency_key") return "handler-coverage-0001";
    if (field === "expected_updated_at" || schema.format === "date-time") return "2026-07-11T12:00:00.000Z";
    if (field.endsWith("_id") || schema.format === "uuid") return UUID;
    if (/^(?:date|start_date|end_date|record_date|measured_at|plan_date|planned_date|log_date)$/.test(field)) return "2026-07-11";
    if (field === "meal_type") return "breakfast";
    return "sample";
  }
  return {};
}

function stoppedQuery(): unknown {
  let query: unknown;
  const callable = () => query;
  query = new Proxy(callable, {
    get(_target, property) {
      if (property === "then") {
        return (resolve: (value: unknown) => unknown) => resolve({ data: null, error: { message: "fixture_stop", code: "TEST_STOP" } });
      }
      return () => query;
    }
  });
  return query;
}

const supabase = new Proxy({}, {
  get() {
    return () => stoppedQuery();
  }
});

const context = {
  supabase,
  userId: UUID,
  connectionId: UUID,
  scopes: ["plaivra.all"],
  profile: { id: UUID, email: "reviewer@example.com", full_name: "Reviewer", role: "member" }
} as unknown as McpContext;

describe("public MCP handler coverage", () => {
  it("routes all 35 public tools to concrete runtime handlers", async () => {
    expect(mcpTools).toHaveLength(35);
    for (const tool of mcpTools) {
      const input = inputSample(tool.inputSchema) as Record<string, unknown>;
      try {
        await executeMcpTool(context, tool.name, input);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        expect(message, tool.name).not.toMatch(/unsupported mcp tool/i);
      }
    }
  });
});
