import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("Nutrition V1 final-review water retry contract", () => {
  it("retains one client operation identity for an unchanged ambiguous water retry", () => {
    const page = source("components/nutrition/diary/diary-page.tsx");
    expect(page).toContain("resolveWaterLogIntent");
    expect(page).toMatch(/kind:\s*"water"[\s\S]{0,220}operationId:\s*intent\.operationId/);
    expect(page).toContain("waterIntentRef.current = null");
  });

  it("uses a canonical idempotent database command rather than a direct water_logs insert", () => {
    const server = source("services/nutrition-v1/server/diary.ts");
    expect(server).toContain('rpc("log_nutrition_water"');
    expect(server).not.toMatch(/function addDiaryWater[\s\S]{0,900}\.from\("water_logs"\)\s*\.insert/);
  });
});
