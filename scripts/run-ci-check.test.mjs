import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCiCheck } from "./run-ci-check.mjs";

function sink() {
  let value = "";
  return {
    stream: { write(chunk) { value += String(chunk); } },
    read: () => value,
  };
}

test("successful checks keep the console concise and retain the full log", async () => {
  const root = mkdtempSync(join(tmpdir(), "plaivra-ci-check-pass-"));
  const stdout = sink();
  const stderr = sink();
  try {
    const result = await runCiCheck({
      name: "pass",
      command: [process.execPath, "-e", "console.log('full success output')"],
      reportsDir: "reports",
      cwd: root,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    assert.equal(result.passed, true);
    assert.equal(stdout.read(), "PASS pass\n");
    assert.equal(stderr.read(), "");
    assert.match(readFileSync(join(root, "reports", "pass.log"), "utf8"), /full success output/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("failed checks print only a bounded tail and write a focused summary", async () => {
  const root = mkdtempSync(join(tmpdir(), "plaivra-ci-check-fail-"));
  const stdout = sink();
  const stderr = sink();
  try {
    const script = "for (let i=0;i<80;i++) console.log('line-'+i); process.exit(7)";
    const result = await runCiCheck({
      name: "fail",
      command: [process.execPath, "-e", script],
      reportsDir: "reports",
      tailLines: 20,
      cwd: root,
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    assert.equal(result.passed, false);
    assert.equal(result.exitCode, 7);
    assert.doesNotMatch(stderr.read(), /line-0\n/);
    assert.match(stderr.read(), /line-79/);
    assert.match(stderr.read(), /FULL LOG ARTIFACT: reports\/fail\.log/);
    assert.match(readFileSync(join(root, "reports", "fail-failure-summary.txt"), "utf8"), /FAILED CHECK: fail/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
