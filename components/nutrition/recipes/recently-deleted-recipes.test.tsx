// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const recipeApiMock = vi.hoisted(() => vi.fn());

vi.mock("@/components/nutrition/recipes/recipe-api", () => ({ recipeApi: recipeApiMock }));
vi.mock("@/lib/i18n/nutrition-v1", () => ({
  useNutritionV1Translation: () => ({ language: "en", dir: "ltr", locale: "en-US" }),
}));

import { RecentlyDeletedRecipes } from "@/components/nutrition/recipes/recently-deleted-recipes";

describe("Recently Deleted Recipe permanent purge", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    recipeApiMock.mockReset();
    recipeApiMock.mockImplementation(async (path: string) => {
      if (path === "?deleted=true&limit=20") {
        return {
          recipes: [{
            id: "11111111-1111-4111-8111-111111111111",
            name: "Chicken bowl",
            cover_path: null,
            deleted_at: "2026-08-29T08:00:00.000Z",
            purge_after: "2026-09-28T08:00:00.000Z",
          }],
        };
      }
      return {};
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => { root.unmount(); });
    host.remove();
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
  });

  it("requires a second explicit confirmation before issuing the irreversible purge request", async () => {
    await act(async () => { root.render(<RecentlyDeletedRecipes />); });
    await vi.waitFor(() => expect(host.textContent).toContain("Delete Now"));

    const deleteNow = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Delete Now");
    if (!(deleteNow instanceof HTMLButtonElement)) throw new Error("Delete Now was not rendered.");

    await act(async () => { deleteNow.click(); });
    expect(recipeApiMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);
    expect(host.textContent).toContain("Confirm delete");
    expect(host.textContent).toContain("Cancel");

    const confirm = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Confirm delete");
    if (!(confirm instanceof HTMLButtonElement)) throw new Error("Confirm delete was not rendered.");
    await act(async () => { confirm.click(); });

    await vi.waitFor(() => {
      expect(recipeApiMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
    });
  });
});
