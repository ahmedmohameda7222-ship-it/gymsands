import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { encryptProtectedSegment } from "../lib/food-catalog/portability/protected-segments.ts";
import { seedRuntimeOwnershipForRelation } from "../lib/food-catalog/portability/seed-runtime-ownership.ts";
import {
  assertDisposableRestoreTarget,
  buildExactRestoreRowSql,
  buildPreseedValidationSql,
  decodeCanonicalSegmentRow,
  decodeProtectedArtifactMaterial,
  buildTransitionalFoodItemsStages,
} from "./restore-food-catalog-portable.mjs";

const row = '[["amount","numeric","90071992547409931234567890.1200"],["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["label","text","null"],["optional","text",null],["verified_source_record_id","uuid","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]]';

describe("Plan 7 disposable restore CLI primitives", () => {
  it("decodes canonical rows without converting typed scalar text into JavaScript numbers", () => {
    const decoded = decodeCanonicalSegmentRow(row);
    assert.deepEqual(decoded.amount, { pgType: "numeric", text: "90071992547409931234567890.1200" });
    assert.deepEqual(decoded.label, { pgType: "text", text: "null" });
    assert.deepEqual(decoded.optional, { pgType: "text", text: null });
  });

  it("hex-encodes scalar material and makes conflicting stable IDs fail instead of overwriting", () => {
    const sql = buildExactRestoreRowSql({
      relation: "food_items",
      stableKey: ["id"],
      targetColumns: {
        amount: "numeric",
        id: "uuid",
        label: "text",
        optional: "text",
        verified_source_record_id: "uuid",
      },
      canonicalRow: row,
    });
    assert.ok(sql.includes("ON CONFLICT"));
    assert.ok(sql.includes("DO NOTHING"));
    assert.match(sql, /RAISE EXCEPTION.*conflict/i);
    assert.ok(!sql.includes("90071992547409931234567890.1200"));
    assert.ok(!sql.includes("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"));
    assert.ok(sql.includes("decode("));
  });

  it("validates migration-seeded rows without INSERT, UPDATE, UPSERT or DELETE", () => {
    const sql = buildPreseedValidationSql({
      relation: "release_schema_compatibility",
      stableKey: ["singleton"],
      targetColumns: { singleton: "boolean", version: "integer", migration_version: "text" },
      canonicalRow: '[["migration_version","text","20260724232734"],["singleton","boolean","true"],["version","integer","2"]]',
    });
    assert.match(sql, /SELECT|PERFORM|IF/i);
    assert.doesNotMatch(sql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bUPSERT\b/i);
  });

  it("treats release-schema applied_at as migration replay-time metadata while still validating version and marker", () => {
    const policy = seedRuntimeOwnershipForRelation("release_schema_compatibility");
    assert.ok(policy);
    assert.deepEqual(policy.preseedComparisonOmit, ["applied_at"]);
    assert.ok(!policy.preseedComparisonOmit.includes("version"));
    assert.ok(!policy.preseedComparisonOmit.includes("migration_version"));
  });

  it("neutralizes only verified_source_record_id for food_items, then reconstructs it after source records", () => {
    const stages = buildTransitionalFoodItemsStages({
      stableKey: ["id"],
      targetColumns: {
        amount: "numeric",
        id: "uuid",
        label: "text",
        optional: "text",
        verified_source_record_id: "uuid",
      },
      canonicalRow: row,
    });
    assert.ok(stages.initialSql.includes("verified_source_record_id"));
    assert.match(stages.initialSql, /NULL/);
    assert.ok(stages.reconstructSql.includes("verified_source_record_id"));
    assert.deepEqual(stages.reconstructAfterRelations, ["food_source_records"]);
  });

  it("requires an explicit disposable-target acknowledgement and rejects provider production hosts", () => {
    assert.throws(() => assertDisposableRestoreTarget("postgresql://localhost:5432/restore", false), /disposable/i);
    assert.throws(() => assertDisposableRestoreTarget("postgresql://project.supabase.co:5432/postgres", true), /production|provider/i);
    assert.doesNotThrow(() => assertDisposableRestoreTarget("postgresql://127.0.0.1:55432/restore", true));
  });

  it("decrypts and authenticates protected artifact bytes through the external key provider before row replay", async () => {
    const key = randomBytes(32);
    const keyProvider = { getKey: async () => key };
    const plaintext = Buffer.from(`${row}\n`, "utf8");
    const envelope = await encryptProtectedSegment({
      segment: "food_personal_overrides",
      plaintext,
      keyId: "ephemeral-ci",
      keyProvider,
    });
    const descriptor = {
      name: "food_personal_overrides",
      protected: true,
      plaintextSemanticSha256: envelope.plaintextSemanticSha256,
      ciphertextTransportSha256: envelope.transportSha256,
      encryption: {
        algorithm: envelope.algorithm,
        keyId: envelope.keyId,
        nonceBase64: envelope.nonceBase64,
        authTagBase64: envelope.authTagBase64,
      },
    };
    const restored = await decodeProtectedArtifactMaterial({
      descriptor,
      ciphertext: Buffer.from(envelope.ciphertextBase64, "base64"),
      keyProvider,
    });
    assert.equal(restored, plaintext.toString("utf8"));
    await assert.rejects(() => decodeProtectedArtifactMaterial({
      descriptor,
      ciphertext: Buffer.from(envelope.ciphertextBase64, "base64"),
      keyProvider: { getKey: async () => randomBytes(32) },
    }), /auth|decrypt|key|integrity/i);
  });
});