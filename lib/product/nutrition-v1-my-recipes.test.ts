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
    "lib/i18n/nutrition-v1.ts",
    "lib/nutrition-v1/recipe-cache.ts",
  ];

  it("implements the complete planned My Recipes route/component surface", () => {
    for (const path of requiredFiles) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("keeps Home bounded, search-first, flat, localized, and free of organizational/ecommerce UI", () => {
    const home = source("components/nutrition/recipes/recipe-home.tsx");
    const dictionaries = source("lib/i18n/nutrition-v1.ts");

    expect(home).toContain("useNutritionV1Translation");
    for (const key of [
      "myRecipes",
      "searchRecipes",
      "continue",
      "recentlyUsed",
      "favorites",
      "allRecipes",
      "createManually",
      "createWithChatGpt",
      "importWithChatGpt",
      "drafts",
      "filters",
      "ingredients",
      "totalTime",
      "cuisine",
      "highProtein",
      "lowCarb",
    ]) {
      expect(home).toContain(`nt("${key}")`);
    }
    expect(dictionaries).toContain('myRecipes: "My Recipes"');
    expect(dictionaries).toContain('searchRecipes: "Search recipes"');
    expect(dictionaries).toContain('createWithChatGpt: "Create with ChatGPT"');
    expect(dictionaries).toContain('myRecipes: "Meine Rezepte"');
    expect(dictionaries).toContain('myRecipes: "وصفاتي"');
    expect(dictionaries).not.toMatch(/Collections|Folders|ratings|marketplace/i);
    expect(home).not.toMatch(/Collections|Folders|grid-cols-3|grid-cols-4|ratings|marketplace/i);
  });

  it("keeps Recipe rows decision-focused and uses localized positive-only shield-check verification", () => {
    const row = source("components/nutrition/recipes/recipe-row.tsx");
    const dictionaries = source("lib/i18n/nutrition-v1.ts");

    expect(row).toContain("useNutritionV1Translation");
    expect(row).toContain("ShieldCheck");
    expect(row).toContain('"Plaivra Verified"');
    expect(row).toContain('"Von Plaivra verifiziert"');
    expect(row).toContain('"موثّق من Plaivra"');
    expect(row).toContain('"Draft"');
    expect(row).toContain('"Continue"');
    expect(dictionaries).toContain('plaivraVerified: "Plaivra Verified"');
    expect(dictionaries).toContain('plaivraVerified: "Von Plaivra verifiziert"');
    expect(dictionaries).toContain('plaivraVerified: "موثّق من Plaivra"');
    expect(row).not.toMatch(/ingredient count|track count|equipment count/i);
  });

  it("keeps the editor progressive, Food-first but manual-capable, localized, and limited to one cover photo", () => {
    const editor = source("components/nutrition/recipes/recipe-editor.tsx");
    const dictionaries = source("lib/i18n/nutrition-v1.ts");
    expect(editor).toContain("useNutritionV1Translation");
    for (const key of ["recipeName", "servings", "addIngredient", "addAsIngredient", "addStep", "moreDetails", "addCookingDetails", "replacePhoto", "removePhoto"]) {
      expect(editor).toContain(`nt("${key}")`);
    }
    expect(editor).toContain("coverPhotoUrl");
    expect(dictionaries).toContain('recipeName: "Recipe name"');
    expect(dictionaries).toContain('recipeName: "Rezeptname"');
    expect(dictionaries).toContain('recipeName: "اسم الوصفة"');
    expect(editor).not.toMatch(/coverPhotos|gallery|step photo|recipe video/i);
  });

  it("uses only the approved external ChatGPT proposal + explicit approval model", () => {
    const editor = source("components/nutrition/recipes/recipe-editor.tsx");
    for (const key of ["createWithChatGpt", "importWithChatGpt", "finishWithChatGpt", "openInChatGpt", "proposalApprovalDescription"]) {
      expect(editor).toContain(`nt("${key}")`);
    }
    expect(editor).toContain("Use the authorized Plaivra Nutrition MCP Draft write only after I explicitly approve the proposal.");
    expect(editor).toContain("Do not treat ChatGPT nutrient estimates as Plaivra nutrition authority.");
    expect(editor).toContain("Do not publish the Recipe.");
    expect(editor).not.toMatch(/Ask your AI chef|chat field|chat bubble|messages\.map/i);
  });

  it("restricts finished-use actions to published Recipes and shares the frozen version", () => {
    const detail = source("components/nutrition/recipes/recipe-detail.tsx");
    expect(detail).toContain("useNutritionV1Translation");
    for (const key of ["startCooking", "addTo", "edit", "duplicate", "share", "nutritionPerServing", "moreNutrition"]) {
      expect(detail).toContain(`nt("${key}")`);
    }
    expect(detail).toContain("buildFrozenRecipeShareText");
    expect(detail).toMatch(/published|isPublished/);
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
