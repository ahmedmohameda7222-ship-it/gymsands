import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Today's Workout nullable meal calories", () => {
  it("renders unknown meal-plan calories explicitly instead of a blank kcal label", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "components/workouts/todays-workout.tsx"),
      "utf8",
    );

    expect(source).toMatch(
      /item\.calories === null\s*\?\s*["']—["']\s*:\s*item\.calories/,
    );
    expect(source).not.toMatch(
      /\{item\.meal_type\}\s*\|\s*\{item\.calories\}\s*kcal/,
    );
  });
});
