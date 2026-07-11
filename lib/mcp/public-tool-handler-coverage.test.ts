import { describe, expect, it } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeMcpTool } from "@/lib/mcp/tool-executor-safe";
import { sanitizeMcpToolResult, validateMcpToolInput, validateMcpToolOutput } from "@/lib/mcp/safety";
import { mcpTools } from "@/lib/mcp/tools";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_ID = "22222222-2222-4222-8222-222222222222";
const FOOD_ID = "33333333-3333-4333-8333-333333333333";
const LOG_ID = "44444444-4444-4444-8444-444444444444";
const MEAL_ID = "55555555-5555-4555-8555-555555555555";
const PLAN_ID = "66666666-6666-4666-8666-666666666666";
const DAY_ID = "77777777-7777-4777-8777-777777777777";
const EXERCISE_ID = "88888888-8888-4888-8888-888888888888";
const SCHEDULED_ID = "99999999-9999-4999-8999-999999999999";
const SESSION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const UPDATED_AT = "2026-07-11T12:00:00.000Z";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "in" | "gte" | "lte" | "ilike"; field: string; value: unknown };

function initialTables(): Record<string, Row[]> {
  return {
    profiles: [{ id: USER_ID, email: "reviewer@example.com", full_name: "Reviewer", role: "member", goal: "wellness", weight_kg: 80, height_cm: 175, age: 24, training_level: "advanced", activity_level: "active" }],
    onboarding_answers: [{ user_id: USER_ID, age: 24, training_place: "gym", days_per_week: 3, workout_duration_minutes: 45 }],
    user_fitness_constraints: [],
    user_ai_permission_settings: [{ user_id: USER_ID, access_mode: "full", scopes: ["plaivra.full_access"] }],
    calorie_targets: [{ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", user_id: USER_ID, daily_calories: 2000, protein_g: 160, carbs_g: 190, fat_g: 65, water_ml: 3000 }],
    food_items: [{ id: FOOD_ID, is_global: true, food_name: "sample", serving_size: "100 g", calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2 }],
    user_food_items: [],
    food_logs: [{ id: LOG_ID, user_id: USER_ID, food_name: "sample", serving_size: "100 g", quantity: 1, calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, meal_type: "Breakfast", log_date: "2026-07-11", updated_at: UPDATED_AT }],
    saved_recipes: [],
    saved_recipe_ingredients: [],
    user_meal_plan_items: [{ id: MEAL_ID, user_id: USER_ID, plan_date: "2026-07-11", meal_type: "Breakfast", food_name: "sample", serving_size: "100 g", quantity: 1, calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, status: "planned", food_log_id: null, completed_at: null, updated_at: UPDATED_AT }],
    water_logs: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", user_id: USER_ID, amount_ml: 250, log_date: "2026-07-11", updated_at: UPDATED_AT }],
    user_workout_plans: [{ id: PLAN_ID, user_id: USER_ID, name: "Plan", goal: "Strength", is_active: true, is_default: true, updated_at: UPDATED_AT }],
    user_workout_plan_days: [{ id: DAY_ID, plan_id: PLAN_ID, day_number: 1, day_name: "Day 1", focus: "Full body" }],
    user_workout_plan_exercises: [{ id: EXERCISE_ID, plan_day_id: DAY_ID, exercise_name: "Squat", sets: 3, reps: "8", sort_order: 1 }],
    user_workout_sessions: [{ id: SCHEDULED_ID, user_id: USER_ID, user_workout_plan_id: PLAN_ID, plan_day_id: DAY_ID, scheduled_date: "2026-07-11", session_number: 1, status: "scheduled" }],
    workout_sessions: [{ id: SESSION_ID, user_id: USER_ID, scheduled_session_id: SCHEDULED_ID, plan_id: PLAN_ID, plan_day_id: DAY_ID, status: "in_progress", started_at: UPDATED_AT }],
    exercise_logs: [],
    progress_entries: [],
    body_measurements: [],
    personal_records: [],
    sleep_recovery_logs: [],
    user_daily_checkins: [],
    user_nutrition_preference_profiles: [],
    user_nutrition_target_profiles: [],
    user_progression_targets: [],
    user_exercise_alternatives: [],
    daily_fit_tasks: [],
    fitness_habits: [],
    supplement_logs: [],
    user_consents: [],
    chatgpt_connections: []
  };
}

function createInMemorySupabase() {
  const tables = initialTables();
  let counter = 1;
  const nextId = () => `dddddddd-dddd-4ddd-8ddd-${String(counter++).padStart(12, "0")}`;

  function from(table: string) {
    let action: "select" | "insert" | "update" | "upsert" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let filters: Filter[] = [];
    let rowLimit: number | null = null;

    const matches = (row: Row) => filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === "eq") return value === filter.value;
      if (filter.kind === "is") return value === filter.value;
      if (filter.kind === "in") return Array.isArray(filter.value) && filter.value.includes(value);
      if (filter.kind === "gte") return String(value ?? "") >= String(filter.value ?? "");
      if (filter.kind === "lte") return String(value ?? "") <= String(filter.value ?? "");
      if (filter.kind === "ilike") return String(value ?? "").toLowerCase().includes(String(filter.value ?? "").replaceAll("%", "").toLowerCase());
      return true;
    });

    const materialize = () => {
      const existing = tables[table] ?? (tables[table] = []);
      if (action === "insert" || action === "upsert") {
        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({
          id: typeof row.id === "string" ? row.id : nextId(),
          created_at: UPDATED_AT,
          updated_at: UPDATED_AT,
          ...row
        }));
        if (action === "upsert") {
          for (const row of incoming) {
            const index = existing.findIndex((candidate) => candidate.id === row.id || (row.user_id && candidate.user_id === row.user_id && row.target_type && candidate.target_type === row.target_type));
            if (index >= 0) existing[index] = { ...existing[index], ...row };
            else existing.push(row);
          }
        } else existing.push(...incoming);
        return { data: incoming, error: null };
      }
      const selected = existing.filter(matches);
      if (action === "update") {
        const updated = selected.map((row) => Object.assign(row, payload as Row, { updated_at: UPDATED_AT }));
        return { data: updated, error: null };
      }
      if (action === "delete") {
        const deleted = selected.slice();
        tables[table] = existing.filter((row) => !matches(row));
        return { data: deleted, error: null };
      }
      return { data: rowLimit === null ? selected : selected.slice(0, rowLimit), error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.insert = (value: Row | Row[]) => { action = "insert"; payload = value; return builder; };
    builder.upsert = (value: Row | Row[]) => { action = "upsert"; payload = value; return builder; };
    builder.update = (value: Row) => { action = "update"; payload = value; return builder; };
    builder.delete = () => { action = "delete"; return builder; };
    builder.eq = (field: string, value: unknown) => { filters.push({ kind: "eq", field, value }); return builder; };
    builder.is = (field: string, value: unknown) => { filters.push({ kind: "is", field, value }); return builder; };
    builder.in = (field: string, value: unknown[]) => { filters.push({ kind: "in", field, value }); return builder; };
    builder.gte = (field: string, value: unknown) => { filters.push({ kind: "gte", field, value }); return builder; };
    builder.lte = (field: string, value: unknown) => { filters.push({ kind: "lte", field, value }); return builder; };
    builder.ilike = (field: string, value: unknown) => { filters.push({ kind: "ilike", field, value }); return builder; };
    builder.neq = () => builder;
    builder.or = () => builder;
    builder.not = () => builder;
    builder.order = () => builder;
    builder.limit = (value: number) => { rowLimit = value; return builder; };
    builder.range = () => builder;
    builder.single = async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    };
    builder.maybeSingle = async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    };
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(materialize()).then(resolve, reject);
    return builder;
  }

  return {
    from,
    rpc: async () => ({ data: [], error: null })
  } as unknown as McpContext["supabase"];
}

