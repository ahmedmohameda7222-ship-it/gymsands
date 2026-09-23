import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SavedMealItemInput, SavedMealItemWriteIntent } from "@/services/nutrition-v1/server/saved-meals";
import {
  resolveCurrentGenerationFoodsForNewUseBatchFromSupabase,
  type CurrentGenerationFoodView,
} from "@/services/food-catalog/server/current-generation-service";
import {
  MY_FOOD_HANDOFF_AUTHORITY_SELECT,
  resolveCatalogNewUseSelectionFromResolvedAuthority,
  resolveFoodHandoffFromResolvedCatalogOwnerAuthority,
  resolveMyFoodHandoffFromResolvedAuthority,
  type MyFoodHandoffAuthority,
} from "@/services/nutrition-v1/server/food-handoff";
import {
  readCurrentPersonalOverride,
  type CurrentPersonalOverride,
} from "@/services/nutrition-v1/server/personal-overrides";
import { resolveRecipeHandoff } from "@/services/nutrition-v1/server/recipe-handoff";

async function hydrateMyFoodAuthorities(
  supabase: SupabaseClient,
  userId: string,
  foodIds: readonly string[],
): Promise<Map<string, MyFoodHandoffAuthority>> {
  const uniqueFoodIds = Array.from(new Set(foodIds));
  const authorities = new Map<string, MyFoodHandoffAuthority>();
  if (!uniqueFoodIds.length) return authorities;

  const own = await supabase
    .from("user_food_items")
    .select(MY_FOOD_HANDOFF_AUTHORITY_SELECT)
    .eq("user_id", userId)
    .in("id", uniqueFoodIds)
    .is("deleted_at", null);
  if (own.error) {
    throw new Error(`Personal Food identity could not be validated. ${own.error.message ?? "Database request failed."}`);
  }

  const requested = new Set(uniqueFoodIds);
  for (const value of own.data ?? []) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("Personal Food identity could not be validated.");
    }
    const row = value as unknown as MyFoodHandoffAuthority;
    if (
      typeof row.id !== "string"
      || !requested.has(row.id)
      || row.user_id !== userId
      || row.deleted_at !== null
      || authorities.has(row.id)
    ) {
      throw new Error("Personal Food identity could not be validated.");
    }
    authorities.set(row.id, row);
  }
  return authorities;
}

const PERSONAL_OVERRIDE_READ_CONCURRENCY = 6;

async function hydrateCatalogPersonalOverrides(
  ownerSupabase: SupabaseClient,
  catalogViews: ReadonlyMap<string, CurrentGenerationFoodView>,
): Promise<Map<string, CurrentPersonalOverride>> {
  const resolvedFoodIds = Array.from(new Set(
    Array.from(catalogViews.values()).map((view) => view.resolvedFoodId),
  ));
  const overrides = new Map<string, CurrentPersonalOverride>();

  for (let index = 0; index < resolvedFoodIds.length; index += PERSONAL_OVERRIDE_READ_CONCURRENCY) {
    const chunk = resolvedFoodIds.slice(index, index + PERSONAL_OVERRIDE_READ_CONCURRENCY);
    const resolved = await Promise.all(
      chunk.map(async (foodId) => [
        foodId,
        await readCurrentPersonalOverride(ownerSupabase, foodId),
      ] as const),
    );
    for (const [foodId, personalOverride] of resolved) {
      overrides.set(foodId, personalOverride);
    }
  }
  return overrides;
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

function recoverFrozenCatalogSelectionIdentity(
  view: CurrentGenerationFoodView,
  personalOverride: CurrentPersonalOverride,
  frozenName: string,
  frozenServingLabel: string,
  writeLanguageTag: string | null,
) {
  const selectedIds = new Set(view.selections.nameFactIds);
  const exactTextMatches = view.names.filter((name) => (
    selectedIds.has(name.id)
    && name.foodId === view.resolvedFoodId
    && name.text.trim() === frozenName.trim()
  ));
  const selectedName = disambiguateFrozenNameLocale(exactTextMatches, writeLanguageTag);
  const selection = resolveCatalogNewUseSelectionFromResolvedAuthority(view, selectedName, personalOverride);
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

  const uniqueFoodIds = Array.from(new Set(
    items.flatMap((item) => item.kind === "food" ? [item.food_id] : []),
  ));
  const myFoodAuthorities = await hydrateMyFoodAuthorities(ownerSupabase, userId, uniqueFoodIds);
  const catalogFoodIds = uniqueFoodIds.filter((foodId) => !myFoodAuthorities.has(foodId));
  const catalogViews = await resolveCurrentGenerationFoodsForNewUseBatchFromSupabase(
    catalogSupabase,
    catalogFoodIds,
  );
  const catalogPersonalOverrides = await hydrateCatalogPersonalOverrides(
    ownerSupabase,
    catalogViews,
  );

  for (const item of items) {
    if (item.kind === "food") {
      const myFoodAuthority = myFoodAuthorities.get(item.food_id) ?? null;
      const source = myFoodAuthority === null ? "catalog" : "my_food";

      const itemLanguageTag = typeof item.languageTag === "string" && item.languageTag.trim()
        ? item.languageTag.trim()
        : null;

      if (source === "catalog") {
        const view = catalogViews.get(item.food_id);
        if (!view) {
          throw new Error("Saved Meal Catalog Food could not be resolved in the current generation.");
        }
        const personalOverride = catalogPersonalOverrides.get(view.resolvedFoodId);
        if (!personalOverride) {
          throw new Error("Saved Meal Catalog owner authority could not be resolved.");
        }
        const recoveredCatalogIdentity = itemLanguageTag === null
          ? recoverFrozenCatalogSelectionIdentity(
              view,
              personalOverride,
              item.frozen_name,
              item.resolved_serving_label,
              normalizedWriteLanguageTag,
            )
          : null;
        const resolved = resolveFoodHandoffFromResolvedCatalogOwnerAuthority(
          userId,
          view,
          personalOverride,
          {
            foodId: item.food_id,
            source: "catalog",
            quantity: item.resolved_quantity,
            serving: item.resolved_serving_label,
            displayName: item.frozen_name,
            languageTag: recoveredCatalogIdentity?.languageTag ?? itemLanguageTag,
            servingOptionId: recoveredCatalogIdentity
              ? recoveredCatalogIdentity.servingOptionId
              : item.servingOptionId ?? null,
          },
        );
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

      if (myFoodAuthority === null) {
        throw new Error("Saved Meal Personal Food authority could not be resolved.");
      }
      const resolved = resolveMyFoodHandoffFromResolvedAuthority(userId, myFoodAuthority, {
        foodId: item.food_id,
        source: "my_food",
        quantity: item.resolved_quantity,
        serving: item.resolved_serving_label,
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
