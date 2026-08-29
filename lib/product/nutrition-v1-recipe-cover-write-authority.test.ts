import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Nutrition V1 Recipe cover write authority", () => {
  it("validates owner-scoped storage paths inside the persistence service", () => {
    const workspace = source("services/nutrition-v1/server/recipe-workspace.ts");
    expect(workspace).toContain('from "@/lib/nutrition-v1/recipe-cover-path"');
    expect(workspace).toContain("normalizeOwnedRecipeCoverPath(userId, patch.coverPath)");
    expect(workspace).not.toContain("update.cover_path = patch.coverPath?.trim() || null");
  });
});
