import { isUuid } from "@/lib/utils";

/** Validate only client-supplied shape before querying authoritative Foods/Recipes. */
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max;
}

function positive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function uuid(value: unknown): value is string {
  return typeof value === "string" && isUuid(value);
}

export function validateSavedMealWriteInput(
  body: Record<string, unknown>,
  requireOperationId = false,
): string | null {
  if (!text(body.name, 200)) return "Saved Meal name must be between 1 and 200 characters.";
  if (requireOperationId && !uuid(body.operationId)) return "Saved Meal operation ID is invalid.";
  if (body.note !== null && body.note !== undefined && typeof body.note !== "string") {
    return "Saved Meal note must be text or null.";
  }
  if (body.isFavorite !== undefined && typeof body.isFavorite !== "boolean") {
    return "Saved Meal favorite must be a boolean.";
  }
  if (body.writeLanguageTag !== null && body.writeLanguageTag !== undefined
    && typeof body.writeLanguageTag !== "string") {
    return "Saved Meal language tag must be text or null.";
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return "Saved Meal must contain between 1 and 100 Food or Recipe items.";
  }
  for (const item of body.items) {
    if (!record(item)) return "Saved Meal items must be Food or Recipe objects.";
    if (item.kind === "food") {
      if (!uuid(item.food_id) || !text(item.frozen_name, 300)
        || !text(item.resolved_serving_label, 300) || !positive(item.resolved_quantity)) {
        return "Saved Meal Food identity, serving, name or quantity is invalid.";
      }
      if ((item.languageTag !== null && item.languageTag !== undefined
        && typeof item.languageTag !== "string")
        || (item.servingOptionId !== null && item.servingOptionId !== undefined
          && typeof item.servingOptionId !== "string")) {
        return "Saved Meal Food selection must use text-based identifiers.";
      }
      continue;
    }
    if (item.kind === "recipe") {
      const recipe = item.recipe;
      if (!record(recipe) || !uuid(recipe.recipe_id) || !uuid(recipe.recipe_version_id)
        || recipe.resolved_serving_quantity !== 1 || recipe.resolved_serving_label !== "1 serving") {
        return "Saved Meal Recipe must use a current one-serving canonical handoff.";
      }
      continue;
    }
    return "Saved Meal items must be canonical Food or Recipe snapshots.";
  }
  return null;
}
