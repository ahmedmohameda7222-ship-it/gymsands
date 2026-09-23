// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  api: vi.fn(),
  saved: vi.fn(),
  closed: vi.fn(),
}));

vi.mock("@/components/nutrition/food-library/food-library-api", () => ({
  foodLibraryApi: mocks.api,
}));
vi.mock("@/components/nutrition/food-library/food-library-copy", () => ({
  foodLibraryText: (_language: string, _base: unknown, key: string) => key,
}));
vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({ nt: (key: string) => key, language: "en", dir: "ltr" }),
}));

import { CustomFoodWorkspace } from "@/components/nutrition/food-library/custom-food-workspace";
import type { FoodLibraryCandidate } from "@/services/nutrition-v1/server/food-library";

const food: FoodLibraryCandidate = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  source: "catalog",
  name: "Generation yogurt",
  brand: null,
  category: "Dairy",
  cuisine: null,
  servingLabel: "170 g",
  verified: true,
  favorite: false,
  recentAt: null,
  frequency: 0,
  locale: "en",
  aliases: [],
  nutrition: {
    calories: 100,
    protein_g: 10,
    carbs_g: 8,
    fat_g: 2,
    saturated_fat_g: null,
    fiber_g: null,
    sugars_g: 7,
    sodium_mg: 60,
    basis_amount: 100,
    basis_unit: "g",
  },
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function saveButton(host: HTMLElement) {
  const button = host.querySelector('button[aria-label="saveCorrection"]');
  if (!(button instanceof HTMLButtonElement)) throw new Error("Personal correction save button not rendered.");
  return button;
}

function field(host: HTMLElement, labelText: string) {
  const label = Array.from(host.querySelectorAll("label")).find((candidate) => candidate.textContent?.includes(labelText));
  const input = label?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) throw new Error(labelText + " field not rendered.");
  return input;
}

function setNativeValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input setter unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function mutationBodies() {
  return mocks.api.mock.calls
    .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as Record<string, any>)
    .filter((body) => body.operation === "personal_correction");
}

function prepareBodies() {
  return mocks.api.mock.calls
    .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body ?? "{}")) as Record<string, any>)
    .filter((body) => body.operation === "personal_correction_prepare");
}

describe("CustomFoodWorkspace Personal Override command identity", () => {
  let host: HTMLDivElement;
  let root: Root;
  let uuidSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    let prepareCount = 0;
    mocks.api.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (body.operation === "personal_correction_prepare") {
        prepareCount += 1;
        return new Response(JSON.stringify({
          foodId: food.id,
          expectedRevisionId: null,
          expectedPointerRevision: prepareCount - 1,
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (body.operation === "personal_correction") {
        return new Response(JSON.stringify({ error: "ambiguous transport failure", code: "nutrition_unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error("Unexpected Food mutation operation.");
    });
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
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  async function renderCorrection() {
    await act(async () => {
      root.render(createElement(CustomFoodWorkspace, {
        mode: "correction",
        food,
        onClose: mocks.closed,
        onSaved: mocks.saved,
      }));
    });
    await flush();
  }

  async function ambiguousSubmit() {
    await act(async () => { saveButton(host).click(); });
    await flush();
    return mutationBodies().at(-1);
  }

  it("reuses one stable operation ID and exact prepared CAS across an ambiguous retry of the same semantic correction", async () => {
    await renderCorrection();

    const first = await ambiguousSubmit();
    const second = await ambiguousSubmit();

    expect(prepareBodies()).toHaveLength(1);
    expect(first?.input.operationId).toBeTruthy();
    expect(second?.input.operationId).toBe(first?.input.operationId);
    expect(second?.input.expectedRevisionId).toBe(first?.input.expectedRevisionId);
    expect(second?.input.expectedPointerRevision).toBe(first?.input.expectedPointerRevision);
    expect(first?.input).not.toHaveProperty("basisAmount");
    expect(first?.input).not.toHaveProperty("basisUnit");
  });

  it("creates a new operation identity and re-resolves CAS when the semantic correction payload changes", async () => {
    await renderCorrection();

    const first = await ambiguousSubmit();
    await act(async () => { setNativeValue(field(host, "calories"), "151"); });
    await flush();
    const second = await ambiguousSubmit();

    expect(prepareBodies()).toHaveLength(2);
    expect(second?.input.operationId).toBeTruthy();
    expect(second?.input.operationId).not.toBe(first?.input.operationId);
    expect(second?.input.expectedPointerRevision).not.toBe(first?.input.expectedPointerRevision);
  });
});
