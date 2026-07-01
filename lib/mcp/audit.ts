const safeIdKeys = new Set([
  "food_log_id",
  "kitchen_id",
  "meal_plan_item_id",
  "plan_day_id",
  "plan_exercise_id",
  "plan_id",
  "scheduled_session_id",
  "task_id",
  "habit_id",
  "log_id",
  "water_log_id",
  "workout_session_id"
]);

const safeBooleanKeys = new Set(["confirm", "activate", "save", "addToLog", "addToMealPlan"]);
const sensitiveKeyPattern = /(token|secret|password|prompt|note|name|weight|measurement|waist|hips|chest|neck|shoulder|arm|thigh|glute|calf|photo|path|url|email|user_id|connection_id)/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Create a deliberately small allowlist summary for MCP audit rows.
 * Free text, health/body values, tokens, paths, URLs, and raw payloads are never copied.
 */
export function redactMcpAuditInput(toolName: string, input: unknown) {
  const source = isRecord(input) ? input : {};
  const inputKeys = Object.keys(source).slice(0, 50);
  const objectIds: JsonRecord = {};
  const counts: JsonRecord = {};
  const flags: JsonRecord = {};

  for (const [key, value] of Object.entries(source)) {
    if (sensitiveKeyPattern.test(key)) continue;

    if (safeIdKeys.has(key) && typeof value === "string" && uuidPattern.test(value)) {
      objectIds[key] = value;
      continue;
    }

    if (Array.isArray(value)) {
      counts[`${key}_count`] = value.length;
      continue;
    }

    if (safeBooleanKeys.has(key) && typeof value === "boolean") {
      flags[key] = value;
    }
  }

  return {
    version: 1,
    tool_name: toolName,
    input_keys: inputKeys,
    object_ids: objectIds,
    counts,
    flags
  };
}
