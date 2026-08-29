import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCurrentUserDataExport } from "./data-export";
import { processAccountDeletionJob } from "./account-deletion-worker";

const USER_ID = "11111111-1111-4111-8111-111111111111";

type QueryCall = { table: string; filters: Array<[string, unknown]> };

function canonicalExportClient() {
  const calls: QueryCall[] = [];
  const canonicalRows: Record<string, Record<string, unknown>> = {
    nutrition_recipes: { id: "recipe-a", user_id: USER_ID, name: "Recipe A" },
    nutrition_recipe_versions: { id: "version-a", user_id: USER_ID, recipe_id: "recipe-a", frozen_nutrition: { calories: 500, protein_g: null } },
    nutrition_recipe_drafts: { id: "draft-a", user_id: USER_ID, recipe_id: "recipe-a" },
    nutrition_saved_meals: { id: "saved-meal-a", user_id: USER_ID, name: "Meal A" },
    nutrition_saved_meal_items: { id: "saved-item-a", user_id: USER_ID, saved_meal_id: "saved-meal-a", frozen_item_snapshot: { calories: 250, protein_g: null } },
    nutrition_target_periods: { id: "target-a", user_id: USER_ID, effective_from: "2026-08-01", protein_g: null },
    nutrition_meal_plan_weeks: { id: "week-a", user_id: USER_ID, week_start_date: "2026-08-24", revision: 2 },
    nutrition_planned_occurrences: { id: "occurrence-a", user_id: USER_ID, week_id: "week-a", frozen_snapshot: { nutrition: { calories: 650, protein_g: null } } },
    nutrition_cooking_sessions: { id: "cooking-a", user_id: USER_ID, frozen_recipe_snapshot: { recipe_version_id: "version-a" } },
    nutrition_cooking_timers: { id: "timer-a", user_id: USER_ID, cooking_session_id: "cooking-a", duration_seconds: 300 },
  };

  const from = vi.fn((table: string) => {
    const call: QueryCall = { table, filters: [] };
    calls.push(call);
    let range: [number, number] | null = null;
    const rows = () => canonicalRows[table] ? [canonicalRows[table]] : [];
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.eq = vi.fn((field: string, value: unknown) => { call.filters.push([field, value]); return builder; });
    builder.in = vi.fn(() => builder);
    builder.order = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    builder.range = vi.fn((fromIndex: number, toIndex: number) => { range = [fromIndex, toIndex]; return builder; });
    builder.maybeSingle = vi.fn(async () => ({
      data: table === "profiles" ? { id: USER_ID, email: "user@example.test", role: "member" } : null,
      error: null,
    }));
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      const allRows = rows();
      const data = range ? allRows.slice(range[0], range[1] + 1) : allRows;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    };
    return builder;
  });

  return { client: { from } as unknown as SupabaseClient, calls };
}

function deletionClient() {
  const storageCalls: Array<{ bucket: string; action: "list" | "remove"; paths?: string[]; prefix?: string }> = [];
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    builder.select = vi.fn(() => builder);
    builder.update = vi.fn(() => builder);
    builder.upsert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.eq = vi.fn(() => builder);
    builder.is = vi.fn(() => builder);
    builder.limit = vi.fn(() => builder);
    const result = () => {
      if (table === "privacy_deletion_legal_holds") return { data: null, error: null };
      if (table === "user_integrations") return { data: [], error: null };
      if (table === "progress_photos") return { data: [], error: null };
      if (table === "nutrition_recipes") return { data: [{ cover_path: `${USER_ID}/manifest-cover.jpg` }], error: null };
      return { data: null, error: null };
    };
    builder.maybeSingle = vi.fn(async () => result());
    builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject);
    return builder;
  });

  const storage = {
    from: vi.fn((bucket: string) => ({
      list: vi.fn(async (prefix: string) => {
        storageCalls.push({ bucket, action: "list", prefix });
        if (bucket === "recipe-covers" && prefix === USER_ID) {
          return { data: [{ id: "cover-object", name: "discovered-cover.jpg" }], error: null };
        }
        return { data: [], error: null };
      }),
      remove: vi.fn(async (paths: string[]) => {
        storageCalls.push({ bucket, action: "remove", paths });
        return { data: [], error: null };
      }),
    })),
  };

  const client = {
    from,
    storage,
    rpc: vi.fn(async () => ({
      data: { application_data_purged: true, profiles_deleted: 1 },
      error: null,
    })),
    auth: {
      admin: {
        updateUserById: vi.fn(async () => ({ error: null })),
        deleteUser: vi.fn(async () => ({ error: null })),
      },
    },
  } as unknown as SupabaseClient;

  return { client, storageCalls };
}

