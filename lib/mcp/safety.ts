import type { McpToolResult } from "@/lib/mcp/tool-helpers";
import type { McpToolDefinition } from "@/lib/mcp/tools";

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: unknown[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  const?: unknown;
  format?: string;
  anyOf?: JsonSchema[];
};

export type McpInputValidation =
  | { success: true; value: Record<string, unknown> }
  | { success: false; errors: string[] };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_FIELDS = new Set(["date", "start_date", "end_date", "record_date", "measured_at", "plan_date", "planned_date", "log_date"]);
const TIMESTAMP_FIELDS = new Set(["expected_updated_at"]);
const CALLER_IDENTITY_FIELDS = new Set(["user_id", "owner_id", "profile_id", "tenant_id"]);
const MAX_VALIDATION_ERRORS = 20;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isValidIsoDate(value: string) {
  if (value === "today") return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function isValidIsoTimestamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/.test(value)) return false;
  return !Number.isNaN(Date.parse(value));
}

function defaultStringLimit(field: string) {
  if (["notes", "description", "instructions", "reason"].includes(field)) return 2_000;
  if (field === "query") return 200;
  return 300;
}

function defaultArrayLimit(field: string) {
  if (field === "days") return 31;
  if (field === "sets") return 50;
  return 100;
}

function defaultNumberRange(field: string): [number, number] {
  if (field === "age") return [1, 120];
  if (field === "hours_slept") return [0, 24];
  if (field === "period_days") return [1, 365];
  if (field === "duration_weeks") return [1, 104];
  if (field === "days_per_week") return [1, 7];
  if (field.includes("duration") || field.includes("rest_seconds")) return [0, 86_400];
  if (field.includes("calories")) return [0, 20_000];
  if (field.endsWith("_g")) return [0, 5_000];
  if (field === "amount_ml") return [1, 20_000];
  if (field.endsWith("_ml") || field === "water_ml") return [0, 20_000];
  if (field.includes("weight")) return [0.1, 1_000];
  if (field.endsWith("_cm") || field === "height_cm") return [0.1, 500];
  if (field === "quantity") return [0.001, 10_000];
  if (field === "sets" || field.endsWith("_number")) return [1, 10_000];
  if (field === "reps" || field === "order_index") return [0, 10_000];
  return [-1_000_000, 1_000_000];
}

function validateNode(value: unknown, schema: JsonSchema, path: string, errors: string[]) {
  if (errors.length >= MAX_VALIDATION_ERRORS) return;
  const field = path.split(".").at(-1)?.replace(/\[\d+\]$/, "") ?? path;
  if ("const" in schema && value !== schema.const) {
    errors.push(`${path} must equal the declared constant.`);
    return;
  }

  if (schema.anyOf?.length) {
    const matchesAny = schema.anyOf.some((candidate) => {
      const candidateErrors: string[] = [];
      validateNode(value, candidate, path, candidateErrors);
      return candidateErrors.length === 0;
    });
    if (!matchesAny) errors.push(`${path} must match at least one allowed shape.`);
  }

  if (schema.type === "object") {
    if (!isObject(value)) {
      errors.push(`${path} must be an object.`);
      return;
    }

    for (const key of Object.keys(value)) {
      if (CALLER_IDENTITY_FIELDS.has(key)) {
        errors.push(`${path}.${key} is server-controlled and must not be provided.`);
      }
    }

    const properties = schema.properties ?? {};
    for (const required of schema.required ?? []) {
      const requiredValue = value[required];
      if (
        !(required in value) ||
        requiredValue === undefined ||
        requiredValue === null ||
        (typeof requiredValue === "string" && !requiredValue.trim())
      ) {
        errors.push(`${path}.${required} is required.`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in properties)) errors.push(`${path}.${key} is not an allowed field.`);
      }
    }
    for (const [key, child] of Object.entries(properties)) {
      if (key in value && value[key] !== undefined && value[key] !== null) {
        validateNode(value[key], child, `${path}.${key}`, errors);
      }
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`);
      return;
    }
    const minItems = schema.minItems ?? 0;
    const maxItems = schema.maxItems ?? defaultArrayLimit(field);
    if (value.length < minItems) errors.push(`${path} must contain at least ${minItems} item(s).`);
    if (value.length > maxItems) errors.push(`${path} must contain at most ${maxItems} item(s).`);
    if (schema.items) value.forEach((item, index) => validateNode(item, schema.items!, `${path}[${index}]`, errors));
    return;
  }

  if (schema.type === "string") {
    if (typeof value !== "string") {
      errors.push(`${path} must be a string.`);
      return;
    }
    const minLength = schema.minLength ?? 0;
    const maxLength = schema.maxLength ?? defaultStringLimit(field);
    if (value.length < minLength) errors.push(`${path} must contain at least ${minLength} character(s).`);
    if (value.length > maxLength) errors.push(`${path} must contain at most ${maxLength} character(s).`);
    if (schema.enum && !schema.enum.includes(value)) errors.push(`${path} must be one of: ${schema.enum.join(", ")}.`);
    if (field.endsWith("_id") && !UUID_PATTERN.test(value)) errors.push(`${path} must be a valid UUID.`);
    if (DATE_FIELDS.has(field) && !isValidIsoDate(value)) errors.push(`${path} must be YYYY-MM-DD or today.`);
    if (TIMESTAMP_FIELDS.has(field) && !isValidIsoTimestamp(value)) errors.push(`${path} must be an ISO UTC timestamp.`);
    return;
  }

  if (schema.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${path} must be a finite number.`);
      return;
    }
    const [defaultMin, defaultMax] = defaultNumberRange(field);
    const minimum = schema.minimum ?? defaultMin;
    const maximum = schema.maximum ?? defaultMax;
    if (value < minimum || value > maximum) errors.push(`${path} must be between ${minimum} and ${maximum}.`);
    return;
  }

  if (schema.type === "boolean" && typeof value !== "boolean") {
    errors.push(`${path} must be a boolean.`);
  }
}

