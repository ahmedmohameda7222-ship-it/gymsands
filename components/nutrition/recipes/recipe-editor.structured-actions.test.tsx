// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recipeApi: vi.fn(),
  nt: (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/components/nutrition/recipes/recipe-api", () => ({
  recipeApi: mocks.recipeApi,
  RecipeApiError: class RecipeApiError extends Error {},
}));
vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({ nt: mocks.nt, dir: "ltr" }),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import { RecipeEditor } from "@/components/nutrition/recipes/recipe-editor";

const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ingredientId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const equipmentId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const actionOneId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const actionTwoId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function workspace(name = "Structured recipe") {
  return {
    root: { id: recipeId, name, cover_path: null, is_favorite: false },
    draft: {
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      revision: 3,
      name,
      servings: 2,
      total_time_minutes: 25,
      notes: null,
      draft_metadata: {},
    },
    latestVersion: null,
    ingredients: [{
      id: ingredientId,
      position: 0,
      food_id: "12121212-1212-4212-8212-121212121212",
      ingredient_name: "Chicken",
      quantity: 300,
      unit: "g",
      frozen_nutrition: { calories: 495 },
      verified: true,
    }],
    instructions: [
      {
        id: actionOneId,
        position: 0,
        instruction: "Prepare chicken.",
        ingredient_refs: [{ ingredient_id: ingredientId }],
        equipment_refs: [{ equipment_id: equipmentId }],
        duration_seconds: 120,
        heat_or_temperature: null,
        doneness_or_result_cue: null,
        prep_ahead_cue: "Can prep early",
        track_key: "prep",
        dependency_action_ids: [],
        can_run_in_background: true,
        metadata: { source: "mcp", note: "keep-me" },
      },
      {
        id: actionTwoId,
        position: 1,
        instruction: "Cook chicken.",
        ingredient_refs: [ingredientId],
        equipment_refs: [equipmentId],
        duration_seconds: 600,
        heat_or_temperature: "medium-high",
        doneness_or_result_cue: "golden",
        prep_ahead_cue: null,
        track_key: "main",
        dependency_action_ids: [actionOneId],
        can_run_in_background: false,
        metadata: { source: "import", stage: 2 },
      },
    ],
    equipment: [{ id: equipmentId, position: 0, name: "Pan", quantity: 1, note: "heavy" }],
    cuisine: null,
    nutritionPerServing: null,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) throw new Error("Input value setter unavailable.");
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe("Recipe editor structured action preservation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.recipeApi.mockReset();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    vi.useRealTimers();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("carries stable child identities and the complete structured action graph through an unrelated autosave", async () => {
    mocks.recipeApi
      .mockResolvedValueOnce({ recipe: workspace() })
      .mockResolvedValueOnce({ recipe: workspace("Renamed") });

    await act(async () => {
      root.render(createElement(RecipeEditor, { recipeId }));
      await Promise.resolve();
      await Promise.resolve();
    });

    const nameInput = Array.from(host.querySelectorAll("input")).find((candidate) => candidate.value === "Structured recipe");
    if (!(nameInput instanceof HTMLInputElement)) throw new Error("Recipe name input not rendered.");

    vi.useFakeTimers();
    await act(async () => { setInputValue(nameInput, "Renamed"); });
    await advanceTimers(650);

    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String((mocks.recipeApi.mock.calls[1]?.[1] as RequestInit | undefined)?.body)) as {
      draft?: { ingredients?: unknown[]; instructions?: unknown[]; equipment?: unknown[] };
    };

    expect(body.draft?.ingredients).toEqual([
      expect.objectContaining({ id: ingredientId, food_id: "12121212-1212-4212-8212-121212121212" }),
    ]);
    expect(body.draft?.equipment).toEqual([
      expect.objectContaining({ id: equipmentId, name: "Pan" }),
    ]);
    expect(body.draft?.instructions).toEqual([
      expect.objectContaining({
        id: actionOneId,
        ingredient_refs: [{ ingredient_id: ingredientId }],
        equipment_refs: [{ equipment_id: equipmentId }],
        track_key: "prep",
        dependency_action_ids: [],
        can_run_in_background: true,
        metadata: { source: "mcp", note: "keep-me" },
      }),
      expect.objectContaining({
        id: actionTwoId,
        ingredient_refs: [ingredientId],
        equipment_refs: [equipmentId],
        track_key: "main",
        dependency_action_ids: [actionOneId],
        can_run_in_background: false,
        metadata: { source: "import", stage: 2 },
      }),
    ]);
  }, 7000);
});
