import assert from "node:assert/strict";
import test from "node:test";

import { classifyChangedPaths } from "./ci-change-scope.mjs";

test("performance deployment authorities run core, CI, and build without unrelated database replay", () => {
  for (const path of ["vercel.json", "config/performance-budgets.json"]) {
    const scope = classifyChangedPaths([path]);
    assert.equal(scope.docsOnly, false);
    assert.equal(scope.core, true);
    assert.equal(scope.ci, true);
    assert.equal(scope.build, true);
    assert.equal(scope.database, false);
    assert.equal(scope.ui, false);
    assert.equal(scope.fallback, false);
  }
});
