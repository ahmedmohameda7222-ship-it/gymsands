import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function functionBody(source: string, start: string, end: string) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
}

describe("nullable nutrition compatibility regression guard", () => {
  it("does not coerce Food Library catalog nutrition through the generic zero fallback", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/meals/food-browser.tsx"), "utf8");
    const loggingSource = fs.readFileSync(path.join(process.cwd(), "services/database/food-library-logging.ts"), "utf8");
    const normalizeBody = functionBody(source, "function normalizeFoodItem", "function customMealCategory");
    const unknownBody = functionBody(source, "function hasUnknownMacros", "function nutritionDisplay");
    const logBody = functionBody(source, "async function logFoodNow", "async function addToPlan");
    const libraryLogBody = functionBody(loggingSource, "export async function addFoodLibraryItemToToday", "}");

    expect(normalizeBody).not.toMatch(/(?:Number|toNumber)\(food\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(unknownBody).not.toMatch(/(?:Number|toNumber)\(value\)\s*===\s*0/);
    expect(logBody).toMatch(/addFoodLibraryItemToToday/);
    expect(libraryLogBody).toMatch(/food\.is_global/);
    expect(libraryLogBody).toMatch(/addUserFoodToToday/);
  });

  it("does not sum frozen Eat nutrition through the generic zero fallback", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "lib/eat/eat-model.ts"), "utf8");
    const sumBody = functionBody(source, "export function sumEatLogs", "export function progressState");
    const weekBody = functionBody(source, "export function buildWeekAnalytics", "}");

    expect(sumBody).not.toMatch(/finite\(log\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(weekBody).not.toMatch(/finite\(day\.(?:calories|protein_g|carbs_g|fat_g)\)/);
  });

  it("does not normalize frozen Eat rows to zero before compensation or edit", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "services/database/eat.ts"), "utf8");
    const payloadBody = functionBody(source, "function payloadFromRow", "function editableValuesMatch");

    expect(payloadBody).not.toMatch(/number\(row\.(?:calories|protein_g|carbs_g|fat_g)\)/);
  });

  it("keeps nullable planned-meal adjustment fields unknown instead of drafting zero", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/meals/eat-planned-meal-adjust.tsx"), "utf8");
    const draftBody = functionBody(source, "function draft", "export function EatPlannedMealAdjust");

    expect(draftBody).not.toMatch(/Number\(item\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(draftBody).not.toMatch(/(?:calories|proteinG|carbsG|fatG):[^\n}]*\|\|\s*0/);
    expect(source).toMatch(/value=\{value === null \? "" : value\}/);
  });

  it("keeps Meal Plan nullable snapshots unknown in display and edit paths", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "components/meals/my-meal-plan/my-meal-plan-page-client.tsx"), "utf8");
    const draftBody = functionBody(source, "function draftFromItem", "function draftErrors");
    const saveBody = functionBody(source, "async function saveEdit", "async function markDone");
    const rowBody = functionBody(source, "function MealRow", "function AddMealDialog");

    expect(draftBody).not.toMatch(/String\(item\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(saveBody).not.toMatch(/Number\(editDraft\.(?:calories|protein|carbs|fat)\)/);
    expect(rowBody).not.toMatch(/Math\.round\(item\.(?:calories|protein_g|carbs_g|fat_g)\)/);
  });
});