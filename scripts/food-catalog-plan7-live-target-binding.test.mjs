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

test("final integrated certification rejects non-disposable targetUrl before every live target probe", () => {
  const verifier = readFileSync("scripts/verify-food-catalog-integrated-restore.mjs", "utf8");

  assert.match(verifier, /assertDisposableRestoreTarget/,
    "Final verification must reuse the canonical disposable-target guard.");
  assert.match(verifier, /async function recaptureLiveTargetArtifact[\s\S]*runAuthoritativeExport\(\{/,
    "The live readback helper must continue to execute the authoritative FULL_DR export.");

  const verificationBody = verifier.slice(verifier.indexOf("export async function verifyIntegratedRestore"));
  const guardIndex = verificationBody.indexOf("assertDisposableRestoreTarget(options.targetUrl");
  assert.notEqual(guardIndex, -1,
    "Final verification must validate options.targetUrl as disposable.");

  for (const probe of [
    "queryPortableTargetProfile(options.targetUrl)",
    "recaptureLiveTargetArtifact({",
    "captureFoodCatalogSecurityEvidence(options.targetUrl)",
    "captureRestoredServiceAuthority(options.targetUrl",
    "queryOwnerBindingEvidence(options.targetUrl)",
    "verifyMergeGraph(options.targetUrl)",
    "captureSearchRuntimeEvidence(options.targetUrl",
  ]) {
    const probeIndex = verificationBody.indexOf(probe);
    assert.notEqual(probeIndex, -1, `Expected live target probe ${probe} to remain present.`);
    assert.ok(guardIndex < probeIndex,
      `Disposable-target validation must run before live target probe ${probe}.`);
  }
});