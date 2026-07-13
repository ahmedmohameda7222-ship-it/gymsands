import type { NutritionPreferenceInput } from "@/services/database/execution-layer";

export type FoodPreferencesDraft = Omit<
  NutritionPreferenceInput,
  "weekly_food_budget" | "max_cooking_time_minutes" | "meals_per_day"
> & {
  weekly_food_budget: string;
  max_cooking_time_minutes: string;
  meals_per_day: string;
};

export type FoodPreferencesPhase =
  | "idle"
  | "loading"
  | "loaded-existing"
  | "loaded-empty"
  | "load-error"
  | "saving"
  | "save-error";

export type FoodPreferencesState = {
  phase: FoodPreferencesPhase;
  form: FoodPreferencesDraft | null;
  saved: FoodPreferencesDraft | null;
  loadError: string | null;
  saveError: string | null;
};

export type FoodPreferencesAction =
  | { type: "load-start" }
  | { type: "load-success"; value: NutritionPreferenceInput | null }
  | { type: "load-error"; message: string }
  | { type: "change"; value: FoodPreferencesDraft }
  | { type: "save-start" }
  | { type: "save-success"; value: NutritionPreferenceInput }
  | { type: "save-error"; message: string };

export type FoodPreferencesValidationErrors = Partial<
  Record<"weekly_food_budget" | "max_cooking_time_minutes" | "meals_per_day", "non-negative-number" | "cooking-time" | "meals-per-day">
>;

export const emptyNutritionPreferenceInput: NutritionPreferenceInput = {
  weekly_food_budget: null,
  budget_currency: "EUR",
  max_cooking_time_minutes: null,
  meal_prep_days: [],
  cooking_skill: null,
  kitchen_equipment: [],
  preferred_cuisines: [],
  disliked_foods: [],
  allergies: null,
  repeat_tolerance: null,
  meals_per_day: null,
  ingredient_reuse_preference: null,
  grocery_style_preference: null
};

export const initialFoodPreferencesState: FoodPreferencesState = {
  phase: "idle",
  form: null,
  saved: null,
  loadError: null,
  saveError: null
};

export function nutritionPreferenceInputToDraft(input: NutritionPreferenceInput): FoodPreferencesDraft {
  return {
    ...input,
    meal_prep_days: [...input.meal_prep_days],
    kitchen_equipment: [...input.kitchen_equipment],
    preferred_cuisines: [...input.preferred_cuisines],
    disliked_foods: [...input.disliked_foods],
    weekly_food_budget: input.weekly_food_budget === null ? "" : String(input.weekly_food_budget),
    max_cooking_time_minutes: input.max_cooking_time_minutes === null ? "" : String(input.max_cooking_time_minutes),
    meals_per_day: input.meals_per_day === null ? "" : String(input.meals_per_day)
  };
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

export function validateFoodPreferencesDraft(draft: FoodPreferencesDraft): FoodPreferencesValidationErrors {
  const errors: FoodPreferencesValidationErrors = {};
  const budget = optionalNumber(draft.weekly_food_budget);
  if (budget !== null && (!Number.isFinite(budget) || budget < 0)) {
    errors.weekly_food_budget = "non-negative-number";
  }

  const cookingTime = optionalNumber(draft.max_cooking_time_minutes);
  if (cookingTime !== null && (!Number.isInteger(cookingTime) || cookingTime < 1 || cookingTime > 1440)) {
    errors.max_cooking_time_minutes = "cooking-time";
  }

  const mealsPerDay = optionalNumber(draft.meals_per_day);
  if (mealsPerDay !== null && (!Number.isInteger(mealsPerDay) || mealsPerDay < 1 || mealsPerDay > 12)) {
    errors.meals_per_day = "meals-per-day";
  }
  return errors;
}

export function foodPreferencesDraftToInput(draft: FoodPreferencesDraft): NutritionPreferenceInput {
  if (Object.keys(validateFoodPreferencesDraft(draft)).length) {
    throw new Error("Food preference numeric fields are invalid.");
  }
  return {
    ...draft,
    meal_prep_days: [...draft.meal_prep_days],
    kitchen_equipment: [...draft.kitchen_equipment],
    preferred_cuisines: [...draft.preferred_cuisines],
    disliked_foods: [...draft.disliked_foods],
    weekly_food_budget: optionalNumber(draft.weekly_food_budget),
    max_cooking_time_minutes: optionalNumber(draft.max_cooking_time_minutes),
    meals_per_day: optionalNumber(draft.meals_per_day)
  };
}

export function foodPreferencesReducer(state: FoodPreferencesState, action: FoodPreferencesAction): FoodPreferencesState {
  switch (action.type) {
    case "load-start":
      return { phase: "loading", form: null, saved: null, loadError: null, saveError: null };
    case "load-success": {
      if (action.value === null) {
        const draft = nutritionPreferenceInputToDraft(emptyNutritionPreferenceInput);
        return {
          phase: "loaded-empty",
          form: draft,
          saved: draft,
          loadError: null,
          saveError: null
        };
      }
      const draft = nutritionPreferenceInputToDraft(action.value);
      return {
        phase: "loaded-existing",
        form: draft,
        saved: draft,
        loadError: null,
        saveError: null
      };
    }
    case "load-error":
      return { phase: "load-error", form: null, saved: null, loadError: action.message, saveError: null };
    case "change":
      if (!state.form || !foodPreferencesCanEdit(state)) return state;
      return { ...state, form: action.value, saveError: null };
    case "save-start":
      if (!state.form || !foodPreferencesCanEdit(state)) return state;
      return { ...state, phase: "saving", saveError: null };
    case "save-success": {
      const draft = nutritionPreferenceInputToDraft(action.value);
      return { phase: "loaded-existing", form: draft, saved: draft, loadError: null, saveError: null };
    }
    case "save-error":
      if (!state.form || !state.saved) return state;
      return { ...state, phase: "save-error", saveError: action.message };
  }
}

export function foodPreferencesCanEdit(state: FoodPreferencesState) {
  return state.phase === "loaded-existing" || state.phase === "loaded-empty" || state.phase === "save-error";
}

export function foodPreferencesIsDirty(state: FoodPreferencesState) {
  return Boolean(state.form && state.saved && JSON.stringify(state.form) !== JSON.stringify(state.saved));
}

export function foodPreferencesCanSave(state: FoodPreferencesState) {
  return foodPreferencesCanEdit(state)
    && foodPreferencesIsDirty(state)
    && Boolean(state.form)
    && Object.keys(validateFoodPreferencesDraft(state.form!)).length === 0;
}
