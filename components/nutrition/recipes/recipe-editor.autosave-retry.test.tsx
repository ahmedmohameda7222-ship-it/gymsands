// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RecipeApiError extends Error {
    readonly status: number;
    readonly code: string | null;

    constructor(message: string, status: number, code: string | null = null) {
      super(message);
      this.name = "RecipeApiError";
      this.status = status;
      this.code = code;
    }
  }

  return {
    recipeApi: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    RecipeApiError,
  };
});

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => createElement("a", { href, ...props }, children),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));
vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ user: { id: "11111111-1111-4111-8111-111111111111" } }),
}));
vi.mock("@/components/nutrition/recipes/recipe-api", () => ({
  recipeApi: mocks.recipeApi,
  RecipeApiError: mocks.RecipeApiError,
}));
vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({
    nt: (key: string) => key,
    dir: "ltr",
  }),
}));
vi.mock("@/lib/supabase/client", () => ({ supabase: null }));

import { RecipeEditor } from "@/components/nutrition/recipes/recipe-editor";

const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function workspace(name = "Original") {
  return {
    root: { id: recipeId, name, cover_path: null, is_favorite: false },
    draft: {
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name,
      servings: 2,
      total_time_minutes: null,
      notes: null,
      draft_metadata: {},
      revision: 0,
    },
    latestVersion: null,
    ingredients: [],
    instructions: [],
    equipment: [],
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

describe("Recipe editor autosave retry", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    vi.useRealTimers();
  });

  async function renderReadyEditor() {
    mocks.recipeApi.mockResolvedValueOnce({ recipe: workspace() });
    await act(async () => {
      root.render(createElement(RecipeEditor, { recipeId }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const input = Array.from(host.querySelectorAll("input")).find((candidate) => candidate.value === "Original");
    if (!(input instanceof HTMLInputElement)) throw new Error("Recipe name input not rendered.");
    return input;
  }

  it("retries a transient autosave failure without requiring another user edit", async () => {
    const input = await renderReadyEditor();
    mocks.recipeApi
      .mockRejectedValueOnce(new Error("Network request failed."))
      .mockResolvedValueOnce({ recipe: workspace("Changed") });

    await act(async () => { setInputValue(input, "Changed"); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("notSavedRetrying");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);
    const retry = mocks.recipeApi.mock.calls[2];
    const retryBody = JSON.parse(String((retry?.[1] as RequestInit | undefined)?.body)) as { draft?: { name?: string } };
    expect(retryBody.draft?.name).toBe("Changed");
    expect(host.textContent).toContain("saved");
  });

  it("does not retry a Recipe revision conflict", async () => {
    const input = await renderReadyEditor();
    mocks.recipeApi.mockRejectedValueOnce(
      new mocks.RecipeApiError("Recipe Working Draft revision conflict.", 409, "recipe_draft_revision_conflict"),
    );

    await act(async () => { setInputValue(input, "Conflicting change"); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(650);
    });
    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("notSavedRetrying");
    expect(host.textContent).toContain("draftSaveFailed");
  });
});
