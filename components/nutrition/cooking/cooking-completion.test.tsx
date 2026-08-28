import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

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

describe("Cooking completion contextual actions", () => {
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

  it("derives prepared servings from the frozen Recipe servings and Cooking serving scale", () => {
    const html = renderToStaticMarkup(<CookingCompletion session={{ ...completedSession, servingScale: 1.5 }} onClose={vi.fn()} />);
    expect(html).toContain("6 servings prepared");
  });
});