function inputFor(name: string): Record<string, unknown> {
  const key = `runtime-contract-${name}-0001`;
  const commonFood = { food_name: "sample", quantity: 1 };
  const inputs: Record<string, Record<string, unknown>> = {
    get_plaivra_status: {},
    get_training_planning_context: {},
    get_nutrition_planning_context: {},
    get_daily_execution_context: { date: "2026-07-11" },
    get_progress_context: { period_days: 30, end_date: "2026-07-11" },
    get_workout_adjustment_context: { plan_exercise_id: EXERCISE_ID },
    search_foods: { query: "sample", limit: 5 },
    add_food_log: { meal_type: "Breakfast", date: "2026-07-11", items: [commonFood], idempotency_key: key },
    get_food_logs_by_date: { date: "2026-07-11" },
    update_food_log: { food_log_id: LOG_ID, expected_updated_at: UPDATED_AT, calories: 120 },
    delete_food_log: { food_log_id: LOG_ID, confirm: true },
    create_custom_food: { food_name: "sample custom", serving_size: "100 g", calories: 120, protein_g: 12, carbs_g: 14, fat_g: 2, idempotency_key: key },
    create_custom_meal: { meal_name: "Sample meal", items: [commonFood], idempotency_key: key },
    create_day_meal_plan: { date: "2026-07-11", breakfast: [{ ...commonFood, calories: 100, protein: 10, carbs: 12, fat: 2 }], idempotency_key: key },
    create_week_meal_plan: { start_date: "2026-07-11", days: [{ date: "2026-07-11", meals: { breakfast: [{ ...commonFood, calories: 100, protein: 10, carbs: 12, fat: 2 }] } }], idempotency_key: key },
    get_meal_plan_for_date: { date: "2026-07-11" },
    get_meal_plan_for_week: { start_date: "2026-07-11" },
    update_meal_plan_item: { meal_plan_item_id: MEAL_ID, expected_updated_at: UPDATED_AT, food_name: "sample updated" },
    delete_meal_plan_item: { meal_plan_item_id: MEAL_ID, confirm: true },
    mark_meal_plan_item_done: { meal_plan_item_id: MEAL_ID, idempotency_key: key },
    generate_shopping_list: { start_date: "2026-07-11", end_date: "2026-07-17" },
    add_water_log: { amount_ml: 250, date: "2026-07-11", idempotency_key: key },
    get_water_summary: { date: "2026-07-11" },
    create_custom_workout_plan: { name: "Runtime plan", days: [{ day_name: "Day 1", day_number: 1, exercises: [{ exercise_name: "Squat", sets: 3, reps: "8" }] }], idempotency_key: key },
    get_workout_plan_by_id: { plan_id: PLAN_ID },
    activate_workout_plan: { plan_id: PLAN_ID, expected_updated_at: UPDATED_AT },
    delete_workout_plan: { plan_id: PLAN_ID, confirm: true },
    start_workout: { scheduled_session_id: SCHEDULED_ID, idempotency_key: key },
    log_exercise_sets: { workout_session_id: SESSION_ID, exercise_name: "Squat", sets: [{ set_number: 1, weight_kg: 80, reps: 8 }], idempotency_key: key },
    complete_workout: { workout_session_id: SESSION_ID, duration_minutes: 45, idempotency_key: key },
    skip_workout: { workout_session_id: SESSION_ID, reason: "Recovery", idempotency_key: key },
    add_weight_entry: { weight_kg: 80, date: "2026-07-11", idempotency_key: key },
    add_body_measurement: { measured_at: "2026-07-11", waist_cm: 90, idempotency_key: key },
    add_sleep_recovery_log: { date: "2026-07-11", hours_slept: 8, sleep_quality: "good", idempotency_key: key },
    upsert_daily_checkin: { checkin_date: "2026-07-11", checkin_type: "morning", energy_level: "good", idempotency_key: key }
  };
  return inputs[name] ?? {};
}

