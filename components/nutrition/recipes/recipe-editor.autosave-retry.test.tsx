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
    nt: (key: string) => key,
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
    nt: mocks.nt,
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

function setReactActEnvironment(value: boolean) {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = value;
}

async function advanceTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function flushAsyncWork() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("Recipe editor autosave retry", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mocks.recipeApi.mockReset();
    setReactActEnvironment(true);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    vi.useRealTimers();
    setReactActEnvironment(false);
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
    vi.useFakeTimers();
    mocks.recipeApi
      .mockRejectedValueOnce(new Error("Network request failed."))
      .mockResolvedValueOnce({ recipe: workspace("Changed") });

    await act(async () => { setInputValue(input, "Changed"); });
    await advanceTimers(650);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);
    expect(host.textContent).toContain("notSavedRetrying");

    await advanceTimers(1_000);

    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);
    const retry = mocks.recipeApi.mock.calls[2];
    const retryBody = JSON.parse(String((retry?.[1] as RequestInit | undefined)?.body)) as { draft?: { name?: string } };
    expect(retryBody.draft?.name).toBe("Changed");
    expect(host.textContent).toContain("saved");
  }, 7000);

  it("does not retry a Recipe revision conflict", async () => {
    const input = await renderReadyEditor();
    vi.useFakeTimers();
    mocks.recipeApi.mockRejectedValueOnce(
      new mocks.RecipeApiError("Recipe Working Draft revision conflict.", 409, "recipe_draft_revision_conflict"),
    );

    await act(async () => { setInputValue(input, "Conflicting change"); });
    await advanceTimers(650);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);

    await advanceTimers(60_000);

    expect(mocks.recipeApi).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("notSavedRetrying");
    expect(host.textContent).toContain("Recipe Working Draft revision conflict.");
    expect(input.value).toBe("Conflicting change");
  }, 7000);

  it("replaces a scheduled retry with the newest local Draft payload", async () => {
    const input = await renderReadyEditor();
    vi.useFakeTimers();
    mocks.recipeApi
      .mockRejectedValueOnce(new Error("Network request failed."))
      .mockResolvedValueOnce({ recipe: workspace("Newest") });

    await act(async () => { setInputValue(input, "Older"); });
    await advanceTimers(650);
    expect(host.textContent).toContain("notSavedRetrying");

    await act(async () => { setInputValue(input, "Newest"); });
    await advanceTimers(1_000);

    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(String((mocks.recipeApi.mock.calls[2]?.[1] as RequestInit | undefined)?.body)) as { draft?: { name?: string } };
    expect(retryBody.draft?.name).toBe("Newest");
    await advanceTimers(10_000);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);
  });

  it("does not overlap another retry while a retry request is in flight", async () => {
    const input = await renderReadyEditor();
    vi.useFakeTimers();
    const slowRetry = deferred<{ recipe: ReturnType<typeof workspace> }>();
    mocks.recipeApi
      .mockRejectedValueOnce(new Error("Network request failed."))
      .mockImplementationOnce(() => slowRetry.promise);

    await act(async () => { setInputValue(input, "Slow retry"); });
    await advanceTimers(650);
    await advanceTimers(1_000);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);

    await advanceTimers(10_000);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);

    slowRetry.resolve({ recipe: workspace("Slow retry") });
    await flushAsyncWork();
    expect(host.textContent).toContain("saved");
  });

  it("subsumes a scheduled retry and publishes only after the latest Draft is confirmed", async () => {
    const input = await renderReadyEditor();
    vi.useFakeTimers();
    const manualSave = deferred<{ recipe: ReturnType<typeof workspace> }>();
    mocks.recipeApi
      .mockRejectedValueOnce(new Error("Network request failed."))
      .mockImplementationOnce(() => manualSave.promise)
      .mockResolvedValueOnce({});

    await act(async () => { setInputValue(input, "First attempt"); });
    await advanceTimers(650);
    expect(host.textContent).toContain("notSavedRetrying");

    await act(async () => { setInputValue(input, "Latest before publish"); });
    const saveButton = Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "saveRecipe");
    if (!(saveButton instanceof HTMLButtonElement)) throw new Error("Save Recipe button not rendered.");
    await act(async () => { saveButton.click(); });
    await flushAsyncWork();

    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);
    const saveBody = JSON.parse(String((mocks.recipeApi.mock.calls[2]?.[1] as RequestInit | undefined)?.body)) as { draft?: { name?: string } };
    expect(saveBody.draft?.name).toBe("Latest before publish");
    expect(mocks.recipeApi.mock.calls.some(([path]) => path === `/${recipeId}/publish`)).toBe(false);

    await advanceTimers(10_000);
    expect(mocks.recipeApi).toHaveBeenCalledTimes(3);

    manualSave.resolve({ recipe: workspace("Latest before publish") });
    await flushAsyncWork();
    expect(mocks.recipeApi.mock.calls[3]?.[0]).toBe(`/${recipeId}/publish`);
  });
});