describe("Nutrition V1 privacy behavior", () => {
  it("exports the canonical Nutrition owner graph with frozen consumer lineage", async () => {
    const { client, calls } = canonicalExportClient();
    const payload = await buildCurrentUserDataExport(client, {
      id: USER_ID,
      email: "user@example.test",
      created_at: "2026-01-01T00:00:00.000Z",
    });

    const nutrition = payload.data.nutrition as Record<string, unknown>;
    expect(nutrition.recipe_versions).toEqual([expect.objectContaining({ id: "version-a", frozen_nutrition: { calories: 500, protein_g: null } })]);
    expect(nutrition.recipe_drafts).toEqual([expect.objectContaining({ id: "draft-a" })]);
    expect(nutrition.saved_meals_v1).toEqual([expect.objectContaining({ id: "saved-meal-a" })]);
    expect(nutrition.saved_meal_items_v1).toEqual([expect.objectContaining({ id: "saved-item-a", frozen_item_snapshot: { calories: 250, protein_g: null } })]);
    expect(nutrition.target_periods).toEqual([expect.objectContaining({ id: "target-a", protein_g: null })]);
    expect(nutrition.meal_plan_weeks).toEqual([expect.objectContaining({ id: "week-a", revision: 2 })]);
    expect(nutrition.planned_occurrences).toEqual([expect.objectContaining({ id: "occurrence-a", frozen_snapshot: { nutrition: { calories: 650, protein_g: null } } })]);
    expect(nutrition.cooking_sessions).toEqual([expect.objectContaining({ id: "cooking-a", frozen_recipe_snapshot: { recipe_version_id: "version-a" } })]);
    expect(nutrition.cooking_timers).toEqual([expect.objectContaining({ id: "timer-a", duration_seconds: 300 })]);

    for (const table of [
      "nutrition_recipes",
      "nutrition_recipe_versions",
      "nutrition_recipe_drafts",
      "nutrition_saved_meals",
      "nutrition_saved_meal_items",
      "nutrition_target_periods",
      "nutrition_meal_plan_weeks",
      "nutrition_planned_occurrences",
      "nutrition_cooking_sessions",
      "nutrition_cooking_timers",
    ]) {
      expect(calls.find((call) => call.table === table)?.filters).toContainEqual(["user_id", USER_ID]);
    }
  });

  it("removes both recorded and discovered owner Recipe covers before database/Auth deletion", async () => {
    const { client, storageCalls } = deletionClient();
    const result = await processAccountDeletionJob(client, {
      id: "job-a",
      request_id: "request-a",
      user_id: USER_ID,
      state: "processing",
      stage: "queued",
      attempt_count: 1,
      evidence: {},
      notification_recipient_ciphertext: null,
    });

    expect(result).toMatchObject({ state: "completed" });
    expect(storageCalls).toContainEqual({ bucket: "recipe-covers", action: "list", prefix: USER_ID });
    expect(storageCalls).toContainEqual({
      bucket: "recipe-covers",
      action: "remove",
      paths: [`${USER_ID}/manifest-cover.jpg`, `${USER_ID}/discovered-cover.jpg`],
    });
  });
});