function context(): McpContext {
  return {
    supabase: createInMemorySupabase(),
    userId: USER_ID,
    connectionId: CONNECTION_ID,
    scopes: ["plaivra.full_access", "plaivra.profile.read", "plaivra.workouts.read", "plaivra.workouts.write", "plaivra.nutrition.read", "plaivra.nutrition.write", "plaivra.meal_plans.read", "plaivra.meal_plans.write", "plaivra.hydration.read", "plaivra.hydration.write", "plaivra.progress.read", "plaivra.progress.write", "plaivra.wellness.read", "plaivra.wellness.write"],
    profile: { id: USER_ID, email: "reviewer@example.com", full_name: "Reviewer", role: "member" }
  };
}

describe("public MCP runtime handler contracts", () => {
  it("executes and validates a success-path result for all 35 public tools", async () => {
    expect(mcpTools).toHaveLength(35);
    for (const tool of mcpTools) {
      const input = inputFor(tool.name);
      const inputValidation = validateMcpToolInput(tool, input);
      expect(inputValidation, `${tool.name} input`).toMatchObject({ success: true });
      if (!inputValidation.success) continue;

      const result = await executeMcpTool(context(), tool.name, inputValidation.value);
      expect(result.isError, `${tool.name}: ${JSON.stringify(result.structuredContent)}`).not.toBe(true);
      const sanitized = sanitizeMcpToolResult(result, tool.outputSchema);
      expect(validateMcpToolOutput(tool, sanitized), tool.name).toMatchObject({ success: true });
    }
  });
});
