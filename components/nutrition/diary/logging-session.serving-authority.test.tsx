// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    session: {
      access_token: "test-token",
      user: { id: "11111111-1111-4111-8111-111111111111" },
    },
  }),
}));
vi.mock("@/lib/i18n/eat", () => ({
  useEatTranslation: () => ({
    et: (key: string) => key,
    language: "en",
    dir: "ltr",
    mealLabel: (meal: string) => meal,
  }),
}));

import { LoggingSession } from "@/components/nutrition/diary/logging-session";

const FOOD_ID = "22222222-2222-4222-8222-222222222222";
const SERVING_A = "33333333-3333-4333-8333-333333333333";
const SERVING_B = "44444444-4444-4444-8444-444444444444";
const BARCODE = "4006381333931";

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

function selection(choices: Array<{
  servingOptionId: string | null;
  label: string;
  source: "generation" | "owner_override";
  nutrition?: ReturnType<typeof catalogFood>["nutrition"];
}>) {
  return { foodId: FOOD_ID, name: "Canonical yogurt", languageTag: "de", servingChoices: choices };
}

function handoff(serving: string) {
  return {
    foodId: FOOD_ID,
    name: "Canonical yogurt",
    serving,
    quantity: 1,
    frozenSourceSnapshot: {
      food_id: FOOD_ID,
      source: "catalog",
      frozen_name: "Canonical yogurt",
      resolved_quantity: 1,
      resolved_serving_label: serving,
      frozen_nutrition: { calories: 100, protein_g: 10, carbs_g: 12, fat_g: 2, fiber_g: null },
    },
    diaryItem: {
      foodName: "Canonical yogurt",
      servingLabel: serving,
      quantity: 1,
      nutrition: { caloriesKcal: 100, proteinG: 10, carbsG: 12, fatG: 2 },
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

function button(host: HTMLElement, text: string) {
  const found = Array.from(host.querySelectorAll("button")).find((candidate) => candidate.textContent?.trim() === text);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`Button "${text}" not rendered.`);
  return found;
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input setter unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  if (!setter) throw new Error("Select setter unavailable.");
  setter.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("Diary LoggingSession authoritative Catalog serving selection", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.stubGlobal("fetch", mocks.fetch);
    uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID");
    let sequence = 0;
    uuidSpy.mockImplementation(() => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++sequence).padStart(12, "0")}` as `${string}-${string}-${string}-${string}-${string}`);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    uuidSpy.mockRestore();
    vi.unstubAllGlobals();
    localStorage.clear();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderSession() {
    await act(async () => {
      root.render(createElement(LoggingSession, {
        date: "2026-09-21",
        meal: "Breakfast",
        savedMeals: [],
        onClose: vi.fn(),
        onConfirmed: vi.fn(),
      }));
    });
    await flush(160);
  }

  it("keeps a NULL-serving Catalog search result addable and resolves the sole authoritative serving before Plate entry", async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/nutrition/v1/foods?")) {
        return new Response(JSON.stringify({ items: [catalogFood()], nextCursor: null }), { status: 200 });
      }
      if (url.includes("/selection?")) {
        return new Response(JSON.stringify(selection([{ servingOptionId: SERVING_A, label: "170 g", source: "generation" }])), { status: 200 });
      }
      if (url.includes("/handoff?")) {
        return new Response(JSON.stringify(handoff("170 g")), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await renderSession();

    const add = button(host, "add");
    expect(add.disabled).toBe(false);
    expect(host.textContent).toContain("Canonical yogurt");
    expect(host.textContent).not.toContain("100 g");

    await act(async () => { add.click(); });
    await flush();

    const urls = mocks.fetch.mock.calls.map(([input]) => String(input));
    expect(urls.some((url) => url.includes(`/foods/${FOOD_ID}/selection?`) && url.includes("displayName=Canonical+yogurt") && url.includes("languageTag=de"))).toBe(true);
    expect(urls.some((url) => url.includes(`/foods/${FOOD_ID}/handoff?`) && url.includes(`servingOptionId=${SERVING_A}`) && url.includes("serving=170+g"))).toBe(true);
    expect(host.textContent).toContain("170 g");
  });

  it("requires an explicit search-result serving choice when multiple generation servings are selected", async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/nutrition/v1/foods?")) {
        return new Response(JSON.stringify({ items: [catalogFood()], nextCursor: null }), { status: 200 });
      }
      if (url.includes("/selection?")) {
        return new Response(JSON.stringify(selection([
          {
            servingOptionId: SERVING_A,
            label: "170 g",
            source: "generation",
            nutrition: { ...catalogFood().nutrition, calories: 170, protein_g: 17, carbs_g: 20.4, fat_g: 3.4, basis_amount: 1, basis_unit: "serving" },
          },
          {
            servingOptionId: SERVING_B,
            label: "1 cup",
            source: "generation",
            nutrition: { ...catalogFood().nutrition, calories: 240, protein_g: 24, carbs_g: 28.8, fat_g: 4.8, basis_amount: 1, basis_unit: "serving" },
          },
        ])), { status: 200 });
      }
      if (url.includes("/handoff?")) return new Response(JSON.stringify(handoff("1 cup")), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await renderSession();
    await act(async () => { button(host, "add").click(); });
    await flush();

    expect(host.textContent).toContain("Choose an authoritative serving");
    const select = host.querySelector('select[aria-label="Authoritative serving for Canonical yogurt"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    expect(host.querySelector('aside[aria-label="Plate"]')).toBeNull();

    await act(async () => { setSelectValue(select as HTMLSelectElement, SERVING_B); });
    await flush();
    expect(host.textContent).toContain("1 cup · 240 kcal · protein 24 g");
    expect(host.textContent).not.toContain("1 cup · 100 kcal · protein 10 g");

    await act(async () => { button(host, "add").click(); });
    await flush();

    const handoffUrl = mocks.fetch.mock.calls.map(([input]) => String(input)).find((url) => url.includes("/handoff?"));
    expect(handoffUrl).toContain(`servingOptionId=${SERVING_B}`);
    expect(handoffUrl).toContain("serving=1+cup");
    expect(host.textContent).toContain("1 cup");
  });

  it("renders canonical barcode serving choices and refuses arbitrary multi-serving Plate insertion", async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/nutrition/v1/foods?")) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
      }
      if (url.startsWith("/api/food/open-food-facts?")) {
        return new Response(JSON.stringify({ food: {
          source: "catalog",
          foodId: FOOD_ID,
          name: "Canonical yogurt",
          locale: "de",
          servingSize: null,
          servingChoices: [
            {
              servingOptionId: SERVING_A,
              label: "170 g",
              source: "generation",
              nutrition: { ...catalogFood().nutrition, calories: 170, protein_g: 17, carbs_g: 20.4, fat_g: 3.4, basis_amount: 1, basis_unit: "serving" },
            },
            {
              servingOptionId: SERVING_B,
              label: "1 cup",
              source: "generation",
              nutrition: { ...catalogFood().nutrition, calories: 240, protein_g: 24, carbs_g: 28.8, fat_g: 4.8, basis_amount: 1, basis_unit: "serving" },
            },
          ],
          calories: 100, protein: 10, carbs: 12, fat: 2,
        } }), { status: 200 });
      }
      if (url.includes("/handoff?")) return new Response(JSON.stringify(handoff("1 cup")), { status: 200 });
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await renderSession();
    await act(async () => { button(host, "barcode").click(); });
    await flush();

    const barcodeInput = host.querySelector('input[placeholder="barcodePlaceholder"]');
    expect(barcodeInput).toBeInstanceOf(HTMLInputElement);
    await act(async () => { setInputValue(barcodeInput as HTMLInputElement, BARCODE); });
    await act(async () => { button(host, "lookup").click(); });
    await flush();

    const select = host.querySelector('select[aria-label="Barcode authoritative serving"]');
    expect(select).toBeInstanceOf(HTMLSelectElement);
    const add = button(host, "Add to Plate");
    expect(add.disabled).toBe(true);

    await act(async () => { setSelectValue(select as HTMLSelectElement, SERVING_B); });
    await flush();
    expect(host.textContent).toContain("1 cup · 240 kcal");
    expect(host.textContent).not.toContain("1 cup · 100 kcal");
    expect(button(host, "Add to Plate").disabled).toBe(false);
    await act(async () => { button(host, "Add to Plate").click(); });
    await flush();

    const handoffUrl = mocks.fetch.mock.calls.map(([input]) => String(input)).find((url) => url.includes("/handoff?"));
    expect(handoffUrl).toContain(`servingOptionId=${SERVING_B}`);
    expect(handoffUrl).toContain("serving=1+cup");
    expect(host.textContent).toContain("1 cup");
  });

  it("keeps provider barcode results suggestion-only and blocks direct Plate insertion", async () => {
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/nutrition/v1/foods?")) {
        return new Response(JSON.stringify({ items: [], nextCursor: null }), { status: 200 });
      }
      if (url.startsWith("/api/food/open-food-facts?")) {
        return new Response(JSON.stringify({ food: {
          source: "provider_suggestion",
          name: "Provider yogurt",
          servingSize: "170 g",
          calories: 100, protein: 10, carbs: 12, fat: 2,
        } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await renderSession();
    await act(async () => { button(host, "barcode").click(); });
    const barcodeInput = host.querySelector('input[placeholder="barcodePlaceholder"]') as HTMLInputElement;
    await act(async () => { setInputValue(barcodeInput, BARCODE); });
    await act(async () => { button(host, "lookup").click(); });
    await flush();

    expect(host.textContent).toContain("suggestion-only");
    expect(button(host, "Add to Plate").disabled).toBe(true);
  });
});
