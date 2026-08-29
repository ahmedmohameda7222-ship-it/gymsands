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

  it("scopes pending Saved Meal create recovery to the authenticated owner", async () => {
    const source = await readFile(new URL("./saved-meal-utility.tsx", import.meta.url), "utf8");

    expect(source).toMatch(/function savedMealCreateOperationStorageKey\(ownerId: string\)/);
    expect(source).toMatch(/`plaivra:nutrition-v1:saved-meal:create:pending:\$\{ownerId\}`/);
    expect(source).toMatch(/pendingSavedMealCreateOperation\(ownerId,/);
    expect(source).toMatch(/clearSavedMealCreateOperation\(ownerId,/);
  });

  it("leaves create mode immediately after confirmed creation before refresh/detail reads can fail", async () => {
    const source = await readFile(new URL("./saved-meal-utility.tsx", import.meta.url), "utf8");
    const start = source.indexOf("async function save()");
    const end = source.indexOf("async function removeCurrent()", start);
    const save = source.slice(start, end);
    const clear = save.indexOf("clearSavedMealCreateOperation");
    const leaveCreate = save.indexOf('setMode("browse")');
    const refresh = save.indexOf("await loadActive()");
    const detail = save.indexOf("await openDetail(");

    expect(start).toBeGreaterThanOrEqual(0);
    expect(clear).toBeGreaterThanOrEqual(0);
    expect(leaveCreate).toBeGreaterThan(clear);
    expect(refresh).toBeGreaterThan(leaveCreate);
    expect(detail).toBeGreaterThan(refresh);
  });
});