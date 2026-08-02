import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function readJson(relativePath) {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

test("Vercel compute is colocated with the Frankfurt database region contract", () => {
  const vercel = readJson("../vercel.json");
  const budgets = readJson("../config/performance-budgets.json");

  assert.deepEqual(vercel.regions, [budgets.deployment.primaryFunctionRegion]);
  assert.equal(budgets.deployment.primaryFunctionRegion, "fra1");
  assert.equal(budgets.deployment.databaseRegion, "eu-central-1");
});

test("performance budgets remain versioned, positive, and machine readable", () => {
  const budgets = readJson("../config/performance-budgets.json");

  assert.equal(budgets.contractVersion, 1);
  assert.deepEqual(Object.keys(budgets.metrics).sort(), ["APP_BOOT", "CLS", "INP", "LCP"]);
  for (const [metric, contract] of Object.entries(budgets.metrics)) {
    assert.ok(["ms", "score"].includes(contract.unit), `${metric} has an unsupported unit`);
    assert.equal(typeof contract.p75Maximum, "number");
    assert.ok(Number.isFinite(contract.p75Maximum) && contract.p75Maximum > 0);
  }
  for (const [name, value] of Object.entries(budgets.operational)) {
    assert.equal(typeof value, "number", `${name} must be numeric`);
    assert.ok(Number.isFinite(value) && value > 0, `${name} must be positive`);
  }
});
