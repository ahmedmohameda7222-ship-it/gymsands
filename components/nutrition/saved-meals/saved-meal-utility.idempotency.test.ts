import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Saved Meal utility uncertain-completion identity", () => {
  it("persists one create operation ID across retry and clears it only after confirmed success", async () => {
    const source = await readFile(new URL("./saved-meal-utility.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/savedMealCreateOperationStorageKey/);
    expect(source).toMatch(/sessionStorage\.getItem/);
    expect(source).toMatch(/sessionStorage\.setItem/);
    expect(source).toMatch(/operationId/);
    expect(source.includes("editingId")).toBe(true);
    expect(source).toMatch(/operationId[^\n]*name|name[^\n]*operationId/);
    expect(source).toMatch(/sessionStorage\.removeItem/);
  });
});
