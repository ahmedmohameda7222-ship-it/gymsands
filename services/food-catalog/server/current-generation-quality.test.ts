import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getCurrentGenerationQuality } from "@/services/food-catalog/server/current-generation-quality";

type Result = { data: any; error: null | { message?: string } };

function query(result: Result) {
  const q: Record<string, any> = {};
  for (const method of ["select", "eq", "limit", "in", "order"]) q[method] = vi.fn(() => q);
  q.range = vi.fn(async (start: number, end: number) => ({
    data: Array.isArray(result.data) ? result.data.slice(start, end + 1) : result.data,
    error: result.error,
  }));
  q.maybeSingle = vi.fn(async () => result);
  q.then = (resolve: (value: Result) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function client(queues: Record<string, ReturnType<typeof query>[]>) {
  const copy = Object.fromEntries(Object.entries(queues).map(([table, items]) => [table, [...items]])) as Record<string, ReturnType<typeof query>[]>;
  const from = vi.fn((table: string) => {
    const next = copy[table]?.shift();
    if (!next) throw new Error(`Unexpected table ${table}`);
    return next;
  });
  return { supabase: { from } as unknown as SupabaseClient, from };
}

async function duplicateCountForNames(
  facts: Array<{ foodId: string; languageTag: string; normalizedText: string; nameText: string }>,
) {
  const generationId = "11111111-1111-4111-8111-111111111111";
  const foods = Array.from(new Set(facts.map((fact) => fact.foodId))).map((foodId) => ({
    food_id: foodId,
    nutrition_revision_id: null,
    lifecycle: "active",
  }));
  const selections = facts.map((fact, index) => ({
    food_id: fact.foodId,
    name_fact_id: `90000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  }));
  const names = facts.map((fact, index) => ({
    id: selections[index]!.name_fact_id,
    food_id: fact.foodId,
    language_tag: fact.languageTag,
    normalized_text: fact.normalizedText,
    name_text: fact.nameText,
  }));
  const db = client({
    food_catalog_current_generation: [query({ data: { current_generation_id: generationId }, error: null })],
    food_catalog_generation_foods: [query({ data: foods, error: null })],
    food_catalog_generation_names: [query({ data: selections, error: null })],
    food_names: [query({ data: names, error: null })],
  });
  return (await getCurrentGenerationQuality(db.supabase)).duplicateSelectedNames;
}

describe("Plan 7 current-generation admin Food quality", () => {
  it("reports unavailable metrics when there is no promoted generation and never falls back to food_items", async () => {
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: null }, error: null })],
    });

    await expect(getCurrentGenerationQuality(db.supabase)).resolves.toEqual({
      available: false,
      generationId: null,
      activeFoodCount: null,
      foodsMissingMacros: null,
      duplicateSelectedNames: null,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("measures exact active generation Foods, selected nutrition and selected names", async () => {
    const generationId = "11111111-1111-4111-8111-111111111111";
    const nutritionId = "22222222-2222-4222-8222-222222222222";
    const nameA = "33333333-3333-4333-8333-333333333333";
    const nameB = "44444444-4444-4444-8444-444444444444";
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: generationId }, error: null })],
      food_catalog_generation_foods: [query({
        data: [
          { food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nutrition_revision_id: nutritionId, lifecycle: "active" },
          { food_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", nutrition_revision_id: null, lifecycle: "active" },
        ],
        error: null,
      })],
      food_catalog_generation_names: [query({
        data: [
          { food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name_fact_id: nameA },
          { food_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name_fact_id: nameB },
        ],
        error: null,
      })],
      food_nutrition_revisions: [query({
        data: [{ id: nutritionId, calories: 100, protein_g: 10, carbs_g: 20, fat_g: 5 }],
        error: null,
      })],
      food_names: [query({
        data: [
          { id: nameA, language_tag: "en", normalized_text: "greek yogurt", name_text: "Greek yogurt" },
          { id: nameB, language_tag: "en", normalized_text: "greek yogurt", name_text: "Greek yoghurt" },
        ],
        error: null,
      })],
    });

    const quality = await getCurrentGenerationQuality(db.supabase);

    expect(quality).toEqual({
      available: true,
      generationId,
      activeFoodCount: 2,
      foodsMissingMacros: 1,
      duplicateSelectedNames: 1,
    });
    expect(db.from).not.toHaveBeenCalledWith("food_items");
  });

  it("does not count two selected same-key Name facts on one Food as a duplicate Food Name", async () => {
    const foodA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await expect(duplicateCountForNames([
      { foodId: foodA, languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
      { foodId: foodA, languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
    ])).resolves.toBe(0);
  });

  it("counts one duplicate key when two distinct Foods share language and normalized text", async () => {
    await expect(duplicateCountForNames([
      { foodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
      { foodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
    ])).resolves.toBe(1);
  });

  it("counts three same-key facts belonging to two Foods as one duplicate key", async () => {
    const foodA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const foodB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await expect(duplicateCountForNames([
      { foodId: foodA, languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
      { foodId: foodA, languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt alias" },
      { foodId: foodB, languageTag: "en", normalizedText: "yogurt", nameText: "Yoghurt" },
    ])).resolves.toBe(1);
  });

  it("keeps the same normalized text in different locales as separate quality keys", async () => {
    await expect(duplicateCountForNames([
      { foodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", languageTag: "en", normalizedText: "yogurt", nameText: "Yogurt" },
      { foodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", languageTag: "de", normalizedText: "yogurt", nameText: "Yogurt" },
    ])).resolves.toBe(0);
  });

  it("keeps different normalized text in the same locale as separate quality keys", async () => {
    await expect(duplicateCountForNames([
      { foodId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", languageTag: "en", normalizedText: "greek yogurt", nameText: "Greek yogurt" },
      { foodId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", languageTag: "en", normalizedText: "plain yogurt", nameText: "Plain yogurt" },
    ])).resolves.toBe(0);
  });

  it("counts NULL macro fields as unknown rather than zero", async () => {
    const generationId = "11111111-1111-4111-8111-111111111111";
    const nutritionId = "22222222-2222-4222-8222-222222222222";
    const db = client({
      food_catalog_current_generation: [query({ data: { current_generation_id: generationId }, error: null })],
      food_catalog_generation_foods: [query({
        data: [{ food_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", nutrition_revision_id: nutritionId, lifecycle: "active" }],
        error: null,
      })],
      food_catalog_generation_names: [query({ data: [], error: null })],
      food_nutrition_revisions: [query({
        data: [{ id: nutritionId, calories: 0, protein_g: null, carbs_g: 0, fat_g: 0 }],
        error: null,
      })],
    });

    const quality = await getCurrentGenerationQuality(db.supabase);

    expect(quality.foodsMissingMacros).toBe(1);
  });
});
