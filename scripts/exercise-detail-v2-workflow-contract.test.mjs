import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflow = await readFile(new URL("../.github/workflows/exercise-detail-v2-runtime.yml", import.meta.url), "utf8");
const matrix = await readFile(new URL("./run-exercise-detail-v2-matrix-qa.mjs", import.meta.url), "utf8");

test("Exercise Detail V2 runtime QA is an exact-head permanent PR gate", () => {
  assert.match(workflow, /^name: Exercise Detail V2 Runtime QA$/m);
  assert.match(workflow, /pull_request:\n    branches:\n      - main/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Exercise Detail V2 six-route rendered matrix/);
  assert.match(workflow, /node scripts\/run-exercise-detail-v2-matrix-qa\.mjs/);
  assert.match(workflow, /EXPECTED_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("rendered matrix keeps the six-route, viewport, locale, theme, motion and scaling authority", () => {
  for (const route of ["overview", "anatomy", "technique", "performance", "alternatives", "details"]) {
    assert.match(matrix, new RegExp(`\\"${route}\\"`));
  }
  for (const viewport of ["390, 844", "393, 852", "430, 932", "412, 915", "768, 1024", "1024, 768", "1280, 800", "1440, 900"]) {
    assert.match(matrix, new RegExp(viewport.replace(", ", ",\\s*")));
  }
  assert.match(matrix, /languageKey: "ar"/);
  assert.match(matrix, /theme: themes\[1\]/);
  assert.match(matrix, /motion: "reduce"/);
  assert.match(matrix, /document\.documentElement\.style\.zoom = String\(value\)/);
  assert.match(matrix, /shared provider refetched core detail/);
  assert.match(matrix, /serial domain discovery request detected/);
  assert.match(matrix, /eager video request detected/);
});
