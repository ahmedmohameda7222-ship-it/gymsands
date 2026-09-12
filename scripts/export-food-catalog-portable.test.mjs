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

  it("neutralizes declared source-live lease scalars before canonical artifact material without erasing durable fencing", async () => {
    const exporter = await import("./export-food-catalog-portable.mjs");
    assert.equal(typeof exporter.prepareSourcePortableValues, "function");
    const values = {
      id: { pgType: "uuid", text: "71000000-0000-4000-8000-000000000a11" },
      lease_owner: { pgType: "text", text: "plan7-worker" },
      lease_token: { pgType: "uuid", text: "71000000-0000-4000-8000-000000000a21" },
      lease_epoch: { pgType: "int8", text: "3" },
      lease_acquired_at: { pgType: "timestamptz", text: "2026-09-10 18:20:00+00" },
      lease_heartbeat_at: { pgType: "timestamptz", text: "2026-09-10 18:20:30+00" },
      lease_expires_at: { pgType: "timestamptz", text: "2026-09-10 19:20:00+00" },
    };
    const prepared = exporter.prepareSourcePortableValues(values, {
      relation: "food_ingestion_runs",
      stableKey: ["id"],
      sourceTransientNeutralize: [
        "lease_owner",
        "lease_token",
        "lease_acquired_at",
        "lease_heartbeat_at",
        "lease_expires_at",
      ],
    });
    for (const column of ["lease_owner","lease_token","lease_acquired_at","lease_heartbeat_at","lease_expires_at"]) {
      assert.equal(prepared[column].text, null, `${column} must be neutralized before canonical hashing/writing`);
    }
    assert.equal(prepared.lease_epoch.text, "3");
    assert.equal(values.lease_owner.text, "plan7-worker", "preparation must not mutate the source envelope");
  });

  it("converts active outbox processing claims into non-resumable portable state before hashing", async () => {
    const exporter = await import("./export-food-catalog-portable.mjs");
    const values = {
      event_id: { pgType: "uuid", text: "71000000-0000-4000-8000-000000000d11" },
      status: { pgType: "text", text: "processing" },
      claim_owner: { pgType: "text", text: "plan7-outbox-worker" },
      claim_principal_id: { pgType: "uuid", text: "71000000-0000-4000-8000-000000000002" },
      lease_token: { pgType: "uuid", text: "71000000-0000-4000-8000-000000000d12" },
      lease_epoch: { pgType: "int8", text: "7" },
      lease_acquired_at: { pgType: "timestamptz", text: "2026-09-10 18:30:00+00" },
      lease_expires_at: { pgType: "timestamptz", text: "2026-09-10 18:35:00+00" },
    };
    const rule = {
      relation: "food_catalog_governance_outbox",
      stableKey: ["event_id"],
      sourceTransientNeutralize: [
        "claim_owner",
        "claim_principal_id",
        "lease_token",
        "lease_acquired_at",
        "lease_expires_at",
      ],
      transientStateNeutralize: [{ column: "status", from: "processing", to: "failed" }],
    };
    const prepared = exporter.prepareSourcePortableValues(values, rule);
    assert.equal(prepared.status.text, "failed");
    for (const column of rule.sourceTransientNeutralize) assert.equal(prepared[column].text, null);
    assert.equal(prepared.lease_epoch.text, "7");
    assert.equal(values.status.text, "processing", "portable preparation must not mutate source state");

    const pending = exporter.prepareSourcePortableValues({
      ...values,
      status: { pgType: "text", text: "pending" },
      claim_owner: { pgType: "text", text: null },
      claim_principal_id: { pgType: "uuid", text: null },
      lease_token: { pgType: "uuid", text: null },
      lease_acquired_at: { pgType: "timestamptz", text: null },
      lease_expires_at: { pgType: "timestamptz", text: null },
    }, rule);
    assert.equal(pending.status.text, "pending", "non-processing outbox history must not be rewritten");
    assert.equal(pending.lease_epoch.text, "7");
  });
});
