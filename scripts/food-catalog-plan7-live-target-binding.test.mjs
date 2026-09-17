import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("final integrated certification recaptures readback, security and search from targetUrl", () => {
  const verifier = readFileSync("scripts/verify-food-catalog-integrated-restore.mjs", "utf8");

  assert.match(verifier, /runAuthoritativeExport/,
    "Final verification must recapture canonical FULL_DR readback from the supplied live target.");
  assert.match(verifier, /databaseUrl:\s*options\.targetUrl/,
    "Live readback export must use options.targetUrl rather than an independent artifact path.");
  assert.match(verifier, /captureFoodCatalogSecurityEvidence\(options\.targetUrl\)/,
    "Target security evidence must be recaptured from options.targetUrl.");
  assert.match(verifier, /captureSearchRuntimeEvidence\(options\.targetUrl,\s*options\.expectedHead,\s*["']restored-authoritative["']\)/,
    "Restored search evidence must be recaptured from options.targetUrl on the exact head.");
  assert.match(verifier, /Recorded target readback[\s\S]*fresh live target readback/i,
    "Recorded readback evidence must be checked against the fresh live recapture.");
  assert.match(verifier, /Recorded target security evidence[\s\S]*fresh proof on the current target/i,
    "Recorded target security evidence must match its live recapture.");
  assert.match(verifier, /Recorded restored search evidence[\s\S]*fresh proof on the current target/i,
    "Recorded target search evidence must match its live recapture.");
});
