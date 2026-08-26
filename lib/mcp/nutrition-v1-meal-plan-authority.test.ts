import { describe, expect, it, vi } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeMcpTool } from "@/lib/mcp/tool-executor-safe";

type Row = Record<string, unknown>;

type QueryState = {
  table: string;
  action: "select" | "insert" | "update" | "delete";
  payload: Row | Row[] | null;
  filters: Array<[string, unknown]>;
};

const USER_ID = "11111111-1111-4111-8111-111111111111";
const WEEK_ID = "22222222-2222-4222-8222-222222222222";
const OCCURRENCE_ID = "33333333-3333-4333-8333-333333333333";

function createCanonicalMealPlanSupabase(initial?: {
  weeks?: Row[];
  occurrences?: Row[];
}) {
  const tables: Record<string, Row[]> = {
    nutrition_meal_plan_weeks: initial?.weeks ?? [],
    nutrition_planned_occurrences: initial?.occurrences ?? [],
  };
  const touchedTables: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];

  function from(table: string) {
    touchedTables.push(table);
    const state: QueryState = { table, action: "select", payload: null, filters: [] };
    const matches = (row: Row) => state.filters.every(([field, value]) => row[field] === value);
    const materialize = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (state.action === "insert") {
        const incoming = (Array.isArray(state.payload) ? state.payload : [state.payload ?? {}]).map((row, index) => ({
          id: typeof row.id === "string" ? row.id : index === 0 && table === "nutrition_meal_plan_weeks" ? WEEK_ID : OCCURRENCE_ID,
          revision: table === "nutrition_meal_plan_weeks" ? 0 : row.revision,
          ...row,
        }));
        rows.push(...incoming);
        return { data: incoming, error: null };
      }
      if (state.action === "update") {
        const updated = rows.filter(matches).map((row) => Object.assign(row, state.payload as Row));
        return { data: updated, error: null };
      }
      if (state.action === "delete") {
        const deleted = rows.filter(matches);
        tables[table] = rows.filter((row) => !matches(row));
        return { data: deleted, error: null };
      }
      return { data: rows.filter(matches), error: null };
    };

    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.insert = vi.fn((value: Row | Row[]) => { state.action = "insert"; state.payload = value; return builder; });
    builder.update = vi.fn((value: Row) => { state.action = "update"; state.payload = value; return builder; });
    builder.delete = vi.fn(() => { state.action = "delete"; return builder; });
    builder.eq = vi.fn((field: string, value: unknown) => { state.filters.push([field, value]); return builder; });
    builder.gte = vi.fn(() => builder);
    builder.lte = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.single = vi.fn(async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    });
    builder.maybeSingle = vi.fn(async () => {
      const result = materialize();
      return { data: (result.data as Row[])[0] ?? null, error: result.error };
    });
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(materialize()).then(resolve, reject);
    return builder;
  }

  async function rpc(name: string, args: Record<string, unknown>) {
    rpcCalls.push({ name, args });
    if (name === "mutate_nutrition_meal_plan_week") {
      const mutation = args.p_mutation as { upsertOccurrences?: Array<Record<string, unknown>>; deleteOccurrenceIds?: string[] };
      for (const id of mutation.deleteOccurrenceIds ?? []) {
        tables.nutrition_planned_occurrences = tables.nutrition_planned_occurrences.filter((row) => row.id !== id);
      }
      for (const occurrence of mutation.upsertOccurrences ?? []) {
        const existing = tables.nutrition_planned_occurrences.find((row) => row.id === occurrence.id);
        const mapped = {
          id: occurrence.id ?? OCCURRENCE_ID,
          week_id: args.p_week_id,
          user_id: USER_ID,
          plan_date: occurrence.planDate,
          meal_slot_key: occurrence.mealSlotKey,
          position: occurrence.position,
          source_type: occurrence.sourceType,
          source_id: occurrence.sourceId,
          source_version_id: occurrence.sourceVersionId,
          resolved_quantity: occurrence.resolvedQuantity,
          resolved_serving_label: occurrence.resolvedServingLabel,
          frozen_name: occurrence.frozenName,
          frozen_snapshot: occurrence.frozenSnapshot,
          status: occurrence.status,
          updated_at: "2026-08-26T12:00:00.000Z",
        };
        if (existing) Object.assign(existing, mapped);
        else tables.nutrition_planned_occurrences.push(mapped);
      }
      const week = tables.nutrition_meal_plan_weeks.find((row) => row.id === args.p_week_id);
      if (week) week.revision = Number(week.revision ?? 0) + 1;
      return { data: { weekId: args.p_week_id, revision: Number(week?.revision ?? 1) }, error: null };
    }
    if (name === "complete_nutrition_planned_occurrence") {
      return { data: { state: "completed", occurrenceId: args.p_occurrence_id }, error: null };
    }
    return { data: null, error: { message: `Unexpected RPC ${name}` } };
  }

  return {
    supabase: { from, rpc } as unknown as McpContext["supabase"],
    tables,
    touchedTables,
    rpcCalls,
  };
}

