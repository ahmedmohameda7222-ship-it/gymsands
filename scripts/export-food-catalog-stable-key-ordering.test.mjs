import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import { runAuthoritativeExport } from "./export-food-catalog-portable.mjs";

function hexEnvelope(segment, values) {
  return Buffer.from(JSON.stringify({ segment, values }), "utf8").toString("hex");
}

describe("Plan 7 authoritative export stable-key ordering", () => {
  it("accepts PostgreSQL C-ordered text keys across JSON escaping and non-BMP Unicode boundaries", async () => {
    const root = await mkdtemp(join(tmpdir(), "plan7-export-stable-key-order-"));
    const binDir = join(root, "bin");
    const outputDir = join(root, "artifact");
    await mkdir(binDir, { recursive: true });

    const segment = "user_food_favorites";
    const rows = [
      { food_key: { pgType: "text", text: "a\n" } },
      { food_key: { pgType: "text", text: "a!" } },
      { food_key: { pgType: "text", text: "\uE000" } },
      { food_key: { pgType: "text", text: "\u{10000}" } },
    ];
    const lines = [
      `__PLAN7_META__${JSON.stringify({
        environment: "plan7-ordering-test",
        postgresSnapshot: "00000003-00000001-1",
        capturedAt: "2026-09-17T19:50:00.000000Z",
        migrationCount: "1",
        latestMigration: "20260917023000",
        migrationLedgerIdentityInput: "20260917023000",
        schemaIdentityInput: "plan7-ordering-test-schema",
        currentGenerationId: null,
        pointerRevision: "0",
        compatibilityVersion: "2",
        compatibilityMarker: "20260724232734",
      })}`,
      `__PLAN7_SEGMENT_BEGIN__${segment}`,
      ...rows.map((values) => hexEnvelope(segment, values)),
      `__PLAN7_SEGMENT_END__${segment}`,
    ];

    const fakePsql = join(binDir, "psql");
    await writeFile(fakePsql, `#!/usr/bin/env node\nconst lines = ${JSON.stringify(lines)};\nprocess.stdin.resume();\nprocess.stdin.on("end", () => { for (const line of lines) console.log(line); });\n`, "utf8");
    await chmod(fakePsql, 0o755);

    const previousPath = process.env.PATH;
    process.env.PATH = `${binDir}${delimiter}${previousPath ?? ""}`;
    try {
      const manifest = await runAuthoritativeExport({
        databaseUrl: "postgresql://127.0.0.1:5432/plan7-ordering-test",
        outputDir,
        profile: "CORE_PORTABLE",
        sourceRepositoryCommit: "a".repeat(40),
        rules: [{
          relation: segment,
          segment,
          classification: "PORTABLE_AUTHORITY",
          loadMode: "RESTORE_EXACT",
          stableKey: ["food_key"],
          requiredProfile: "CORE_PORTABLE",
          protected: false,
        }],
      });
      assert.equal(manifest.segments[0].rowCount, 4);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(root, { recursive: true, force: true });
    }
  });
});