export function validateMcpToolInput(tool: McpToolDefinition, input: unknown): McpInputValidation {
  if (!isObject(input)) return { success: false, errors: ["input must be an object."] };
  const errors: string[] = [];
  validateNode(input, tool.inputSchema as JsonSchema, "input", errors);
  if (tool.annotations.destructiveHint && input.confirm !== true) {
    errors.push("input.confirm must be true after the user explicitly confirms this destructive action.");
  }
  return errors.length ? { success: false, errors: Array.from(new Set(errors)).slice(0, MAX_VALIDATION_ERRORS) } : { success: true, value: input };
}

export function validateMcpToolOutput(tool: McpToolDefinition, result: McpToolResult): McpInputValidation {
  if (!isObject(result.structuredContent)) return { success: false, errors: ["structuredContent must be an object."] };
  if (result.isError) {
    const { ok, code, message } = result.structuredContent;
    const errors: string[] = [];
    if (ok !== false) errors.push("error structuredContent.ok must be false.");
    if (typeof code !== "string" || !/^[a-z0-9_]{1,64}$/.test(code)) errors.push("error structuredContent.code must be a stable snake_case code.");
    if (typeof message !== "string" || !message.trim() || message.length > 500) errors.push("error structuredContent.message must be a bounded user-safe message.");
    return errors.length ? { success: false, errors } : { success: true, value: result.structuredContent };
  }
  const errors: string[] = [];
  validateNode(result.structuredContent, tool.outputSchema as JsonSchema, "structuredContent", errors);
  return errors.length ? { success: false, errors } : { success: true, value: result.structuredContent };
}

// `updated_at` is the public optimistic-concurrency token used by update tools.
// Ownership identifiers and creation/internal telemetry remain private.
const PRIVATE_OUTPUT_KEYS = /(?:^(?:user_id|owner_id|profile_id|tenant_id|connection_id|notes|created_at)$|token|secret|authorization_code|code_hash|password|service_role)/i;
const MAX_OUTPUT_ARRAY_ITEMS = 100;
const MAX_OUTPUT_STRING_LENGTH = 4_000;

function redactSensitiveText(value: string) {
  return value
    .replace(/plaivra_mcp_(?:at_)?[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]")
    .slice(0, MAX_OUTPUT_STRING_LENGTH);
}

export function minimizeMcpOutput(value: unknown, depth = 0): unknown {
  if (depth > 10) return "[TRUNCATED]";
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.slice(0, MAX_OUTPUT_ARRAY_ITEMS).map((item) => minimizeMcpOutput(item, depth + 1));
  if (!isObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key, child]) => child !== null && child !== undefined && !PRIVATE_OUTPUT_KEYS.test(key))
      .map(([key, child]) => [key, minimizeMcpOutput(child, depth + 1)])
  );
}

function projectMcpOutputToSchema(value: unknown, schema: JsonSchema | undefined): unknown {
  if (!schema || value === null || value === undefined) return value;
  if (schema.type === "array" && Array.isArray(value)) {
    return value.map((item) => projectMcpOutputToSchema(item, schema.items));
  }
  if (schema.type === "object" && isObject(value)) {
    const properties = schema.properties ?? {};
    const entries = Object.entries(value)
      .filter(([key]) => schema.additionalProperties !== false || key in properties)
      .map(([key, child]) => [key, projectMcpOutputToSchema(child, properties[key])]);
    return Object.fromEntries(entries);
  }
  return value;
}

export function sanitizeMcpToolResult(result: McpToolResult, outputSchema?: Record<string, unknown>): McpToolResult {
  const minimized = minimizeMcpOutput(result.structuredContent);
  const structuredContent = projectMcpOutputToSchema(minimized, outputSchema as JsonSchema | undefined) as Record<string, unknown>;
  const originalJson = JSON.stringify(result.structuredContent);
  const content = result.content.map((item) => ({
    ...item,
    text: item.text === originalJson ? JSON.stringify(structuredContent) : redactSensitiveText(item.text)
  }));
  return { ...result, structuredContent, content };
}
