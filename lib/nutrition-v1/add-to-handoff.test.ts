import { describe, expect, it } from "vitest";

import { parseAddToHandoff } from "@/lib/nutrition-v1/add-to-handoff";

describe("Nutrition V1 Add To handoff parsing", () => {
  it("preserves Food identity, selected display name/language, serving and quantity for each contextual destination", () => {
    const base = "source=catalog&quantity=1.5&serving=170%20g&displayName=Greek%20yogurt&languageTag=en";
    const expected = {
      type: "food",
      id: "f1",
      source: "catalog",
      quantity: 1.5,
      serving: "170 g",
      displayName: "Greek yogurt",
      languageTag: "en",
    };
    expect(parseAddToHandoff(new URLSearchParams(`addFoodId=f1&${base}`), "diary")).toEqual(expected);
    expect(parseAddToHandoff(new URLSearchParams(`addFoodId=f1&${base}`), "meal_plan")).toEqual(expected);
    expect(parseAddToHandoff(new URLSearchParams(`savedMealFoodId=f1&${base}`), "saved_meal")).toEqual(expected);
    expect(parseAddToHandoff(new URLSearchParams(`ingredientFoodId=f1&${base}`), "recipe")).toEqual(expected);
  });

  it("requires selected display-name context for catalog handoffs but keeps My Foods independent", () => {
    const missingName = "source=catalog&quantity=1&serving=170%20g";
    expect(parseAddToHandoff(new URLSearchParams(`addFoodId=f1&${missingName}`), "diary")).toBeNull();

    const mine = "source=my_food&quantity=1&serving=1%20bowl";
    expect(parseAddToHandoff(new URLSearchParams(`addFoodId=f1&${mine}`), "diary")).toEqual({
      type: "food",
      id: "f1",
      source: "my_food",
      quantity: 1,
      serving: "1 bowl",
      displayName: null,
      languageTag: null,
    });
  });

  it("preserves exact Recipe version identity and resolved serving quantity for Diary, Meal Plan and Saved Meal", () => {
    const params = "source=recipe&recipeId=r1&recipeVersionId=v2&quantity=2.5";
    expect(parseAddToHandoff(new URLSearchParams(params), "diary")).toEqual({ type: "recipe", id: "r1", versionId: "v2", quantity: 2.5 });
    expect(parseAddToHandoff(new URLSearchParams(params), "meal_plan")).toEqual({ type: "recipe", id: "r1", versionId: "v2", quantity: 2.5 });
    expect(parseAddToHandoff(new URLSearchParams(`${params}&destination=saved_meal`), "saved_meal")).toEqual({ type: "recipe", id: "r1", versionId: "v2", quantity: 2.5 });
    expect(parseAddToHandoff(new URLSearchParams(`${params}&destination=saved_meal`), "diary")).toBeNull();
  });

  it("defaults legacy Recipe handoffs to one serving but rejects invalid explicit quantities", () => {
    const base = "source=recipe&recipeId=r1&recipeVersionId=v2";
    expect(parseAddToHandoff(new URLSearchParams(base), "diary")).toEqual({ type: "recipe", id: "r1", versionId: "v2", quantity: 1 });
    expect(parseAddToHandoff(new URLSearchParams(`${base}&quantity=0`), "diary")).toBeNull();
    expect(parseAddToHandoff(new URLSearchParams(`${base}&quantity=not-a-number`), "diary")).toBeNull();
  });
});
