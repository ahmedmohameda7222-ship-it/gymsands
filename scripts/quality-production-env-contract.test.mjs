import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const qualityWorkflow = readFileSync(new URL("../.github/workflows/quality.yml", import.meta.url), "utf8");

const requiredCatalogContract = [
  ["PLAIVRA_ACTIVITY_CATALOG_MODE", "library_v2_with_legacy_fallback"],
  ["PLAIVRA_ACTIVITY_CATALOG_BASE_URL", "https://plaivra-activity-catalog-api.vercel.app"],
  ["PLAIVRA_ACTIVITY_CATALOG_API_KEY", "ci-placeholder-catalog-key-long-enough"],
];

test("canonical Quality supplies the Activity Catalog V2 production environment contract", () => {
  for (const [key, value] of requiredCatalogContract) {
    assert.ok(
      qualityWorkflow.includes(`${key}: ${value}`),
      `canonical Quality must configure ${key}`,
    );
  }
});
