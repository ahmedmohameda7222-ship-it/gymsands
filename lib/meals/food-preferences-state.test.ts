import { describe, expect, it } from "vitest";
import {
  emptyNutritionPreferenceInput,
  foodPreferencesCanEdit,
  foodPreferencesCanSave,
  foodPreferencesDraftToInput,
  foodPreferencesIsDirty,
  foodPreferencesReducer,
  initialFoodPreferencesState,
  nutritionPreferenceInputToDraft,
  validateFoodPreferencesDraft
} from "@/lib/meals/food-preferences-state";

const existing = {
  ...emptyNutritionPreferenceInput,
  weekly_food_budget: 80,
  max_cooking_time_minutes: 30,
  meals_per_day: 4,
  preferred_cuisines: ["Egyptian"]
};

describe("Food Preferences state", () => {
  it("loads an existing profile as editable saved state", () => {
    const state = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-success", value: existing });
    expect(state.phase).toBe("loaded-existing");
    expect(state.form?.weekly_food_budget).toBe("80");
    expect(foodPreferencesCanEdit(state)).toBe(true);
    expect(foodPreferencesIsDirty(state)).toBe(false);
  });

  it("treats a successful null result as a legitimate editable empty profile", () => {
    const state = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-success", value: null });
    expect(state.phase).toBe("loaded-empty");
    expect(state.form?.weekly_food_budget).toBe("");
    expect(foodPreferencesCanEdit(state)).toBe(true);
  });

  it("keeps load failure non-editable and non-saveable", () => {
    const state = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-error", message: "offline" });
    expect(state.phase).toBe("load-error");
    expect(state.form).toBeNull();
    expect(foodPreferencesCanEdit(state)).toBe(false);
    expect(foodPreferencesCanSave(state)).toBe(false);
  });

  it("restores the saved profile after a retry succeeds", () => {
    const failed = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-error", message: "offline" });
    const loading = foodPreferencesReducer(failed, { type: "load-start" });
    const recovered = foodPreferencesReducer(loading, { type: "load-success", value: existing });
    expect(recovered.phase).toBe("loaded-existing");
    expect(recovered.form?.preferred_cuisines).toEqual(["Egyptian"]);
  });

  it("cannot turn failed loading into a blank overwrite", () => {
    const failed = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-error", message: "offline" });
    const attempted = foodPreferencesReducer(failed, {
      type: "change",
      value: nutritionPreferenceInputToDraft(emptyNutritionPreferenceInput)
    });
    expect(attempted).toEqual(failed);
    expect(foodPreferencesCanSave(attempted)).toBe(false);
  });

  it("rejects invalid numeric text and enables saving only after correction", () => {
    const loaded = foodPreferencesReducer(initialFoodPreferencesState, { type: "load-success", value: existing });
    const invalidDraft = { ...loaded.form!, weekly_food_budget: "abc", max_cooking_time_minutes: "0", meals_per_day: "2.5" };
    const invalid = foodPreferencesReducer(loaded, { type: "change", value: invalidDraft });
    expect(validateFoodPreferencesDraft(invalidDraft)).toEqual({
      weekly_food_budget: "non-negative-number",
      max_cooking_time_minutes: "cooking-time",
      meals_per_day: "meals-per-day"
    });
    expect(foodPreferencesCanSave(invalid)).toBe(false);

    const validDraft = { ...invalidDraft, weekly_food_budget: "0", max_cooking_time_minutes: "45", meals_per_day: "3" };
    const valid = foodPreferencesReducer(invalid, { type: "change", value: validDraft });
    expect(foodPreferencesCanSave(valid)).toBe(true);
    expect(foodPreferencesDraftToInput(validDraft)).toMatchObject({ weekly_food_budget: 0, max_cooking_time_minutes: 45, meals_per_day: 3 });
  });

  it("maps intentionally cleared optional numbers to null", () => {
    const draft = nutritionPreferenceInputToDraft(existing);
    const cleared = { ...draft, weekly_food_budget: "", max_cooking_time_minutes: "", meals_per_day: "" };
    expect(foodPreferencesDraftToInput(cleared)).toMatchObject({ weekly_food_budget: null, max_cooking_time_minutes: null, meals_per_day: null });
  });
});
