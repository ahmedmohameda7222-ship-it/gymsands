// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CookingCompletion } from "@/components/nutrition/cooking/cooking-completion";
import type { CookingLocalSession } from "@/lib/nutrition-v1/cooking-local-store";

const recipeId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipeVersionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const completedSession: CookingLocalSession = {
  schemaVersion: 1,
  sessionId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  recipeId,
  recipeVersionId,
  frozenRecipeSnapshot: {
    schemaVersion: 1,
    recipe: { id: recipeVersionId, recipe_id: recipeId, name: "Chicken bowl", servings: 4 },
    ingredients: [],
    actions: [],
    equipment: [],
  },
  servingScale: 1,
  status: "completed",
  stateRevision: 5,
  currentActionKey: null,
  actionStates: [],
  timers: [],
  pendingMutations: [],
  startedAt: "2026-08-28T10:00:00.000Z",
  lastActiveAt: "2026-08-28T10:30:00.000Z",
  completedAt: "2026-08-28T10:30:00.000Z",
  endedAt: null,
};

function expectedHandoff(destination: "diary" | "meal_plan" | "saved_meal") {
  const pathname = destination === "meal_plan" ? "/my-meal-plan" : "/calories";
  const params = new URLSearchParams({
    source: "recipe",
    recipeId,
    recipeVersionId,
    quantity: "1",
    destination,
  });
  return `${pathname}?${params.toString()}`;
}

describe("Cooking completion contextual actions", () => {
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

  it("renders the approved four actions from the frozen cooked Recipe version without implying consumption", () => {
    const html = renderToStaticMarkup(<CookingCompletion session={completedSession} onClose={vi.fn()} />);

    expect(html).toContain("Cooking complete");
    expect(html).toContain("Chicken bowl");
    expect(html).toContain("4 servings prepared");
    expect(html).toContain("Add to Diary");
    expect(html).toContain("Add to Meal Plan");
    expect(html).toContain("Save as Meal");
    expect(html).toContain("Close");
    expect(html).toContain(`recipeId=${recipeId}`);
    expect(html).toContain(`recipeVersionId=${recipeVersionId}`);
    expect(html).toContain("quantity=1");
    expect(html).not.toMatch(/logged|consumed|ate the whole/i);
  });

  it("renders clickable post-cooking handoffs bound to the frozen Recipe version and lets Close finish without a downstream write", async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(<CookingCompletion session={completedSession} onClose={onClose} />);
    });

    const links = Array.from(host.querySelectorAll("a"));
    expect(links).toHaveLength(3);
    expect(links.map((link) => [link.textContent?.trim(), link.getAttribute("href")])).toEqual([
      ["Add to Diary›", expectedHandoff("diary")],
      ["Add to Meal Plan›", expectedHandoff("meal_plan")],
      ["Save as Meal›", expectedHandoff("saved_meal")],
    ]);

    const clicked: string[] = [];
    const preventNavigation = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLAnchorElement)) return;
      event.preventDefault();
      clicked.push(target.getAttribute("href") ?? "");
    };
    host.addEventListener("click", preventNavigation);
    try {
      for (const link of links) {
        await act(async () => { link.click(); });
      }
    } finally {
      host.removeEventListener("click", preventNavigation);
    }
    expect(clicked).toEqual([
      expectedHandoff("diary"),
      expectedHandoff("meal_plan"),
      expectedHandoff("saved_meal"),
    ]);

    const close = Array.from(host.querySelectorAll("button")).find((button) => button.textContent?.trim() === "Close");
    if (!(close instanceof HTMLButtonElement)) throw new Error("Cooking completion Close action was not rendered.");
    await act(async () => { close.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("derives prepared servings from the frozen Recipe servings and Cooking serving scale", () => {
    const html = renderToStaticMarkup(<CookingCompletion session={{ ...completedSession, servingScale: 1.5 }} onClose={vi.fn()} />);
    expect(html).toContain("6 servings prepared");
  });
});
