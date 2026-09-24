// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const FOOD_ID = "22222222-2222-4222-8222-222222222222";
const SERVING_A = "33333333-3333-4333-8333-333333333333";
const SERVING_B = "44444444-4444-4444-8444-444444444444";

const mocks = vi.hoisted(() => ({
  getFoodCategories: vi.fn(async () => [] as string[]),
  getFoodLibrary: vi.fn(),
  getCatalogNewUseSelection: vi.fn(),
  addGlobalFoodToToday: vi.fn(),
  addCustomFoodLog: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    user: { id: USER_ID },
    session: { access_token: "token" },
  }),
}));

vi.mock("@/lib/i18n/eat", () => ({
  useEatTranslation: () => ({
    et: (key: string) => key,
    locale: "en-US",
    formatDate: (value: string) => value,
    mealLabel: (value: string) => value,
  }),
}));

vi.mock("@/components/ui/dialog", () => {
  const shell = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Dialog: shell,
    DialogContent: shell,
    DialogDescription: shell,
    DialogHeader: shell,
    DialogTitle: shell,
  };
});

vi.mock("@/services/database/nutrition", () => ({
  getFoodCategories: mocks.getFoodCategories,
  getFoodLibrary: mocks.getFoodLibrary,
  getCatalogNewUseSelection: mocks.getCatalogNewUseSelection,
  addGlobalFoodToToday: mocks.addGlobalFoodToToday,
  addCustomFoodLog: mocks.addCustomFoodLog,
  getCustomMeals: vi.fn(async () => []),
  withCatalogServingChoice: (
    food: Record<string, unknown>,
    choice: {
      servingOptionId: string | null;
      label: string;
      nutrition?: {
        calories: number | null;
        protein_g: number | null;
        carbs_g: number | null;
        fat_g: number | null;
        fiber_g?: number | null;
        sugars_g?: number | null;
        sodium_mg?: number | null;
      };
    },
  ) => ({
    ...food,
    serving_size: choice.label,
    serving_option_id: choice.servingOptionId,
    ...(choice.nutrition ? {
      calories: choice.nutrition.calories,
      protein_g: choice.nutrition.protein_g,
      carbs_g: choice.nutrition.carbs_g,
      fat_g: choice.nutrition.fat_g,
      fiber_g: choice.nutrition.fiber_g ?? null,
      sugar_g: choice.nutrition.sugars_g ?? null,
      sodium_mg: choice.nutrition.sodium_mg ?? null,
    } : {}),
  }),
}));

vi.mock("@/services/database/eat", () => ({
  copyEatFoodLogs: vi.fn(),
  getEatFoodLogs: vi.fn(),
  logRepeatFood: vi.fn(),
}));

vi.mock("@/services/database/eat-food-logging", () => ({
  logSavedMealToEat: vi.fn(),
}));

import { EatAddFoodSurface } from "@/components/meals/eat-add-food-surface";

const catalogFood = {
  id: FOOD_ID,
  food_name: "Catalog yogurt",
  serving_size: "",
  serving_option_id: null,
  calories: 100,
  protein_g: 10,
  carbs_g: 12,
  fat_g: 2,
  category: "dairy",
  cuisine: null,
  kitchen_id: null,
  subcategory_id: null,
  fiber_g: null,
  sugar_g: null,
  sodium_mg: null,
  tags: [],
  notes: null,
  source_type: "food_catalog_v2",
  locale: "en",
  is_global: true,
  is_editable_by_user: false,
};

const choices = [
  {
    servingOptionId: SERVING_A,
    label: "170 g",
    source: "generation" as const,
    nutrition: {
      calories: 170,
      protein_g: 17,
      carbs_g: 20.4,
      fat_g: 3.4,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 1,
      basis_unit: "serving" as const,
    },
  },
  {
    servingOptionId: SERVING_B,
    label: "1 cup",
    source: "generation" as const,
    nutrition: {
      calories: 240,
      protein_g: 24,
      carbs_g: 28.8,
      fat_g: 4.8,
      saturated_fat_g: null,
      fiber_g: null,
      sugars_g: null,
      sodium_mg: null,
      basis_amount: 1,
      basis_unit: "serving" as const,
    },
  },
];

function exactButton(host: HTMLElement, text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === text);
  if (!(button instanceof HTMLButtonElement)) throw new Error(`Button "${text}" not rendered.`);
  return button;
}

async function flush(ms = 0) {
  await act(async () => {
    await Promise.resolve();
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.resolve();
  });
}

describe("Eat search authoritative Catalog serving selection", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFoodLibrary.mockResolvedValue([catalogFood]);
    mocks.getCatalogNewUseSelection.mockResolvedValue({
      foodId: FOOD_ID,
      name: "Catalog yogurt",
      languageTag: "en",
      servingChoices: choices,
    });
    mocks.addGlobalFoodToToday.mockResolvedValue({ id: "log-1" });
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

  it("presents exact multi-serving authority in Eat search before allowing a Catalog log", async () => {
    await act(async () => {
      root.render(createElement(EatAddFoodSurface, {
        open: true,
        onOpenChange: vi.fn(),
        selectedDate: "2026-09-22",
        initialMealType: "Lunch",
        initialView: "search",
        repeats: [],
        targetLogs: [],
        energyUnit: "kcal",
        onFoodLogged: vi.fn(),
        onPhotoPrompt: vi.fn(),
      }));
    });
    await flush(320);

    expect(host.textContent).toContain("Catalog yogurt");
    expect(host.textContent).not.toContain("100 g");

    await act(async () => { exactButton(host, "logFood").click(); });
    await flush();

    expect(mocks.getCatalogNewUseSelection).toHaveBeenCalledWith(expect.objectContaining({ id: FOOD_ID }));
    expect(mocks.addGlobalFoodToToday).not.toHaveBeenCalled();

    const select = host.querySelector('select[aria-label="Authoritative serving for Catalog yogurt"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(exactButton(host, "logFood").disabled).toBe(true);

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
      if (!setter) throw new Error("Select setter unavailable.");
      setter.call(select, SERVING_B);
      select?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await flush();

    expect(host.textContent).toContain("1 cup");
    expect(host.textContent).toContain("240 kcal");
    expect(exactButton(host, "logFood").disabled).toBe(false);

    await act(async () => { exactButton(host, "logFood").click(); });
    await flush();

    expect(mocks.addGlobalFoodToToday).toHaveBeenCalledWith(expect.objectContaining({
      userId: USER_ID,
      quantity: 1,
      mealType: "Lunch",
      date: "2026-09-22",
      food: expect.objectContaining({
        id: FOOD_ID,
        serving_size: "1 cup",
        serving_option_id: SERVING_B,
        calories: 240,
        protein_g: 24,
      }),
    }));
  });
});
