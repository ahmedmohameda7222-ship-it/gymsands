import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const wrapper = readFileSync("scripts/run-workout-history-qa.mjs", "utf8");
const reportQa = readFileSync("scripts/run-workout-report-qa.mjs", "utf8");

test("P8A preserves canonical Workout History QA before report-specific evidence", () => {
  assert.equal(existsSync("scripts/run-workout-history-core-qa.mjs"), true);
  const canonical = wrapper.indexOf("scripts/run-workout-history-core-qa.mjs");
  const p8a = wrapper.indexOf("scripts/run-workout-report-qa.mjs");
  assert.ok(canonical >= 0);
  assert.ok(p8a > canonical);
});

test("P8A report QA requires exact-head multilingual and multi-viewport evidence", () => {
  assert.match(reportQa, /QA_HEAD_SHA/u);
  assert.match(reportQa, /desktop-en-success/u);
  assert.match(reportQa, /desktop-de-success/u);
  assert.match(reportQa, /tablet-ar-success/u);
  assert.match(reportQa, /mobile-en-success/u);
  assert.match(reportQa, /mobile-ar-failure/u);
  assert.match(reportQa, /mobile-de-slow/u);
  assert.match(reportQa, /scheduled-no-action/u);
  assert.match(reportQa, /P8A_PDF_EVIDENCE_DIR/u);
assert.match(reportQa, /pdftoppm/u);
assert.match(reportQa, /process\.env\.CI === "true"/u);
assert.match(reportQa, /process\.platform === "linux"/u);
assert.match(reportQa, /"poppler-utils"/u);
assert.match(reportQa, /ensurePdfPageRenderer\(\)/u);
assert.doesNotMatch(reportQa, /shell:\s*true/u);
  assert.match(reportQa, /reportRequests\.length === \(performed \? 1 : 0\)/u);
  assert.match(reportQa, /Number\.parseFloat\(after\.buttonMinHeight/u);
  assert.match(reportQa, /actionRestored/u);
  assert.match(reportQa, /directionValid/u);
  assert.doesNotMatch(reportQa, /window\.print|target\s*=\s*["']_blank/u);
});