function context(supabase: McpContext["supabase"]) {
  return {
    supabase,
    userId: USER_ID,
    connectionId: "44444444-4444-4444-8444-444444444444",
    scopes: ["plaivra.meal_plans.read", "plaivra.meal_plans.write", "plaivra.nutrition.write"],
  } as unknown as McpContext;
}

describe("Nutrition V1 MCP Meal Plan authority", () => {
  it("creates explicit MCP meal values as canonical Placeholder occurrences without inventing unknown macros", async () => {
    const fake = createCanonicalMealPlanSupabase();
    const result = await executeMcpTool(context(fake.supabase), "create_day_meal_plan", {
      date: "2026-08-26",
      breakfast: [{ food_name: "Oats bowl", calories: 410, carbs: 61, fat: 11 }],
    });

    expect(result.isError).not.toBe(true);
    expect(fake.touchedTables).toContain("nutrition_meal_plan_weeks");
    expect(fake.touchedTables).not.toContain("user_meal_plan_items");
    expect(fake.rpcCalls[0]?.name).toBe("mutate_nutrition_meal_plan_week");
    const mutation = fake.rpcCalls[0]?.args.p_mutation as { upsertOccurrences: Array<Record<string, unknown>> };
    expect(mutation.upsertOccurrences[0]).toMatchObject({
      planDate: "2026-08-26",
      mealSlotKey: "Breakfast",
      sourceType: "placeholder",
      sourceId: null,
      sourceVersionId: null,
      frozenName: "Oats bowl",
      status: "planned",
    });
    expect(mutation.upsertOccurrences[0]?.frozenSnapshot).toMatchObject({
      estimatedNutrition: { calories: 410, proteinG: null, carbsG: 61, fatG: 11 },
    });
  });

  it("reads intended meals only from canonical planned occurrences", async () => {
    const fake = createCanonicalMealPlanSupabase({
      occurrences: [{
        id: OCCURRENCE_ID,
        week_id: WEEK_ID,
        user_id: USER_ID,
        plan_date: "2026-08-26",
        meal_slot_key: "Dinner",
        position: 0,
        source_type: "placeholder",
        source_id: null,
        source_version_id: null,
        resolved_quantity: 1,
        resolved_serving_label: "1 serving",
        frozen_name: "Chicken bowl",
        frozen_snapshot: { estimatedNutrition: { calories: 650, proteinG: null, carbsG: 70, fatG: 18 } },
        status: "planned",
      }],
    });

    const result = await executeMcpTool(context(fake.supabase), "get_meal_plan_for_date", { date: "2026-08-26" });
    expect(result.isError).not.toBe(true);
    expect(JSON.stringify(result)).toContain("Chicken bowl");
    expect(fake.touchedTables).toContain("nutrition_planned_occurrences");
    expect(fake.touchedTables).not.toContain("user_meal_plan_items");
  });

  it("refuses to convert a Placeholder directly into actual Diary truth", async () => {
    const fake = createCanonicalMealPlanSupabase({
      occurrences: [{
        id: OCCURRENCE_ID,
        week_id: WEEK_ID,
        user_id: USER_ID,
        plan_date: "2026-08-26",
        meal_slot_key: "Dinner",
        position: 0,
        source_type: "placeholder",
        source_id: null,
        source_version_id: null,
        frozen_name: "Unverified dinner",
        frozen_snapshot: {},
        status: "planned",
      }],
    });

    const result = await executeMcpTool(context(fake.supabase), "mark_meal_plan_item_done", { meal_plan_item_id: OCCURRENCE_ID });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result)).toContain("confirmation");
    expect(fake.rpcCalls.some((call) => call.name === "complete_nutrition_planned_occurrence")).toBe(false);
  });
});
