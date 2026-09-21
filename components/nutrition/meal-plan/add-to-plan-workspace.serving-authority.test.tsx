// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  mealPlanApi: vi.fn(),
  mealPlanApiFetch: vi.fn(),
}));

vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({
    nt: (key: string) => key,
    language: "en",
    dir: "ltr",
  }),
}));
vi.mock("@/components/nutrition/meal-plan/meal-plan-api", () => api);

import { AddToPlanWorkspace } from "@/components/nutrition/meal-plan/add-to-plan-workspace";

const FOOD_ID = "11111111-1111-4111-8111-111111111111";
const SERVING_A = "22222222-2222-4222-8222-222222222222";
const SERVING_B = "33333333-3333-4333-8333-333333333333";

function catalogFood() {
  return {
    id: FOOD_ID,
    source: "catalog",
    name: "Canonical yogurt",
    brand: null,
    category: "dairy",
    cuisine: null,
    servingLabel: null,
    verified: true,
    favorite: false,
    recentAt: null,
    frequency: 0,
    locale: "de",
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

function selection(choices: Array<{ servingOptionId: string | null; label: string; source: "generation" | "owner_override" }>) {
  return { foodId: FOOD_ID, name: "Canonical yogurt", languageTag: "de", servingChoices: choices };
}

function handoff(label: string) {
  return {
    foodId: FOOD_ID,
    source: "catalog",
    name: "Canonical yogurt",
    serving: label,
    quantity: 1,
    frozenNutrition: { calories: 95, protein_g: 9, carbs_g: 11, fat_g: 2, fiber_g: 1 },
    frozenSourceSnapshot: {
      food_id: FOOD_ID,
      source: "catalog",
      frozen_name: "Canonical yogurt",
      resolved_quantity: 1,
      resolved_serving_label: label,
      frozen_nutrition: { calories: 95, protein_g: 9, carbs_g: 11, fat_g: 2, fiber_g: 1 },
    },
    diaryItem: {
      foodName: "Canonical yogurt",
      servingLabel: label,
      quantity: 1,
      nutrition: { caloriesKcal: 95, proteinG: 9, carbsG: 11, fatG: 2 },
      foodItemId: FOOD_ID,
      userFoodItemId: null,
    },
  };
}

async function flush(ms = 0) {
  await act(async () => {
    await Promise.resolve();
    if (ms) await new Promise((resolve) => setTimeout(resolve, ms));
    await Promise.resolve();
  });
}

function foodResultButton(host: HTMLElement) {
  const result = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("Canonical yogurt"));
  if (!(result instanceof HTMLButtonElement)) throw new Error("Catalog result button not rendered.");
  return result;
}

function button(host: HTMLElement, text: string) {
  const result = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === text);
  if (!(result instanceof HTMLButtonElement)) throw new Error(`Button "${text}" not rendered.`);
  return result;
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setter) throw new Error("Select setter unavailable.");
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Meal Plan Catalog serving authority", () => {
  let host: HTMLDivElement;
  let root: Root;
  let onCommit: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    onCommit = vi.fn(async () => undefined);

    api.mealPlanApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/nutrition/v1/foods?")) return { items: [catalogFood()], nextCursor: null };
      if (path.startsWith("/api/nutrition/v1/recipes?")) return { recipes: [] };
      if (path.startsWith("/api/nutrition/v1/diary?")) return { domains: { savedMeals: { status: "ready", data: [] } } };
      throw new Error(`Unexpected API call: ${path}`);
    });
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderWorkspace() {
    await act(async () => {
      root.render(createElement(AddToPlanWorkspace, {
        date: "2026-09-21",
        mealSlotKey: "breakfast",
        onClose: vi.fn(),
        onCommit,
      }));
    });
    await flush(220);
  }

  it("resolves one authoritative Catalog serving and builds the planned snapshot from exact handoff output", async () => {
    api.mealPlanApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/nutrition/v1/foods?")) return { items: [catalogFood()], nextCursor: null };
      if (path.startsWith("/api/nutrition/v1/recipes?")) return { recipes: [] };
      if (path.startsWith("/api/nutrition/v1/diary?")) return { domains: { savedMeals: { status: "ready", data: [] } } };
      if (path.includes("/selection?")) return selection([{ servingOptionId: SERVING_A, label: "170 g", source: "generation" }]);
      if (path.includes("/handoff?")) return handoff("170 g");
      throw new Error(`Unexpected API call: ${path}`);
    });

    await renderWorkspace();
    const result = foodResultButton(host);
    expect(result.disabled).toBe(false);

    await act(async () => { result.click(); });
    await flush();

    const calls = api.mealPlanApi.mock.calls.map(([path]) => String(path));
    expect(calls.some((path) => path.includes(`/foods/${FOOD_ID}/selection?`) && path.includes("displayName=Canonical+yogurt") && path.includes("languageTag=de"))).toBe(true);
    expect(calls.some((path) => path.includes(`/foods/${FOOD_ID}/handoff?`) && path.includes(`servingOptionId=${SERVING_A}`) && path.includes("serving=170+g"))).toBe(true);

    await act(async () => { button(host, "add 1").click(); });
    await flush();

    expect(onCommit).toHaveBeenCalledTimes(1);
    const [items] = onCommit.mock.calls[0]!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourceType: "food",
      sourceId: FOOD_ID,
      resolvedQuantity: 1,
      resolvedServingLabel: "170 g",
      frozenName: "Canonical yogurt",
      frozenSnapshot: {
        resolved_serving_label: "170 g",
        frozen_nutrition: { calories: 95, protein_g: 9, carbs_g: 11, fat_g: 2, fiber_g: 1 },
      },
    });
  });

  it("requires explicit choice for multiple selected generation servings and sends exact serving identity", async () => {
    api.mealPlanApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/nutrition/v1/foods?")) return { items: [catalogFood()], nextCursor: null };
      if (path.startsWith("/api/nutrition/v1/recipes?")) return { recipes: [] };
      if (path.startsWith("/api/nutrition/v1/diary?")) return { domains: { savedMeals: { status: "ready", data: [] } } };
      if (path.includes("/selection?")) return selection([
        { servingOptionId: SERVING_A, label: "170 g", source: "generation" },
        { servingOptionId: SERVING_B, label: "1 cup", source: "generation" },
      ]);
      if (path.includes("/handoff?")) return handoff("1 cup");
      throw new Error(`Unexpected API call: ${path}`);
    });

    await renderWorkspace();
    await act(async () => { foodResultButton(host).click(); });
    await flush();

    expect(host.textContent).toContain("Choose an authoritative serving");
    const select = host.querySelector('select[aria-label="Authoritative serving for Canonical yogurt"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(api.mealPlanApi.mock.calls.some(([path]) => String(path).includes("/handoff?"))).toBe(false);

    await act(async () => { setSelectValue(select as HTMLSelectElement, SERVING_B); });
    await act(async () => { foodResultButton(host).click(); });
    await flush();

    const handoffCall = api.mealPlanApi.mock.calls.map(([path]) => String(path)).find((path) => path.includes("/handoff?"));
    expect(handoffCall).toContain(`servingOptionId=${SERVING_B}`);
    expect(handoffCall).toContain("serving=1+cup");
  });

  it("rejects zero authoritative Catalog servings without fabricating nutrition basis as serving", async () => {
    api.mealPlanApi.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/nutrition/v1/foods?")) return { items: [catalogFood()], nextCursor: null };
      if (path.startsWith("/api/nutrition/v1/recipes?")) return { recipes: [] };
      if (path.startsWith("/api/nutrition/v1/diary?")) return { domains: { savedMeals: { status: "ready", data: [] } } };
      if (path.includes("/selection?")) return selection([]);
      throw new Error(`Unexpected API call: ${path}`);
    });

    await renderWorkspace();
    await act(async () => { foodResultButton(host).click(); });
    await flush();

    expect(host.textContent).toContain("No authoritative serving is available yet.");
    expect(host.textContent).not.toContain("100 g");
    expect(api.mealPlanApi.mock.calls.some(([path]) => String(path).includes("/handoff?"))).toBe(false);
  });
});
