// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({
    nt: (key: string) => key,
    locale: "en-US",
    dir: "ltr",
  }),
}));

import { FoodRow } from "@/components/nutrition/food-library/food-row";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

function candidate(source: "catalog" | "my_food", servingLabel: string | null): FoodLibraryCandidate {
  return {
    id: source === "catalog"
      ? "11111111-1111-4111-8111-111111111111"
      : "22222222-2222-4222-8222-222222222222",
    source,
    name: source === "catalog" ? "Catalog yogurt" : "My yogurt",
    brand: null,
    category: "dairy",
    cuisine: null,
    servingLabel,
    verified: source === "catalog",
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "en",
    aliases: [],
    nutrition: {
      calories: 100,
      protein_g: 10,
      carbs_g: 12,
      fat_g: 2,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 100,
      basis_unit: "g",
    },
  };
}

describe("FoodRow Catalog serving discovery boundary", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function render(food: FoodLibraryCandidate, onAdd = vi.fn()) {
    await act(async () => {
      root.render(createElement(FoodRow, {
        food,
        onOpen: vi.fn(),
        onAdd,
        onFavorite: vi.fn(),
      }));
    });
    return onAdd;
  }

  it("keeps Catalog Add enabled when SearchDocument serving is null so FoodDetail can resolve authoritative serving", async () => {
    const onAdd = await render(candidate("catalog", null));
    const add = host.querySelector('button[aria-label="addFoodNamed"]');
    expect(add).toBeInstanceOf(HTMLButtonElement);
    expect((add as HTMLButtonElement).disabled).toBe(false);

    await act(async () => { (add as HTMLButtonElement).click(); });
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("still disables My Food Add when its owner serving is missing", async () => {
    await render(candidate("my_food", null));
    const add = host.querySelector('button[aria-label="addFoodNamed"]');
    expect(add).toBeInstanceOf(HTMLButtonElement);
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });
});
