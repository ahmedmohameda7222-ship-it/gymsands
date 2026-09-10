import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";

async function source(name) {
  return readFile(new URL(`./${name}`, import.meta.url), "utf8");
}

describe("Plan 7 runtime certification boundary", () => {
  it("binds canonical versus diagnostic registry authority into export artifacts", async () => {
    const text = await source("export-food-catalog-portable.mjs");
    assert.match(text, /registryAuthority/);
    assert.match(text, /CANONICAL_REGISTRY_V1/);
    assert.match(text, /DIAGNOSTIC_SUBSET/);
  });

  it("restore explicitly validates canonical profile completeness before trusted loading", async () => {
    const text = await source("restore-food-catalog-portable.mjs");
    assert.match(text, /validateCanonicalProfileManifest/);
    assert.match(text, /certificationEligible/);
  });

  it("search verifier reports search facts but cannot manufacture drReady", async () => {
    const text = await source("verify-food-catalog-restored-search.mjs");
    assert.doesNotMatch(text, /\bdrReady\s*:/);
    assert.doesNotMatch(text, /protectedFixtureVerified\s*&&/);
  });

  it("restore report derives trust from mandatory assertion evidence instead of caller trusted booleans", async () => {
    const text = await source("verify-food-catalog-restore.mjs");
    assert.doesNotMatch(text, /assertions\.trusted\s*===\s*true/);
    assert.match(text, /evaluateRestoreAssertions/);
  });
});
