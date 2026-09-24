import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

describe("Food Browser authoritative log feedback", () => {
  it("reports calories from the committed Food Log after Catalog serving projection", () => {
    const browser = source("components/meals/food-browser.tsx");
    const logFoodNow = browser
      .split("async function logFoodNow")[1]
      .split("async function addToPlan")[0];

    expect(logFoodNow).toContain(
      'description: `${nutritionDisplay(log.calories, " kcal")} logged.`',
    );
    expect(logFoodNow).not.toContain(
      'description: `${nutritionDisplay(macros.calories, " kcal")} logged.`',
    );
  });
});
