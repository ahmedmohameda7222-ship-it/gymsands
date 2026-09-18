import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

test("canonical pre-pointer runtime verification is bound to the explicit restore target for every entrypoint", async () => {
  const helper = await readFile(new URL("../lib/food-catalog/portability/pre-pointer-verification.mjs", import.meta.url), "utf8");
  const restore = await readFile(new URL("./restore-food-catalog-portable.mjs", import.meta.url), "utf8");

  assert.doesNotMatch(helper, /process\.argv|restoreDatabaseUrlFromProcess/,
    "Pre-pointer security verification must not depend on the process entrypoint or argv.");
  assert.match(helper, /buildPrePointerVerificationSql\s*\(\s*input\s*,\s*databaseUrl\s*\)/,
    "The canonical pre-pointer verifier must require an explicit database URL.");
  assert.match(restore, /buildPrePointerVerificationSql\s*\(\s*pointerPreflightInput\([^;]+\)\s*,\s*targetUrl\s*\)/s,
    "restorePortableArtifact must pass its already-validated target URL into canonical pre-pointer verification.");
});
