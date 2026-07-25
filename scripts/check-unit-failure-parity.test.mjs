import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./check-unit-failure-parity.mjs", import.meta.url), "utf8");

test("unit failure parity rejects only failures introduced by the reviewed head", () => {
  assert.match(source, /const passed = introduced\.length === 0;/);
  assert.doesNotMatch(source, /const passed = introduced\.length === 0 && removed\.length === 0;/);
});
