import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { McpContext } from "@/lib/mcp/auth";
import { executeMcpTool } from "@/lib/mcp/tool-executor";

type Row = Record<string, unknown>;
type Filter = { kind: "eq" | "is" | "ilike"; field: string; value: unknown };

const USER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const ACTIVE_ID = "33333333-3333-4333-8333-333333333333";
const MERGED_ID = "44444444-4444-4444-8444-444444444444";
const SURVIVOR_ID = "55555555-5555-4555-8555-555555555555";
const DEPRECATED_ID = "66666666-6666-4666-8666-666666666666";
const MY_FOOD_ID = "77777777-7777-4777-8777-777777777777";
const OTHER_MY_FOOD_ID = "88888888-8888-4888-8888-888888888888";

function catalogFood(id: string, name: string, overrides: Row = {}): Row {
  return {
    id,
    is_global: true,
    food_name: name,
    serving_size: "100 g",
    calories: 100,
    protein_g: 10,
    carbs_g: 12,
    fat_g: 2,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: null,
    sodium_mg: null,
    nutrition_basis_amount: 100,
    nutrition_basis_unit: "g",
    lifecycle_status: "active",
    merged_into_food_id: null,
    is_verified: true,
    ...overrides,
  };
}

function createSupabase(seed: Partial<Record<string, Row[]>>) {
  const tables: Record<string, Row[]> = {
    food_items: [],
    user_food_items: [],
    food_personal_corrections: [],
    food_logs: [],
    ...Object.fromEntries(Object.entries(seed).map(([key, rows]) => [key, (rows ?? []).map((row) => ({ ...row }))])),
  };
  const queries: Array<{ table: string; filters: Filter[]; action: string }> = [];
  let counter = 1;

  function from(table: string) {
    let action = "select";
    let payload: Row | Row[] | null = null;
    let filters: Filter[] = [];
    let rowLimit: number | null = null;

    const matches = (row: Row) => filters.every((filter) => {
      const value = row[filter.field];
      if (filter.kind === "eq" || filter.kind === "is") return value === filter.value;
      if (filter.kind === "ilike") {
        const needle = String(filter.value ?? "").replaceAll("%", "").toLowerCase();
        return String(value ?? "").toLowerCase().includes(needle);
      }
      return true;
    });

    const materialize = () => {
      queries.push({ table, filters: [...filters], action });
      const rows = tables[table] ?? (tables[table] = []);
      if (action === "insert") {
        const incoming = (Array.isArray(payload) ? payload : [payload ?? {}]).map((row) => ({
          id: typeof row.id === "string" ? row.id : `99999999-9999-4999-8999-${String(counter++).padStart(12, "0")}`,
          ...row,
        }));
        rows.push(...incoming);
        return { data: incoming, error: null };
      }
      const selected = rows.filter(matches);
      return { data: rowLimit === null ? selected : selected.slice(0, rowLimit), error: null };
    };

    const builder: Record<string, any> = {};
    builder.select = () => builder;
    builder.eq = (field: string, value: unknown) => { filters.push({ kind: "eq", field, value }); return builder; };
    builder.is = (field: string, value: unknown) => { filters.push({ kind: "is", field, value }); return builder; };
    builder.ilike = (field: string, value: unknown) => { filters.push({ kind: "ilike", field, value }); return builder; };
    builder.limit = (value: number) => { rowLimit = value; return builder; };
    builder.insert = (value: Row | Row[]) => { action = "insert"; payload = value; return builder; };
    builder.maybeSingle = async () => { const result = materialize(); return { data: result.data[0] ?? null, error: result.error }; };
    builder.single = async () => { const result = materialize(); return { data: result.data[0] ?? null, error: result.error }; };
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(materialize()).then(resolve, reject);
    return builder;
  }

  return {
    client: { from } as unknown as McpContext["supabase"],
    tables,
    queries,
  };
}

function context(client: McpContext["supabase"]): McpContext {
  return {
    supabase: client,
    userId: USER_ID,
    connectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    scopes: ["plaivra.nutrition.read", "plaivra.nutrition.write"],
    profile: { id: USER_ID, email: "member@example.com", full_name: "Member", role: "member" },
  };
}

