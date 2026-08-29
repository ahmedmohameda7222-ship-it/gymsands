// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  recipeApi: vi.fn(),
  currentUser: { id: "11111111-1111-4111-8111-111111111111" } as { id: string } | null,
  push: vi.fn(),
  refresh: vi.fn(),
  nt: (key: string) => key,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: mocks.currentUser, isLoading: false }),
}));
vi.mock("@/components/nutrition/recipes/recipe-api", () => ({ recipeApi: mocks.recipeApi }));
vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({ nt: mocks.nt, dir: "ltr" }),
}));

import { RecipeDetail } from "@/components/nutrition/recipes/recipe-detail";

const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";

function setReactActEnvironment(value: boolean) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value;
}

function publishedRecipe() {
  return {
    root: { id: recipeId, name: "Owner A private recipe", is_favorite: false, cover_path: null },
    latestVersion: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      version_number: 1,
      name: "Owner A private recipe",
      servings: 2,
      total_time_minutes: 20,
      notes: null,
      metadata: {},
    },
    hasWorkingDraft: false,
    ingredients: [{ id: "i-1", ingredient_name: "Private ingredient", quantity: 1, unit: "piece", food_id: null, verified: false }],
    instructions: [{ id: "a-1", instruction: "Private instruction" }],
    equipment: [],
    nutritionPerServing: { calories: 500, protein_g: 30, carbs_g: 40, fat_g: 20 },
    cuisine: "Private cuisine",
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("RecipeDetail owner-scoped offline cache", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mocks.currentUser = { id: ownerA };
    setReactActEnvironment(true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    setReactActEnvironment(false);
  });

  async function cacheAsOwnerA() {
    mocks.recipeApi.mockResolvedValueOnce({ recipe: publishedRecipe() });
    await act(async () => { root.render(createElement(RecipeDetail, { recipeId })); });
    await flush();
    expect(host.textContent).toContain("Owner A private recipe");
    await act(async () => { root.unmount(); });
    root = createRoot(host);
  }

  it("keeps correct-owner offline fallback available", async () => {
    await cacheAsOwnerA();
    mocks.currentUser = { id: ownerA };
    mocks.recipeApi.mockRejectedValueOnce(new Error("offline"));

    await act(async () => { root.render(createElement(RecipeDetail, { recipeId })); });
    await flush();

    expect(host.textContent).toContain("Owner A private recipe");
    expect(host.textContent).toContain("offlineCachedRecipe");
  });

  it("does not render owner A cache for authenticated owner B", async () => {
    await cacheAsOwnerA();
    mocks.currentUser = { id: ownerB };
    mocks.recipeApi.mockRejectedValueOnce(new Error("not found"));

    await act(async () => { root.render(createElement(RecipeDetail, { recipeId })); });
    await flush();

    expect(host.textContent).not.toContain("Owner A private recipe");
    expect(host.textContent).not.toContain("Private ingredient");
    expect(host.textContent).toContain("not found");
  });

  it("does not render a private cached Recipe while signed out", async () => {
    await cacheAsOwnerA();
    mocks.currentUser = null;
    mocks.recipeApi.mockRejectedValueOnce(new Error("Please sign in"));

    await act(async () => { root.render(createElement(RecipeDetail, { recipeId })); });
    await flush();

    expect(host.textContent).not.toContain("Owner A private recipe");
    expect(host.textContent).not.toContain("Private instruction");
    expect(host.textContent).toContain("Please sign in");
  });

  it("does not trust a legacy unowned cache entry", async () => {
    localStorage.setItem(
      `plaivra:nutrition:recipe:${recipeId}:published`,
      JSON.stringify({
        status: "published",
        recipeId,
        recipeVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        versionNumber: 1,
        name: "Legacy private recipe",
        servings: 1,
        totalTimeMinutes: null,
        cuisine: null,
        favorite: false,
        coverPhotoUrl: null,
        ingredients: [],
        instructions: ["Legacy private instruction"],
        nutritionPerServing: null,
        cachedAt: new Date().toISOString(),
      }),
    );
    mocks.currentUser = { id: ownerA };
    mocks.recipeApi.mockRejectedValueOnce(new Error("offline"));

    await act(async () => { root.render(createElement(RecipeDetail, { recipeId })); });
    await flush();

    expect(host.textContent).not.toContain("Legacy private recipe");
    expect(host.textContent).not.toContain("Legacy private instruction");
    expect(host.textContent).toContain("offline");
  });
});
