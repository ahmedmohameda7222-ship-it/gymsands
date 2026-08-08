import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { brotliDecompressSync, gunzipSync, inflateSync } from "node:zlib";

const EXPECTED_AUDIT = "npm audit --package-lock-only --omit=dev --audit-level=moderate";
const prQuality = readFileSync(".github/workflows/pr-quality.yml", "utf8").replaceAll("\r\n", "\n");
const quality = readFileSync(".github/workflows/quality.yml", "utf8").replaceAll("\r\n", "\n");

function auditCommands(workflow) {
  return workflow.match(/npm audit(?:\s+--[a-z-]+(?:=[^\s'\"]+)?)*/g) ?? [];
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function decodeRequestBody(chunks, encoding) {
  const body = Buffer.concat(chunks);
  if (encoding === "gzip") return gunzipSync(body);
  if (encoding === "deflate") return inflateSync(body);
  if (encoding === "br") return brotliDecompressSync(body);
  return body;
}

function runNpmAudit(cwd, registry) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      npmExecutable(),
      [
        "audit",
        "--package-lock-only",
        "--omit=dev",
        "--audit-level=moderate",
        "--registry",
        registry,
        "--json",
      ],
      {
        cwd,
        env: {
          ...process.env,
          npm_config_fund: "false",
          npm_config_update_notifier: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function withAuditRegistry(advisories, callback) {
  const requests = [];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const body = decodeRequestBody(chunks, request.headers["content-encoding"]).toString("utf8");
      requests.push({ method: request.method, url: request.url, body });
      response.statusCode = 200;
      response.setHeader("content-type", "application/json");
      if (request.method === "GET" && request.url === "/lodash") {
        response.end(JSON.stringify({
          name: "lodash",
          "dist-tags": { latest: "4.17.21" },
          versions: {
            "4.17.21": { name: "lodash", version: "4.17.21", dependencies: {} },
          },
        }));
        return;
      }
      if (request.url === "/-/npm/v1/security/advisories/bulk") {
        response.end(JSON.stringify(advisories));
        return;
      }
      response.end("{}");
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const { port } = server.address();
    return await callback(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "plaivra-production-audit-"));
  const packageJson = {
    name: "plaivra-audit-fixture",
    version: "1.0.0",
    private: true,
    dependencies: { lodash: "4.17.21" },
  };
  const packageLock = {
    name: "plaivra-audit-fixture",
    version: "1.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "plaivra-audit-fixture",
        version: "1.0.0",
        dependencies: { lodash: "4.17.21" },
      },
      "node_modules/lodash": {
        version: "4.17.21",
        resolved: "https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz",
      },
    },
  };
  writeFileSync(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  writeFileSync(join(root, "package-lock.json"), `${JSON.stringify(packageLock, null, 2)}\n`);
  const extraneous = join(root, "node_modules", "@modelcontextprotocol", "sdk");
  mkdirSync(extraneous, { recursive: true });
  writeFileSync(
    join(extraneous, "package.json"),
    `${JSON.stringify({ name: "@modelcontextprotocol/sdk", version: "9.9.9" }, null, 2)}\n`,
  );
  return root;
}

test("PR and canonical Quality share the exact lockfile-authoritative Production audit", () => {
  const prCommands = auditCommands(prQuality);
  const qualityCommands = auditCommands(quality);
  assert.deepEqual(prCommands, [EXPECTED_AUDIT]);
  assert.deepEqual(qualityCommands, [EXPECTED_AUDIT]);
  assert.equal(prCommands[0], qualityCommands[0]);
  for (const workflow of [prQuality, quality]) {
    assert.match(workflow, /--package-lock-only/);
    assert.match(workflow, /--omit=dev/);
    assert.match(workflow, /--audit-level=moderate/);
    assert.doesNotMatch(workflow, /--no-package-lock/);
    assert.doesNotMatch(workflow, /npm audit fix(?:\s|$)/);
  }
});

test("lockfile-only npm audit ignores extraneous runner node_modules", async () => {
  const root = createFixture();
  try {
    const originalLock = readFileSync(join(root, "package-lock.json"), "utf8");
    await withAuditRegistry({}, async (registry, requests) => {
      const result = await runNpmAudit(root, registry);
      assert.equal(result.code, 0, result.stderr || result.stdout);
      const bulk = requests.find((request) => request.url === "/-/npm/v1/security/advisories/bulk");
      assert.ok(bulk, "npm audit did not query the advisory bulk endpoint");
      const authority = JSON.parse(bulk.body);
      assert.deepEqual(authority.lodash, ["4.17.21"]);
      assert.equal(authority["@modelcontextprotocol/sdk"], undefined);
    });
    assert.equal(readFileSync(join(root, "package-lock.json"), "utf8"), originalLock);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a moderate advisory for a lock-declared Production package still fails", async () => {
  const root = createFixture();
  try {
    const advisories = {
      lodash: [{
        id: 900001,
        url: "https://example.invalid/plaivra-lockfile-audit-proof",
        title: "Deterministic lockfile advisory fixture",
        severity: "moderate",
        vulnerable_versions: "<=4.17.21",
      }],
    };
    await withAuditRegistry(advisories, async (registry) => {
      const result = await runNpmAudit(root, registry);
      assert.equal(result.code, 1, `Expected moderate advisory failure.\n${result.stderr}\n${result.stdout}`);
      const report = JSON.parse(result.stdout);
      assert.equal(report.vulnerabilities?.lodash?.severity, "moderate");
      assert.equal(report.metadata?.vulnerabilities?.moderate, 1);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
