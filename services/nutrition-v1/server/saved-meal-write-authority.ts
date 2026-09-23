import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput, SavedMealItemWriteIntent } from "@/services/nutrition-v1/server/saved-meals";
import { resolveCurrentGenerationFoodForNewUseFromSupabase, type CurrentGenerationFoodView } from "@/services/food-catalog/server/current-generation-service";
import {
  resolveCatalogNewUseSelectionFromView,
  resolveFoodHandoffWithAuthorities,
} from "@/services/nutrition-v1/server/food-handoff";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

async function detectFoodSource(supabase: SupabaseClient, userId: string, foodId: string) {
  const own = await supabase
    .from("user_food_items")
    .select("id")
    .eq("id", foodId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (own.error) throw new Error(`Personal Food identity could not be validated. ${own.error.message ?? "Database request failed."}`);
  return own.data ? "my_food" as const : "catalog" as const;
}

function normalizedLanguageTag(value: string) {
  return value.trim().replace(/_/g, "-").toLowerCase();
}

function uniqueNameMatch(
  matches: CurrentGenerationFoodView["names"],
  message = "The frozen Saved Meal Food name is ambiguous in the current generation. Re-select the Food.",
) {
  if (matches.length === 1) return matches[0]!;
  if (matches.length > 1) throw new Error(message);
  return null;
}

function disambiguateFrozenNameLocale(
  matches: CurrentGenerationFoodView["names"],
  writeLanguageTag: string | null,
) {
  if (matches.length === 1) return matches[0]!;
  if (matches.length === 0) {
    throw new Error("The frozen Saved Meal Food name is no longer selected in the current generation. Re-select the Food.");
  }
  if (!writeLanguageTag) {
    throw new Error("The frozen Saved Meal Food name is ambiguous in the current generation. Re-select the Food.");
  }

  const requested = normalizedLanguageTag(writeLanguageTag);
  const requestedBase = requested.split("-")[0] ?? requested;

  const exact = uniqueNameMatch(matches.filter((name) => normalizedLanguageTag(name.languageTag) === requested));
  if (exact) return exact;

  if (requested.includes("-")) {
    const explicitBase = uniqueNameMatch(matches.filter((name) => normalizedLanguageTag(name.languageTag) === requestedBase));
    if (explicitBase) return explicitBase;
  }

  const family = uniqueNameMatch(matches.filter((name) => (
    (normalizedLanguageTag(name.languageTag).split("-")[0] ?? normalizedLanguageTag(name.languageTag)) === requestedBase
  )));
  if (family) return family;

  throw new Error("The frozen Saved Meal Food name is ambiguous in the current generation. Re-select the Food.");
}

async function recoverFrozenCatalogSelectionIdentity(
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  foodId: string,
  frozenName: string,
  frozenServingLabel: string,
  writeLanguageTag: string | null,
) {
  const view = await resolveCurrentGenerationFoodForNewUseFromSupabase(catalogSupabase, foodId);
  const selectedIds = new Set(view.selections.nameFactIds);
  const exactTextMatches = view.names.filter((name) => (
    selectedIds.has(name.id)
    && name.foodId === view.resolvedFoodId
    && name.text.trim() === frozenName.trim()
  ));
  const selectedName = disambiguateFrozenNameLocale(exactTextMatches, writeLanguageTag);
  const selection = await resolveCatalogNewUseSelectionFromView(ownerSupabase, view, selectedName);
  const servingMatches = selection.servingChoices.filter((choice) => (
    choice.label.trim() === frozenServingLabel.trim()
  ));

  if (servingMatches.length !== 1) {
    throw new Error("The frozen Saved Meal Food serving is ambiguous or no longer selected. Re-select the serving.");
  }

  return {
    languageTag: selectedName.languageTag,
    servingOptionId: servingMatches[0]!.servingOptionId,
  };
}

export async function canonicalizeSavedMealItems(
  ownerSupabase: SupabaseClient,
  catalogSupabase: SupabaseClient,
  userId: string,
  items: SavedMealItemWriteIntent[],
  writeLanguageTag: string | null = null,
): Promise<SavedMealItemInput[]> {
  const output: SavedMealItemInput[] = [];
  const normalizedWriteLanguageTag = typeof writeLanguageTag === "string" && writeLanguageTag.trim()
    ? writeLanguageTag.trim()
    : null;

  for (const item of items) {
    if (item.kind === "food") {
      const source = await detectFoodSource(ownerSupabase, userId, item.food_id);
      const itemLanguageTag = typeof item.languageTag === "string" && item.languageTag.trim()
        ? item.languageTag.trim()
        : null;
      const recoveredCatalogIdentity = source === "catalog" && itemLanguageTag === null
        ? await recoverFrozenCatalogSelectionIdentity(
            ownerSupabase,
            catalogSupabase,
            item.food_id,
            item.frozen_name,
            item.resolved_serving_label,
            normalizedWriteLanguageTag,
          )
        : null;
      const catalogSelectionIdentity = source === "catalog"
        ? {
            displayName: item.frozen_name,
            languageTag: recoveredCatalogIdentity?.languageTag ?? itemLanguageTag,
            servingOptionId: recoveredCatalogIdentity
              ? recoveredCatalogIdentity.servingOptionId
              : item.servingOptionId ?? null,
          }
        : {};
      const resolved = await resolveFoodHandoffWithAuthorities(ownerSupabase, catalogSupabase, userId, {
        foodId: item.food_id,
        source,
        quantity: item.resolved_quantity,
        serving: item.resolved_serving_label,
        ...catalogSelectionIdentity,
      });
      const frozen = resolved.savedMealItem;
      output.push({
        kind: "food",
        food_id: frozen.food_id,
        frozen_name: frozen.frozen_name,
        resolved_quantity: frozen.resolved_quantity,
        resolved_serving_label: frozen.resolved_serving_label,
        frozen_nutrition: frozen.frozen_nutrition,
      });
      continue;
    }
    if (item.kind === "recipe") {
      const resolved = await resolveRecipeHandoff(
        ownerSupabase,
        userId,
        item.recipe.recipe_id,
        item.recipe.recipe_version_id,
      );
      if (item.recipe.resolved_serving_quantity !== 1 || item.recipe.resolved_serving_label !== "1 serving") {
        throw new Error("Recipe serving must be re-resolved before saving this meal.");
      }
      output.push(resolved.savedMealItem);
      continue;
    }
    throw new Error("Saved Meal items must be canonical Food or Recipe snapshots.");
  }
  return output;
}
