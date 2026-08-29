import { describe, expect, it } from "vitest";

import { RecipeDraftRevisionConflictError } from "@/services/nutrition-v1/server/recipes";
import { nutritionErrorResponse } from "@/services/nutrition-v1/server/errors";

describe("Nutrition Recipe conflict HTTP taxonomy", () => {
  it("preserves a Recipe Working Draft revision conflict as HTTP 409 with a stable code", async () => {
    const response = nutritionErrorResponse(new RecipeDraftRevisionConflictError());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      code: "recipe_draft_revision_conflict",
      error: "Recipe Working Draft revision conflict.",
    });
  });
});