async function addFood(client: McpContext["supabase"], foodName: string, quantity = 1) {
  return executeMcpTool(context(client), "add_food_log", {
    date: "2026-08-29",
    meal_type: "Breakfast",
    items: [{ food_name: foodName, quantity }],
  });
}

describe("Nutrition V1 MCP canonical Food write authority", () => {
  it("logs an active canonical global Food normally", async () => {
    const db = createSupabase({ food_items: [catalogFood(ACTIVE_ID, "Active yogurt")] });

    const result = await addFood(db.client, "Active yogurt", 2);

    expect(result.isError).not.toBe(true);
    expect(db.tables.food_logs).toHaveLength(1);
    expect(db.tables.food_logs[0]).toMatchObject({
      food_item_id: ACTIVE_ID,
      user_food_item_id: null,
      food_name: "Active yogurt",
      serving_size: "100 g",
      quantity: 2,
      calories: 200,
      protein_g: 20,
      carbs_g: 24,
      fat_g: 4,
    });
  });

  it("resolves a merged global Food to the active survivor before logging", async () => {
    const db = createSupabase({
      food_items: [
        catalogFood(MERGED_ID, "Old yogurt", { lifecycle_status: "merged", merged_into_food_id: SURVIVOR_ID }),
        catalogFood(SURVIVOR_ID, "Canonical yogurt", { calories: 90, protein_g: 11, carbs_g: 9, fat_g: 1 }),
      ],
    });

    const result = await addFood(db.client, "Old yogurt");

    expect(result.isError).not.toBe(true);
    expect(db.tables.food_logs).toHaveLength(1);
    expect(db.tables.food_logs[0]).toMatchObject({
      food_item_id: SURVIVOR_ID,
      food_name: "Canonical yogurt",
      calories: 90,
      protein_g: 11,
    });
    expect(db.tables.food_logs[0].food_item_id).not.toBe(MERGED_ID);
  });

  it("does not accept a deprecated or withdrawn catalog Food for a new log", async () => {
    for (const lifecycle_status of ["deprecated", "withdrawn"]) {
      const db = createSupabase({
        food_items: [catalogFood(DEPRECATED_ID, "Retired yogurt", { lifecycle_status })],
      });

      const result = await addFood(db.client, "Retired yogurt");

      expect(result.isError).toBe(true);
      expect(db.tables.food_logs).toHaveLength(0);
    }
  });

  it("freezes the owner personal correction when logging a catalog Food", async () => {
    const db = createSupabase({
      food_items: [catalogFood(ACTIVE_ID, "Corrected yogurt")],
      food_personal_corrections: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab",
        user_id: USER_ID,
        food_id: ACTIVE_ID,
        is_active: true,
        calories: null,
        protein_g: 13,
        carbs_g: null,
        fat_g: null,
        saturated_fat_g: null,
        fiber_g: null,
        sugars_g: null,
        sodium_mg: null,
        basis_amount: null,
        basis_unit: null,
      }],
    });

    const result = await addFood(db.client, "Corrected yogurt", 2);

    expect(result.isError).not.toBe(true);
    expect(db.tables.food_logs[0]).toMatchObject({ calories: 200, protein_g: 26, carbs_g: 24, fat_g: 4 });
  });

  it("preserves null nutrients in the frozen logged values", async () => {
    const db = createSupabase({
      food_items: [catalogFood(ACTIVE_ID, "Unknown carb yogurt", { carbs_g: null, fiber_g: null })],
    });

    const result = await addFood(db.client, "Unknown carb yogurt");

    expect(result.isError).not.toBe(true);
    expect(db.tables.food_logs).toHaveLength(1);
    expect(db.tables.food_logs[0].carbs_g).toBeNull();
  });

  it("keeps My Food search and handoff owner-scoped", async () => {
    const db = createSupabase({
      user_food_items: [
        { id: OTHER_MY_FOOD_ID, user_id: OTHER_USER_ID, food_name: "My oats", serving_size: "40 g", calories: 999, protein_g: 99, carbs_g: 99, fat_g: 99, nutrition_basis_amount: 40, nutrition_basis_unit: "g", deleted_at: null },
        { id: MY_FOOD_ID, user_id: USER_ID, food_name: "My oats", serving_size: "40 g", calories: 150, protein_g: null, carbs_g: 25, fat_g: 3, nutrition_basis_amount: 40, nutrition_basis_unit: "g", deleted_at: null },
      ],
    });

    const result = await addFood(db.client, "My oats");

    expect(result.isError).not.toBe(true);
    expect(db.tables.food_logs).toHaveLength(1);
    expect(db.tables.food_logs[0]).toMatchObject({ user_food_item_id: MY_FOOD_ID, food_item_id: null, calories: 150, protein_g: null });
    expect(db.tables.food_logs[0].user_food_item_id).not.toBe(OTHER_MY_FOOD_ID);
    expect(db.queries.some((query) => query.table === "user_food_items" && query.filters.some((filter) => filter.kind === "eq" && filter.field === "user_id" && filter.value === USER_ID))).toBe(true);
  });

  it("never returns merged or inactive catalog identities as normal public search candidates", async () => {
    const mergedDb = createSupabase({
      food_items: [
        catalogFood(MERGED_ID, "Old yogurt", { lifecycle_status: "merged", merged_into_food_id: SURVIVOR_ID }),
        catalogFood(SURVIVOR_ID, "Canonical yogurt"),
      ],
    });
    const mergedResult = await executeMcpTool(context(mergedDb.client), "search_foods", { query: "Old yogurt", limit: 5 });
    const mergedFoods = mergedResult.structuredContent.foods as Row[];
    expect(mergedFoods).toHaveLength(1);
    expect(mergedFoods[0]).toMatchObject({ id: SURVIVOR_ID, source: "global", food_name: "Canonical yogurt" });
    expect(mergedFoods.some((food) => food.id === MERGED_ID)).toBe(false);

    const inactiveDb = createSupabase({
      food_items: [catalogFood(DEPRECATED_ID, "Retired yogurt", { lifecycle_status: "deprecated" })],
    });
    const inactiveResult = await executeMcpTool(context(inactiveDb.client), "search_foods", { query: "Retired yogurt", limit: 5 });
    expect(inactiveResult.structuredContent.foods).toEqual([]);
  });

  it("revalidates the serving through handoff before a global Food insert", async () => {
    const db = createSupabase({ food_items: [catalogFood(ACTIVE_ID, "Serving drift yogurt")] });
    let foodResolveCount = 0;
    const originalFrom = db.client.from.bind(db.client);
    db.client.from = ((table: string) => {
      if (table === "food_items") {
        foodResolveCount += 1;
        if (foodResolveCount >= 3) db.tables.food_items[0].serving_size = "1 cup";
      }
      return originalFrom(table as never);
    }) as typeof db.client.from;

    const result = await addFood(db.client, "Serving drift yogurt");

    expect(result.isError).toBe(true);
    expect(db.tables.food_logs).toHaveLength(0);
  });

  it("preserves ambiguity instead of picking one of multiple matches", async () => {
    const db = createSupabase({
      food_items: [
        catalogFood(ACTIVE_ID, "Greek yogurt plain"),
        catalogFood(SURVIVOR_ID, "Greek yogurt vanilla"),
      ],
    });

    const result = await addFood(db.client, "Greek yogurt");

    expect(result.isError).toBe(true);
    expect(result.structuredContent.code).toBe("ambiguous_food");
    expect(db.tables.food_logs).toHaveLength(0);
  });

  it("keeps public MCP implementation free of direct food_items access", () => {
    for (const path of [
      "lib/mcp/tool-executor.ts",
      "lib/mcp/nutrition-v1-food-execution.ts",
      "lib/mcp/tool-executor-implementation.ts",
    ]) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(source, path).not.toMatch(/\.from\(["']food_items["']\)/);
    }
  });
});
