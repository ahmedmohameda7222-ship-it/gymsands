import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

const diaryPage = "components/nutrition/diary/diary-page.tsx";
const loggingSession = "components/nutrition/diary/logging-session.tsx";
const plateDock = "components/nutrition/diary/plate-dock.tsx";

describe("Nutrition V1 canonical Diary product contract", () => {
  it("creates the planned authenticated Diary projection/log routes and focused UI surface", () => {
    for (const path of [
      "services/nutrition-v1/server/diary.ts",
      "app/api/nutrition/v1/diary/route.ts",
      "app/api/nutrition/v1/log/route.ts",
      diaryPage,
      loggingSession,
      plateDock,
    ]) expect(existsSync(join(root, path)), path).toBe(true);
  });

  it("replaces the normal /calories path with DiaryPage only after the canonical surface exists", () => {
    const route = source("app/(private)/calories/page.tsx");
    expect(route).toContain("DiaryPage");
    expect(route).not.toContain("EatPage");
    expect(route).toContain("Suspense");
  });

  it("keeps localized actual, target, planned context, and hydration visibly distinct", () => {
    const page = source(diaryPage);
    expect(page).toContain("useEatTranslation");
    expect(page).toContain("useNutritionV1Translation");
    expect(page).toContain('nt("diary")');
    expect(page).toContain('et("remaining")');
    expect(page).toContain('et("water")');
    expect(page).toContain("copy.actual");
    expect(page).toContain("copy.planned");
    expect(page).toContain("historicalOther");
    expect(page).toContain("/api/nutrition/v1/diary");
    expect(page).toContain("en:");
    expect(page).toContain("de:");
    expect(page).toContain("ar:");
    expect(page).not.toMatch(/planned[^\n]{0,100}(remaining|consumed)/i);
  });

  it("uses one localized search-first Food Logging Session instead of a method-picker-first workflow", () => {
    const logger = source(loggingSession);
    expect(logger).toContain("useEatTranslation");
    expect(logger).toContain('value: "search"');
    expect(logger).toContain('value: "barcode"');
    expect(logger).toContain('value: "quick-add"');
    expect(logger).toContain('value: "saved-meals"');
    expect(logger).toContain('value: "recipes"');
    expect(logger).toContain('et("searchFoods")');
    expect(logger).toContain('et("barcode")');
    expect(logger).toContain("text.quickAdd");
    expect(logger).toContain('et("savedMeals")');
    expect(logger).toContain("text.recipes");
    expect(logger).not.toMatch(/Choose (a )?(logging )?method|Select method/i);
  });

  it("retains one Plate while switching Search, Barcode, Quick Add, Saved Meals, and Recipes", () => {
    const logger = source(loggingSession);
    expect(logger).toContain("const [plate");
    expect(logger).toContain("setPlate");
    for (const mode of ["search", "barcode", "quick-add", "saved-meals", "recipes"]) {
      expect(logger).toContain(`\"${mode}\"`);
    }
    expect(logger).not.toMatch(/setPlate\(\[\]\)[\s\S]{0,160}(barcode|quick-add|saved-meals|recipes)/);
  });

  it("uses bounded short-lived draft recovery that clears only after confirmed logging", () => {
    const logger = source(loggingSession);
    expect(logger).toContain("DIARY_DRAFT_TTL_MS");
    expect(logger).toContain("localStorage");
    expect(logger).toContain("confirmed");
    expect(logger).toContain("removeItem");
    expect(logger).not.toMatch(/localStorage\.removeItem[\s\S]{0,120}(submitting|failed)/);
  });

  it("keeps Plate items editable and submits the entire logical meal with one operation ID", () => {
    const logger = source(loggingSession);
    const dock = source(plateDock);
    expect(dock).toContain("useEatTranslation");
    expect(dock).toContain("const copy =");
    expect(dock).toContain("en:");
    expect(dock).toContain("de:");
    expect(dock).toContain("ar:");
    expect(dock).toContain('et("quantity")');
    expect(dock).toContain("onRemove");
    expect(logger).toContain("crypto.randomUUID");
    expect(logger).toContain("/api/nutrition/v1/log");
    expect(logger).toContain("operationId");
    expect(logger).toContain("items: plate");
  });

  it("preserves compatibility Other only when actual data contains it", () => {
    const page = source(diaryPage);
    expect(page).toContain('mealType.toLowerCase() === "other"');
    expect(page).toContain("historicalOther");
    expect(page).not.toMatch(/\[\s*["']Breakfast["']\s*,\s*["']Lunch["']\s*,\s*["']Dinner["']\s*,\s*["']Snack[s]?["']\s*,\s*["']Other["']\s*\]/);
  });

  it("keeps Recipe and Saved Meal frozen lineage in the logger rather than flattening source authority", () => {
    const logger = source(loggingSession);
    expect(logger).toContain("recipeVersionId");
    expect(logger).toContain("frozenSnapshot");
    expect(logger).toContain("saved_meal");
    expect(logger).not.toMatch(/recipeVersionId\s*:\s*null/);
  });

  it("opens Log with changes from the plannedOccurrence query and keeps the selected plan in the logging session", () => {
    const page = source(diaryPage);
    expect(page).toContain('searchParams.get("plannedOccurrence")');
    expect(page).toContain("plannedOccurrenceId");
    expect(page).toContain("plannedOccurrence={plannedOccurrence}");
    expect(page).toContain("clearPlannedOccurrenceIntent");
  });

  it("seeds a resolvable planned occurrence into Plate while keeping Placeholder intent unverified", () => {
    const logger = source(loggingSession);
    const dock = source(plateDock);
    expect(logger).toContain("plannedOccurrenceToPlate");
    expect(logger).toContain("plannedOccurrence");
    expect(logger).toContain("frozenSnapshot.items");
    expect(logger).toContain('sourceType === "placeholder"');
    expect(dock).toContain('type: "planned_occurrence"');
  });

  it("confirms Log with changes through the atomic planned completion command with an execution snapshot", () => {
    const logger = source(loggingSession);
    expect(logger).toContain('kind: "complete_planned"');
    expect(logger).toContain("occurrenceId: plannedOccurrence.id");
    expect(logger).toContain("executionSnapshot");
    expect(logger).toContain("actualItems: plate");
    expect(logger).toContain("actualSource: sourceForPlate(plate)");
  });
});
