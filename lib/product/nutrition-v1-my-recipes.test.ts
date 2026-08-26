import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildFrozenRecipeShareText,
  parsePublishedRecipeCache,
  qualifiesForObjectiveRecipeFilter,
  serializePublishedRecipeCache,
  type PublishedRecipeCacheSnapshot,
} from "@/lib/nutrition-v1/recipe-cache";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const completePublished: PublishedRecipeCacheSnapshot = {
  status: "published",
  recipeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  recipeVersionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  versionNumber: 3,
  name: "Chicken Alfredo",
  servings: 4,
  totalTimeMinutes: 35,
  cuisine: "Italian",
  favorite: true,
  coverPhotoUrl: null,
  ingredients: [
    { ingredientName: "Chicken", quantity: 500, unit: "g", foodId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", verified: true },
    { ingredientName: "Cream", quantity: 200, unit: "ml", foodId: null, verified: false },
  ],
  instructions: ["Cook the chicken.", "Combine with the sauce."],
  nutritionPerServing: { calories: 520, protein_g: 42, carbs_g: 48, fat_g: 19 },
  cachedAt: "2026-08-26T03:00:00.000Z",
};

describe("Nutrition V1 My Recipes offline and truthfulness authority", () => {
  it("round-trips only a frozen published Recipe version for offline detail", () => {
    const raw = serializePublishedRecipeCache(completePublished);
    expect(parsePublishedRecipeCache(raw)).toEqual(completePublished);

    expect(() =>
      serializePublishedRecipeCache({ ...completePublished, status: "draft", recipeVersionId: "" } as unknown as PublishedRecipeCacheSnapshot),
    ).toThrow(/published|version/i);
  });

  it("does not qualify unknown or incomplete nutrition for objective filters", () => {
    expect(qualifiesForObjectiveRecipeFilter("high-protein", completePublished.nutritionPerServing)).toBe(true);
    expect(qualifiesForObjectiveRecipeFilter("low-carb", completePublished.nutritionPerServing)).toBe(false);
    expect(qualifiesForObjectiveRecipeFilter("high-protein", { calories: 520, protein_g: null, carbs_g: 48, fat_g: 19 })).toBe(false);
    expect(qualifiesForObjectiveRecipeFilter("low-carb", null)).toBe(false);
  });

  it("shares a frozen published snapshot without internal identifiers or session state", () => {
    const text = buildFrozenRecipeShareText(completePublished);
    expect(text).toContain("Chicken Alfredo");
    expect(text).toContain("4 servings");
    expect(text).toContain("Chicken — 500 g");
    expect(text).toContain("Cook the chicken.");
    expect(text).toContain("520 kcal");
    expect(text).not.toContain(completePublished.recipeId);
    expect(text).not.toContain(completePublished.recipeVersionId);
    expect(text).not.toMatch(/versionNumber|cachedAt|Cooking Session/i);
  });
});

describe("Nutrition V1 My Recipes product surface", () => {
  const requiredFiles = [
    "app/(private)/my-recipes/page.tsx",
    "app/(private)/my-recipes/[recipeId]/page.tsx",
    "app/(private)/my-recipes/[recipeId]/edit/page.tsx",
    "components/nutrition/recipes/recipe-home.tsx",
    "components/nutrition/recipes/recipe-row.tsx",
    "components/nutrition/recipes/recipe-editor.tsx",
    "components/nutrition/recipes/recipe-detail.tsx",
    "components/nutrition/recipes/recently-deleted-recipes.tsx",
    "lib/nutrition-v1/recipe-cache.ts",
  ];

  it("implements the complete planned My Recipes route/component surface", () => {
    for (const path of requiredFiles) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("keeps Home bounded, search-first, flat, and free of organizational/ecommerce UI", () => {
    const home = source("components/nutrition/recipes/recipe-home.tsx");
    expect(home).toContain("My Recipes");
    expect(home).toContain("Search recipes");
    expect(home).toContain("Continue");
    expect(home).toContain("Recently Used");
    expect(home).toContain("Favorites");
    expect(home).toContain("All Recipes");
    expect(home).toContain("Create manually");
    expect(home).toContain("Create with ChatGPT");
    expect(home).toContain("Import with ChatGPT");
    expect(home).toContain("Favorites");
    expect(home).toContain("Drafts");
    expect(home).toContain("Filters");
    expect(home).toContain("Ingredients");
    expect(home).toContain("Total time");
    expect(home).toContain("Cuisine");
    expect(home).toContain("High Protein");
    expect(home).toContain("Low Carb");
    expect(home).not.toMatch(/Collections|Folders|grid-cols-3|grid-cols-4|ratings|marketplace/i);
  });

  it("keeps Recipe rows decision-focused and uses positive-only shield-check verification", () => {
    const row = source("components/nutrition/recipes/recipe-row.tsx");
    expect(row).toContain("ShieldCheck");
    expect(row).toContain('aria-label="Plaivra Verified"');
    expect(row).toContain("Draft");
    expect(row).toContain("Continue");
    expect(row).not.toMatch(/ingredient count|track count|equipment count/i);
  });

  it("keeps the editor progressive, Food-first but manual-capable, and limited to one cover photo", () => {
    const editor = source("components/nutrition/recipes/recipe-editor.tsx");
    expect(editor).toContain("Recipe name");
    expect(editor).toContain("Servings");
    expect(editor).toContain("Add ingredient");
    expect(editor).toContain("Add as ingredient");
    expect(editor).toContain("Add step");
    expect(editor).toContain("More details");
    expect(editor).toContain("Add cooking details");
    expect(editor).toContain("coverPhotoUrl");
    expect(editor).toContain("Replace photo");
    expect(editor).toContain("Remove photo");
    expect(editor).not.toMatch(/coverPhotos|gallery|step photo|recipe video/i);
  });

  it("uses only the approved external ChatGPT proposal + explicit approval model", () => {
    const editor = source("components/nutrition/recipes/recipe-editor.tsx");
    expect(editor).toContain("Create with ChatGPT");
    expect(editor).toContain("Import with ChatGPT");
    expect(editor).toContain("Finish with ChatGPT");
    expect(editor).toContain("Open in ChatGPT");
    expect(editor).toMatch(/review.*approve|approve.*review/i);
    expect(editor).not.toMatch(/Ask your AI chef|chat field|chat bubble|messages\.map/i);
  });

  it("restricts finished-use actions to published Recipes and shares the frozen version", () => {
    const detail = source("components/nutrition/recipes/recipe-detail.tsx");
    expect(detail).toContain("Start Cooking");
    expect(detail).toContain("Add to…");
    expect(detail).toContain("Edit");
    expect(detail).toContain("Duplicate");
    expect(detail).toContain("Share");
    expect(detail).toContain("buildFrozenRecipeShareText");
    expect(detail).toMatch(/published|isPublished/);
    expect(detail).toContain("Nutrition per serving");
    expect(detail).toContain("More nutrition");
  });

  it("uses Recently Deleted recovery language instead of exposing Archive as the user lifecycle", () => {
    const deleted = source("components/nutrition/recipes/recently-deleted-recipes.tsx");
    const userSurface = [
      source("components/nutrition/recipes/recipe-home.tsx"),
      source("components/nutrition/recipes/recipe-row.tsx"),
      source("components/nutrition/recipes/recipe-editor.tsx"),
      source("components/nutrition/recipes/recipe-detail.tsx"),
      deleted,
    ].join("\n");
    expect(deleted).toContain("Recently Deleted");
    expect(deleted).toContain("Restore");
    expect(deleted).toContain("Delete Now");
    expect(deleted).toMatch(/30 days|30-day/i);
    expect(userSurface).not.toMatch(/>\s*Archive\s*</i);
  });
});
