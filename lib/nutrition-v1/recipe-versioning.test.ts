import { describe, expect, it } from "vitest";

import {
  clonePublishedRecipeGraphForDraft,
  evaluateRecipeDraftReadiness,
  nextRecipeVersionNumber,
} from "@/lib/nutrition-v1/recipe-versioning";

describe("Nutrition V1 Recipe versioning", () => {
  it("keeps incomplete Working Drafts saveable but not publishable", () => {
    expect(
      evaluateRecipeDraftReadiness({
        name: "Chicken bowl",
        servings: null,
        ingredients: [],
        instructions: [],
      }),
    ).toEqual({
      ready: false,
      missing: ["servings", "ingredient", "instruction"],
    });
  });

  it("requires exactly the minimum Ready contract and nothing more", () => {
    expect(
      evaluateRecipeDraftReadiness({
        name: "Chicken bowl",
        servings: 4,
        ingredients: [{ ingredient_name: "Chicken", quantity: 500, unit: "g" }],
        instructions: [{ instruction: "Cook using the confirmed recipe instructions." }],
      }),
    ).toEqual({ ready: true, missing: [] });
  });

  it("advances v1 to v2 without mutating published version history", () => {
    const published = Object.freeze([{ version_number: 1, name: "Chicken bowl v1" }]);
    const before = structuredClone(published);

    expect(nextRecipeVersionNumber(published)).toBe(2);
    expect(published).toEqual(before);
  });

  it("clones a published graph with fresh Draft IDs and remaps every internal child reference", () => {
    const ids = [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
      "10000000-0000-4000-8000-000000000004",
      "10000000-0000-4000-8000-000000000005",
    ];
    let cursor = 0;
    const nextId = () => ids[cursor++];

    const graph = clonePublishedRecipeGraphForDraft(
      {
        ingredients: [
          { id: "old-ingredient", ingredient_name: "Chicken", nested: { keep: true } },
        ],
        equipment: [
          { id: "old-equipment", name: "Pan" },
        ],
        instructions: [
          {
            id: "old-action-1",
            instruction: "First",
            dependency_action_ids: [],
            ingredient_refs: ["old-ingredient", { ingredientId: "old-ingredient", untouched: "other-value" }],
            equipment_refs: [{ id: "old-equipment" }],
          },
          {
            id: "old-action-2",
            instruction: "Second",
            dependency_action_ids: ["old-action-1"],
            ingredient_refs: [],
            equipment_refs: [],
          },
        ],
      },
      nextId,
    );

    expect(graph.ingredients[0]).toMatchObject({ id: ids[0], ingredient_name: "Chicken" });
    expect(graph.equipment[0]).toMatchObject({ id: ids[1], name: "Pan" });
    expect(graph.instructions[0]).toMatchObject({
      id: ids[2],
      ingredient_refs: [ids[0], { ingredientId: ids[0], untouched: "other-value" }],
      equipment_refs: [{ id: ids[1] }],
    });
    expect(graph.instructions[1]).toMatchObject({
      id: ids[3],
      dependency_action_ids: [ids[2]],
    });
  });

  it("rejects unresolved dependency IDs instead of silently carrying published-version links into a Draft", () => {
    expect(() =>
      clonePublishedRecipeGraphForDraft(
        {
          ingredients: [],
          equipment: [],
          instructions: [
            {
              id: "old-action-2",
              instruction: "Second",
              dependency_action_ids: ["missing-action"],
              ingredient_refs: [],
              equipment_refs: [],
            },
          ],
        },
        () => crypto.randomUUID(),
      ),
    ).toThrow(/dependency.*missing-action/i);
  });
});
