import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFile } from "node:fs/promises";
import { buildSingleSnapshotPsqlProgram } from "./export-food-catalog-portable.mjs";

describe("Plan 7 authoritative export CLI SQL program", () => {
  it("uses one read-only REPEATABLE READ PostgreSQL transaction and snapshot-bound observations", () => {
    const sql = buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items", stableKey: ["id"] }],
    });
    for (const fragment of [
      "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      "pg_export_snapshot()",
      "supabase_migrations.schema_migrations",
      "food_catalog_current_generation",
      "release_schema_compatibility",
      "COMMIT",
    ]) assert.ok(sql.includes(fragment), `Expected SQL to contain ${fragment}`);
  });

  it("streams stable-key relation data without OFFSET pagination", () => {
    const sql = buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items", stableKey: ["id"] }],
    });
    assert.match(sql, /COPY\s*\(/i);
    assert.match(sql, /ORDER BY\s+"id"/i);
    assert.doesNotMatch(sql, /\bOFFSET\b/i);
  });

  it("refuses relation identifiers or stable keys that are not SQL identifiers", () => {
    assert.throws(() => buildSingleSnapshotPsqlProgram({
      profile: "CORE_PORTABLE",
      relations: [{ relation: "food_items; drop table x", stableKey: ["id"] }],
    }), /identifier/i);
  });

  it("registers the psql close listener before stdout can finish so finalization cannot miss the event", async () => {
    const source = await readFile(new URL("./export-food-catalog-portable.mjs", import.meta.url), "utf8");
    const closeRegistration = source.indexOf('const closePromise = once(child, "close")');
    const stdoutConsumption = source.indexOf("for await (const line of lines)");
    assert.ok(closeRegistration >= 0, "Expected psql close promise registration");
    assert.ok(closeRegistration < stdoutConsumption, "Close promise must be registered before stdout consumption");
  });

  it("routes protected FULL_DR relations to encrypted transport instead of refusing or writing plaintext segments", async () => {
    const source = await readFile(new URL("./export-food-catalog-portable.mjs", import.meta.url), "utf8");
    for (const fragment of ["protectedKeyProvider", "protectedKeyId", "ciphertextTransportSha256", ".enc", "createCipheriv"]) {
      assert.ok(source.includes(fragment), `Expected protected export wiring to contain ${fragment}`);
    }
    assert.doesNotMatch(source, /rules\.some\(\(rule\) => rule\.protected\)[\s\S]{0,200}plaintext fallback is forbidden/i);
  });
});
