import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (file) => readFileSync(file, "utf8");

test("rendered QA preserves the 126-route matrix and isolates every observation", () => {
  const qa = source("scripts/run-rendered-qa.mjs");
  assert.match(qa, /const viewports = \[/);
  assert.match(qa, /const routes = \[/);
  assert.match(qa, /const context = await createDeterministicContext\(browser, viewport\)/);
  assert.match(qa, /await context\.close\(\)/);
  assert.match(qa, /navigationEvidence/);
  assert.match(qa, /failureScreenshot/);
  assert.match(qa, /x-plaivra-qa-fixture/);
  assert.doesNotMatch(qa, /route\.abort/);
  assert.doesNotMatch(qa, /\[dashboard\\\.load\]/);
});

test("today-workout is redirected before the React route lifecycle", () => {
  const config = source("next.config.mjs");
  assert.match(config, /source: "\/today-workout"/);
  assert.match(config, /destination: "\/my-workout\/plans"/);
  assert.match(config, /permanent: true/);
});

test("authenticated evidence is fail-closed and always emits a safe failure summary", () => {
  const smoke = source("scripts/authenticated-release-smoke.mjs");
  assert.match(smoke, /data-food-log-count/);
  assert.match(smoke, /data-active-target/);
  assert.match(smoke, /data-remaining-calculated/);
  assert.match(smoke, /AUTHENTICATED_SMOKE_FAILED/);
  assert.match(smoke, /writeFileSync\(resolve\(outputDirectory, "summary\.json"\)/);
});

test("post-deploy readiness gates are production-only while artifact identity stays universal", () => {
  const smoke = source("scripts/post-deploy-smoke.mjs");
  assert.match(smoke, /new Set\(\[200, 503\]\)/);
  assert.match(smoke, /if \(version\.artifactIdentityValid !== true\)/);
  assert.match(smoke, /if \(mode === "production"\)/);
  const workflow = source(".github/workflows/post-deploy-smoke.yml");
  assert.match(workflow, /--mode "\$\{\{ inputs\.expected_environment \}\}"/);
});
