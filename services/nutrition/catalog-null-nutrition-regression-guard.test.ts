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
    const normalizeBody = functionBody(source, "function normalizeFoodItem", "function toNumber");
    const unknownBody = functionBody(source, "function hasUnknownMacros", "function sourceLabelForFood");

    expect(normalizeBody).not.toMatch(/toNumber\(food\.(?:calories|protein_g|carbs_g|fat_g)\)/);
    expect(unknownBody).not.toMatch(/toNumber\(value\)\s*===\s*0/);
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
});
