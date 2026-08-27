import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("expected barcode provider 503 is bounded to the barcode fallback scenario", async () => {
  const source = await readFile(new URL("./run-nutrition-v1-qa.mjs", import.meta.url), "utf8");
  assert.match(source, /item\.name\s*===\s*"food-library-mobile-barcode-fallback"/);
  assert.match(source, /expectedBarcodeFailure/);
  assert.match(source, /Failed to load resource[\s\S]{0,220}503/);
  assert.match(source, /!expectedAutosaveFailure\s*&&\s*!expectedBarcodeFailure/);
});
