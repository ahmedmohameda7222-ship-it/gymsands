import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { randomBytes } from "node:crypto";
import { encryptProtectedSegment } from "../lib/food-catalog/portability/protected-segments.ts";
import { seedRuntimeOwnershipForRelation } from "../lib/food-catalog/portability/seed-runtime-ownership.ts";
import {
  assertDisposableRestoreTarget,
  buildExactRestoreRowSql,
  buildFoodItemsUpdatedAtTriggerWindowSql,
  buildFoodItemsVerificationConstraintWindowSql,
  buildPrePointerVerificationSql,
  buildPreseedValidationSql,
  buildReplayLocalSystemKitchenLookupSql,
  buildReplayLocalSystemSubcategoryLookupSql,
  decodeCanonicalSegmentRow,
  decodeProtectedArtifactMaterial,
  buildTransitionalFoodItemsStages,
  isMigrationReplayLocalSystemKitchenRow,
  isMigrationReplayLocalSystemSubcategoryRow,
  remapCanonicalRowReferences,
} from "./restore-food-catalog-portable.mjs";

const row = '[["amount","numeric","90071992547409931234567890.1200"],["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["is_verified","boolean","true"],["label","text","null"],["optional","text",null],["updated_at","timestamp with time zone","2026-09-10T10:04:00.000000Z"],["verified_at","timestamp with time zone","2026-09-10T10:05:00.000000Z"],["verified_source_record_id","uuid","bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"]]';
const systemKitchenRow = '[["created_at","timestamp with time zone","2026-09-10T10:00:00.000000Z"],["id","uuid","11111111-1111-4111-8111-111111111111"],["is_system","boolean","true"],["name","text","Egyptian Kitchen"],["updated_at","timestamp with time zone","2026-09-10T10:00:00.000000Z"],["user_id","uuid",null]]';
const runtimeSystemKitchenRow = '[["created_at","timestamp with time zone","2026-09-10T10:00:00.000000Z"],["id","uuid","12111111-1111-4111-8111-111111111111"],["is_system","boolean","true"],["name","text","Future Runtime Kitchen"],["updated_at","timestamp with time zone","2026-09-10T10:00:00.000000Z"],["user_id","uuid",null]]';
const systemSubcategoryRow = '[["created_at","timestamp with time zone","2026-09-10T10:01:00.000000Z"],["id","uuid","22222222-2222-4222-8222-222222222222"],["kitchen_id","uuid","11111111-1111-4111-8111-111111111111"],["name","text","Bread"],["updated_at","timestamp with time zone","2026-09-10T10:01:00.000000Z"]]';

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
        is_verified: "boolean",
        label: "text",
        optional: "text",
        updated_at: "timestamp with time zone",
        verified_at: "timestamp with time zone",
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

  it("keeps the current-generation pointer unavailable until semantic generation, policy, graph, transient, owner and security preflight passes", () => {
    const sql = buildPrePointerVerificationSql({
      currentGenerationId: "71000000-0000-4000-8000-000000000901",
      currentEventId: "71000000-0000-4000-8000-000000000921",
      currentValidationReportId: "71000000-0000-4000-8000-000000000911",
      transientRules: [
        { relation: "food_ingestion_runs", fields: ["lease_owner", "lease_token", "lease_acquired_at", "lease_heartbeat_at", "lease_expires_at"] },
        { relation: "food_catalog_governance_outbox", fields: ["claim_owner", "claim_principal_id", "lease_token", "lease_acquired_at", "lease_expires_at"] },
      ],
    });
    for (const fragment of [
      "food_catalog_generation_foods",
      "food_catalog_generation_validation_reports",
      "food_catalog_generation_events",
      "food_catalog_governance_policy_pointer",
      "WITH RECURSIVE",
      "food_catalog_generation_redirects",
      "food_catalog_governance_principals",
      "account_access_states",
      "pg_policies",
      "food_ingestion_runs",
      "food_catalog_governance_outbox",
    ]) assert.ok(sql.includes(fragment), `Expected pre-pointer SQL to contain ${fragment}`);
    assert.match(sql, /generation_checksum_sha256/i);
    assert.match(sql, /blocker_count\s*=\s*0/i);
    assert.match(sql, /error_count\s*=\s*0/i);
    assert.match(sql, /lease_owner IS NOT NULL/i);
    assert.match(sql, /claim_owner IS NOT NULL/i);
    assert.doesNotMatch(sql, /UPDATE\s+public\.food_catalog_current_generation/i);
  });

  it("treats release-schema applied_at as migration replay-time metadata while still validating version and marker", () => {
    const policy = seedRuntimeOwnershipForRelation("release_schema_compatibility");
    assert.ok(policy);
    assert.deepEqual(policy.preseedComparisonOmit, ["applied_at"]);
    assert.ok(!policy.preseedComparisonOmit.includes("version"));
    assert.ok(!policy.preseedComparisonOmit.includes("migration_version"));
  });

  it("treats only Git-migration system kitchen/subcategory identities as replay-local references", () => {
    assert.equal(isMigrationReplayLocalSystemKitchenRow(systemKitchenRow), true);
    assert.equal(isMigrationReplayLocalSystemKitchenRow(runtimeSystemKitchenRow), false);
    assert.equal(isMigrationReplayLocalSystemSubcategoryRow(systemSubcategoryRow), true);
    const runtimeSubcategory = systemSubcategoryRow.replace('"Bread"', '"Future Runtime Category"');
    assert.equal(isMigrationReplayLocalSystemSubcategoryRow(runtimeSubcategory), false);
  });

  it("resolves migration-owned system kitchen/subcategory rows read-only by semantic identity", () => {
    const kitchenSql = buildReplayLocalSystemKitchenLookupSql({
      targetColumns: {
        created_at: "timestamp with time zone",
        id: "uuid",
        is_system: "boolean",
        name: "text",
        updated_at: "timestamp with time zone",
        user_id: "uuid",
      },
      canonicalRow: systemKitchenRow,
    });
    assert.match(kitchenSql, /^SELECT id::text FROM public\."food_kitchens"/);
    assert.match(kitchenSql, /is_system IS TRUE/);
    assert.match(kitchenSql, /user_id IS NULL/);
    assert.doesNotMatch(kitchenSql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bUPSERT\b/i);
    assert.ok(!kitchenSql.includes("Egyptian Kitchen"));

    const subcategorySql = buildReplayLocalSystemSubcategoryLookupSql({
      targetColumns: {
        created_at: "timestamp with time zone",
        id: "uuid",
        kitchen_id: "uuid",
        name: "text",
        updated_at: "timestamp with time zone",
      },
      canonicalRow: systemSubcategoryRow,
      targetKitchenId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    });
    assert.match(subcategorySql, /^SELECT id::text FROM public\."food_subcategories"/);
    assert.match(subcategorySql, /kitchen_id IS NOT DISTINCT FROM/);
    assert.doesNotMatch(subcategorySql, /\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bUPSERT\b/i);
  });

  it("remaps only declared replay-local FK references while keeping stable Food identity and other values exact", () => {
    const food = '[["id","uuid","aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],["kitchen_id","uuid","11111111-1111-4111-8111-111111111111"],["subcategory_id","uuid","22222222-2222-4222-8222-222222222222"],["updated_at","timestamp with time zone","2026-09-10T10:04:00.000000Z"]]';
    const remapped = remapCanonicalRowReferences(food, {
      kitchen_id: "33333333-3333-4333-8333-333333333333",
      subcategory_id: "44444444-4444-4444-8444-444444444444",
    });
    const decoded = decodeCanonicalSegmentRow(remapped);
    assert.equal(decoded.id.text, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    assert.equal(decoded.kitchen_id.text, "33333333-3333-4333-8333-333333333333");
    assert.equal(decoded.subcategory_id.text, "44444444-4444-4444-8444-444444444444");
    assert.equal(decoded.updated_at.text, "2026-09-10T10:04:00.000000Z");
    assert.throws(() => remapCanonicalRowReferences(food, { id: "55555555-5555-4555-8555-555555555555" }), /reference column/i);
  });

  it("neutralizes only verified_source_record_id for food_items, then reconstructs it after source records", () => {
    const stages = buildTransitionalFoodItemsStages({
      stableKey: ["id"],
      targetColumns: {
        amount: "numeric",
        id: "uuid",
        is_verified: "boolean",
        label: "text",
        optional: "text",
        updated_at: "timestamp with time zone",
        verified_at: "timestamp with time zone",
        verified_source_record_id: "uuid",
      },
      canonicalRow: row,
    });
    assert.ok(stages.initialSql.includes("verified_source_record_id"));
    assert.match(stages.initialSql, /NULL/);
    assert.ok(stages.initialSql.includes(Buffer.from("true", "utf8").toString("hex")));
    assert.ok(stages.initialSql.includes(Buffer.from("2026-09-10T10:05:00.000000Z", "utf8").toString("hex")));
    assert.ok(stages.reconstructSql.includes("verified_source_record_id"));
    assert.deepEqual(stages.reconstructAfterRelations, ["food_source_records"]);
  });

  it("opens only the exact Food verification CHECK window and reinstalls target-catalog authority before later validation", () => {
    const window = buildFoodItemsVerificationConstraintWindowSql({
      constraintName: "food_items_verification_state_check",
      constraintType: "c",
      validated: true,
      definition: "CHECK (((is_verified = false) AND (verified_at IS NULL) AND (verified_source_record_id IS NULL)) OR ((is_verified = true) AND (verified_at IS NOT NULL) AND (verified_source_record_id IS NOT NULL)))",
    });
    assert.match(window.dropSql, /^ALTER TABLE public\.food_items DROP CONSTRAINT "food_items_verification_state_check";$/);
    assert.match(window.installNotValidSql, /ADD CONSTRAINT "food_items_verification_state_check" CHECK /);
    assert.match(window.installNotValidSql, /NOT VALID;$/);
    assert.match(window.validateSql, /^ALTER TABLE public\.food_items VALIDATE CONSTRAINT "food_items_verification_state_check";$/);
    assert.doesNotMatch(window.dropSql + window.installNotValidSql + window.validateSql, /DISABLE TRIGGER|DROP CONSTRAINT ALL|session_replication_role/i);
    assert.throws(() => buildFoodItemsVerificationConstraintWindowSql({
      constraintName: "food_items_lifecycle_status_check",
      constraintType: "c",
      validated: true,
      definition: "CHECK (true)",
    }), /verification state check/i);
    assert.throws(() => buildFoodItemsVerificationConstraintWindowSql({
      constraintName: "food_items_verification_state_check",
      constraintType: "f",
      validated: true,
      definition: "FOREIGN KEY (id) REFERENCES public.food_items(id)",
    }), /CHECK/i);
  });

  it("suspends only the exact Git-built food_items updated-at trigger during cycle reconstruction", () => {
    const window = buildFoodItemsUpdatedAtTriggerWindowSql({
      triggerName: "food_items_updated_at",
      enabled: "O",
      internal: false,
      functionSchema: "public",
      functionName: "set_updated_at",
    });
    assert.equal(window.disableSql, 'ALTER TABLE public.food_items DISABLE TRIGGER "food_items_updated_at";');
    assert.equal(window.enableSql, 'ALTER TABLE public.food_items ENABLE TRIGGER "food_items_updated_at";');
    assert.throws(() => buildFoodItemsUpdatedAtTriggerWindowSql({
      triggerName: "food_items_updated_at",
      enabled: "O",
      internal: false,
      functionSchema: "public",
      functionName: "other_trigger_function",
    }), /set_updated_at/i);
    assert.throws(() => buildFoodItemsUpdatedAtTriggerWindowSql({
      triggerName: "food_items_updated_at",
      enabled: "D",
      internal: false,
      functionSchema: "public",
      functionName: "set_updated_at",
    }), /enabled/i);
  });

  it("requires explicit acknowledgement while authorizing only loopback certification targets", () => {
    assert.throws(() => assertDisposableRestoreTarget("postgresql://localhost:5432/restore", false), /disposable/i);
    assert.throws(() => assertDisposableRestoreTarget("postgresql://project.supabase.co:5432/postgres", true), /loopback|remote|forbidden/i);
    assert.throws(() => assertDisposableRestoreTarget("postgresql://staging.internal.example:5432/restore", true), /loopback|remote|forbidden/i);
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
