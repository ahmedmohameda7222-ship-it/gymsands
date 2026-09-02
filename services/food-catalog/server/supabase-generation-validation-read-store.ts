import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  validateGenerationFoodSelection,
  validateGenerationRedirectSelection,
  type GenerationLifecycle,
} from "@/lib/food-catalog/domain/generations";
import type {
  StoredGenerationFood,
  StoredGenerationRedirect,
} from "./generation-contracts";
import type { FoodCatalogGenerationValidationReadStore } from "./generation-store";
import { createSupabaseFoodCatalogGenerationReadStore } from "./supabase-generation-read-store";

const GENERATION_ENUMERATION_PAGE_SIZE = 1000;

function rows(value: unknown, context: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new Error(`Food Catalog Plan 3 validation read: ${context} result must be an array.`);
  }
  return value.map((row) => {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new Error(`Food Catalog Plan 3 validation read: ${context} row is invalid.`);
    }
    return row as Record<string, unknown>;
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Food Catalog Plan 3 validation read: ${label} must be nonblank.`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function throwDbError(context: string, error: { message?: string } | null): void {
  if (error) {
    throw new Error(`Food Catalog Plan 3 validation read: ${context} failed: ${error.message ?? "database error"}`);
  }
}

function mapFood(value: Record<string, unknown>): StoredGenerationFood {
  const generationId = requiredString(value.generation_id, "generation Food generation_id");
  const selection = validateGenerationFoodSelection({
    foodId: requiredString(value.food_id, "generation Food food_id"),
    lifecycle: requiredString(value.lifecycle, "generation Food lifecycle") as GenerationLifecycle,
    nutritionRevisionId: nullableString(value.nutrition_revision_id, "generation Food nutrition_revision_id"),
    activationSetId: nullableString(value.activation_set_id, "generation Food activation_set_id"),
    activationSetMemberId: nullableString(value.activation_set_member_id, "generation Food activation_set_member_id"),
    activationGrantEventId: nullableString(value.activation_grant_event_id, "generation Food activation_grant_event_id"),
  });
  return { generationId, ...selection };
}

function mapRedirect(value: Record<string, unknown>): StoredGenerationRedirect {
  const generationId = requiredString(value.generation_id, "generation redirect generation_id");
  const redirect = validateGenerationRedirectSelection({
    sourceFoodId: requiredString(value.source_food_id, "generation redirect source_food_id"),
    targetFoodId: requiredString(value.target_food_id, "generation redirect target_food_id"),
  });
  return { generationId, ...redirect };
}

export function createSupabaseFoodCatalogGenerationValidationReadStore(
  supabase: SupabaseClient,
): FoodCatalogGenerationValidationReadStore {
  const base = createSupabaseFoodCatalogGenerationReadStore(supabase);
  return {
    ...base,
    async readGenerationFoods(generationId) {
      const resultRows: StoredGenerationFood[] = [];
      for (let offset = 0; ; offset += GENERATION_ENUMERATION_PAGE_SIZE) {
        const result = await supabase
          .from("food_catalog_generation_foods")
          .select("generation_id,food_id,lifecycle,nutrition_revision_id,activation_set_id,activation_set_member_id,activation_grant_event_id")
          .eq("generation_id", generationId)
          .order("food_id", { ascending: true })
          .range(offset, offset + GENERATION_ENUMERATION_PAGE_SIZE - 1);
        throwDbError("generation Foods", result.error);
        const page = rows(result.data, "generation Foods");
        resultRows.push(...page.map(mapFood));
        if (page.length < GENERATION_ENUMERATION_PAGE_SIZE) return resultRows;
      }
    },
    async readGenerationRedirects(generationId) {
      const resultRows: StoredGenerationRedirect[] = [];
      for (let offset = 0; ; offset += GENERATION_ENUMERATION_PAGE_SIZE) {
        const result = await supabase
          .from("food_catalog_generation_redirects")
          .select("generation_id,source_food_id,target_food_id")
          .eq("generation_id", generationId)
          .order("source_food_id", { ascending: true })
          .range(offset, offset + GENERATION_ENUMERATION_PAGE_SIZE - 1);
        throwDbError("generation redirects", result.error);
        const page = rows(result.data, "generation redirects");
        resultRows.push(...page.map(mapRedirect));
        if (page.length < GENERATION_ENUMERATION_PAGE_SIZE) return resultRows;
      }
    },
  };
}
