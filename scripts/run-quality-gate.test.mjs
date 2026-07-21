import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Writable } from "node:stream";
import { runQualityGate } from "./run-quality-gate.mjs";

const commit = "93f6aaad5d170bf5cfe304597317c7ffa3016e2a";
const buildTimestamp = "2026-07-21T16:00:00.000Z";

function capture() {
  let value = "";
  return {
    stream: new Writable({ write(chunk, _encoding, callback) { value += chunk.toString(); callback(); } }),
    read: () => value,
  };
}

async function withReports(run) {
  const directory = mkdtempSync(join(tmpdir(), "quality-gate-test-"));
  try {
    return await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("streams and retains stdout and stderr with exit zero", async () => {
  await withReports(async (reportsDir) => {
    const stdout = capture();
    const stderr = capture();
    const result = await runQualityGate({
      name: "success",
      reportsDir,
      commit,
      buildTimestamp,
      command: [process.execPath, "-e", "process.stdout.write('out'); process.stderr.write('err')"],
      cwd: process.cwd(),
      stdout: stdout.stream,
      stderr: stderr.stream,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(stdout.read(), "out");
    assert.equal(stderr.read(), "err");
    assert.match(readFileSync(join(reportsDir, "success.log"), "utf8"), /outerr/);
    assert.equal(readFileSync(join(reportsDir, "success.exit"), "utf8"), "0\n");
    const meta = JSON.parse(readFileSync(join(reportsDir, "success.meta.json"), "utf8"));
    assert.equal(meta.commitSha, commit);
    assert.equal(meta.passed, true);
  });
});

test("records and propagates a nonzero command exit", async () => {
  await withReports(async (reportsDir) => {
    const sink = capture();
    const result = await runQualityGate({
      name: "failure",
      reportsDir,
      commit,
      buildTimestamp,
      command: [process.execPath, "-e", "process.stderr.write('failed'); process.exit(7)"],
      cwd: process.cwd(),
      stdout: sink.stream,
      stderr: sink.stream,
    });
    assert.equal(result.exitCode, 7);
    assert.equal(result.passed, false);
    assert.equal(readFileSync(join(reportsDir, "failure.exit"), "utf8"), "7\n");
    assert.match(readFileSync(join(reportsDir, "failure.log"), "utf8"), /failed/);
  });
});

test("passes command arguments without shell interpolation", async () => {
  await withReports(async (reportsDir) => {
    const dangerous = "$(printf injected); value with spaces; && false";
    const sink = capture();
    const result = await runQualityGate({
      name: "arguments",
      reportsDir,
      commit,
      buildTimestamp,
      command: [process.execPath, "-e", "process.stdout.write(process.argv[1])", dangerous],
      cwd: process.cwd(),
      stdout: sink.stream,
      stderr: sink.stream,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(sink.read(), dangerous);
  });
});

test("does not record command arguments or secret values in metadata", async () => {
  await withReports(async (reportsDir) => {
    const secret = "super-secret-service-role-value";
    const sink = capture();
    await runQualityGate({
      name: "redacted",
      reportsDir,
      commit,
      buildTimestamp,
      command: [process.execPath, "-e", "process.exit(0)", secret],
      cwd: process.cwd(),
      stdout: sink.stream,
      stderr: sink.stream,
    });
    const metadata = readFileSync(join(reportsDir, "redacted.meta.json"), "utf8");
    const log = readFileSync(join(reportsDir, "redacted.log"), "utf8");
    assert.equal(metadata.includes(secret), false);
    assert.equal(log.includes(secret), false);
  });
});

test("leaves no false-passing partial evidence", async () => {
  await withReports(async (reportsDir) => {
    const sink = capture();
    const result = await runQualityGate({
      name: "partial",
      reportsDir,
      commit,
      buildTimestamp,
      command: [process.execPath, "-e", "process.exit(3)"],
      cwd: process.cwd(),
      stdout: sink.stream,
      stderr: sink.stream,
    });
    assert.equal(result.passed, false);
    assert.equal(readFileSync(join(reportsDir, "partial.exit"), "utf8"), "3\n");
    assert.equal(readdirSync(reportsDir).some((name) => name.includes(".tmp-")), false);
  });
});
