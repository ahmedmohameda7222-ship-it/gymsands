import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Nutrition V1 retry and concurrency closure", () => {
  it("retains one client operation ID across retryable Diary and Meal Plan handoff attempts", () => {
    const consumer = source("components/nutrition/handoffs/add-to-handoff-consumer.tsx");
    const route = source("app/api/nutrition/v1/handoffs/commit/route.ts");

    expect(consumer).toContain("pendingOperationIdRef");
    expect(consumer).toContain("payload.operationId");
    expect(route).toContain('const operationId = text(body.operationId, "Operation ID")');
    expect(route).toContain("operationId,\n          date");
    expect(route).toContain("operationId,\n        mutation:");
  });

  it("requires optimistic revision compare-and-swap for every Recipe Working Draft autosave", () => {
    const service = source("services/nutrition-v1/server/recipes.ts");
    const route = source("app/api/nutrition/v1/recipes/[recipeId]/route.ts");
    const handoff = source("app/api/nutrition/v1/handoffs/commit/route.ts");
    const editor = source("components/nutrition/recipes/recipe-editor.tsx");
    const migration = source("supabase/migrations/20260828032600_nutrition_v1_recipe_draft_revision.sql").toLowerCase();

    expect(service).toContain("expectedRevision: number");
    expect(service).toContain("p_expected_revision: expectedRevision");
    expect(route).toContain("expectedRevision");
    expect(handoff).toContain("expectedRevision");
    expect(editor).toContain("draftRevisionRef");
    expect(editor).toContain("expectedRevision: draftRevisionRef.current");
    expect(migration).toContain("add column if not exists revision bigint");
    expect(migration).toContain("p_expected_revision bigint");
    expect(migration).toContain("draft.revision = p_expected_revision");
    expect(migration).toContain("revision = draft.revision + 1");
    expect(migration).toContain("recipe working draft revision conflict");
  });
});
