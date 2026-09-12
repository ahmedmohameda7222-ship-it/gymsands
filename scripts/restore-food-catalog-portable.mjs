#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPortableTargetProfileSql, evaluatePortableTargetProfile } from "./verify-food-catalog-portable-target.mjs";
import { validatePortableArtifact } from "../lib/food-catalog/portability/validate-artifact.ts";
import { validateCanonicalPortableProfileManifestV1 } from "../lib/food-catalog/portability/profile-certification.ts";
import { FOOD_CATALOG_PORTABLE_RELATIONS_V1 } from "../lib/food-catalog/portability/relation-registry.ts";
import { buildFoodCatalogRestorePlan } from "../lib/food-catalog/portability/restore-plan.ts";
import { buildPrePointerVerificationSql } from "../lib/food-catalog/portability/pre-pointer-verification.mjs";
import { isMigrationSeedKey, seedRuntimeOwnershipForRelation, stableKeyTextTuple } from "../lib/food-catalog/portability/seed-runtime-ownership.ts";
import { decryptProtectedSegment } from "../lib/food-catalog/portability/protected-segments.ts";
import { createEnvironmentProtectedSegmentKeyBinding } from "../lib/food-catalog/portability/key-provider.ts";
import {
  buildReplayLocalSystemKitchenLookupSql,
  buildReplayLocalSystemSubcategoryLookupSql,
  isMigrationReplayLocalSystemKitchenRow,
  isMigrationReplayLocalSystemSubcategoryRow,
  remapCanonicalRowReferences,
  replayLocalReferenceIds,
} from "../lib/food-catalog/portability/replay-local-reference-runtime.mjs";

export {
  buildReplayLocalSystemKitchenLookupSql,
  buildReplayLocalSystemSubcategoryLookupSql,
  isMigrationReplayLocalSystemKitchenRow,
  isMigrationReplayLocalSystemSubcategoryRow,
  remapCanonicalRowReferences,
  buildPrePointerVerificationSql,
};

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const SAFE_TYPE = /^[a-zA-Z0-9_." \[\](),]+$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const CANONICAL_REGISTRY_AUTHORITY = "CANONICAL_REGISTRY_V1";
const DIAGNOSTIC_REGISTRY_AUTHORITY = "DIAGNOSTIC_SUBSET";
const FOOD_ITEMS_VERIFICATION_CONSTRAINT = "food_items_verification_state_check";
const FOOD_ITEMS_UPDATED_AT_TRIGGER = "food_items_updated_at";

function qid(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`Unsafe PostgreSQL identifier ${String(value)}.`);
  return `"${value}"`;
}
function safeType(value) {
  if (typeof value !== "string" || !SAFE_TYPE.test(value) || /;|--|\/\*/u.test(value)) throw new Error(`Unsafe PostgreSQL target type ${String(value)}.`);
  return value;
}
function normalizeType(value) { return String(value).trim().toLowerCase().replace(/^pg_catalog\./u, "").replace(/\s+/gu, " "); }

export function assertDisposableRestoreTarget(databaseUrl, acknowledged) {
  if (!acknowledged) throw new Error("Plan 7 restore requires explicit disposable-target acknowledgement.");
  let parsed; try { parsed = new URL(databaseUrl); } catch { throw new Error("Disposable restore target URL is invalid."); }
  if (!/^postgres(?:ql)?:$/u.test(parsed.protocol)) throw new Error("Disposable restore target must be PostgreSQL.");
  const rawHost = parsed.hostname.toLowerCase();
  const host = rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;
  if (!LOOPBACK.has(host)) throw new Error("Plan 7 certification restore target must be an isolated loopback PostgreSQL harness; remote hosts are forbidden.");
  return Object.freeze({ acknowledged: true, loopback: true, host });
}

export function decodeCanonicalSegmentRow(line) {
  let parsed; try { parsed = JSON.parse(line); } catch { throw new Error("Canonical segment row is not valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("Canonical segment row must be an array of typed column tuples.");
  const result = {};
  for (const tuple of parsed) {
    if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error("Malformed canonical typed column tuple.");
    const [column, pgType, text] = tuple;
    if (typeof column !== "string" || !IDENTIFIER.test(column) || typeof pgType !== "string" || !pgType.trim()) throw new Error("Malformed canonical typed column identity.");
    if (text !== null && typeof text !== "string") throw new Error(`Canonical scalar ${column} must be text or null.`);
    if (Object.hasOwn(result, column)) throw new Error(`Duplicate canonical column ${column}.`);
    result[column] = Object.freeze({ pgType, text });
  }
  return Object.freeze(result);
}

export async function decodeProtectedArtifactMaterial({ descriptor, ciphertext, keyProvider }) {
  if (!descriptor?.protected) throw new Error("Protected artifact descriptor is required.");
  if (!descriptor.encryption || descriptor.encryption.algorithm !== "AES-256-GCM") throw new Error(`Protected segment ${descriptor.name ?? "<unknown>"} is missing AES-256-GCM encryption metadata.`);
  if (typeof descriptor.ciphertextTransportSha256 !== "string" || !SHA256.test(descriptor.ciphertextTransportSha256)) throw new Error(`Protected segment ${descriptor.name ?? "<unknown>"} is missing ciphertext transport integrity.`);
  if (!(ciphertext instanceof Uint8Array)) throw new Error("Protected segment ciphertext bytes are required.");
  const plaintext = await decryptProtectedSegment({
    segment: descriptor.name,
    algorithm: descriptor.encryption.algorithm,
    keyId: descriptor.encryption.keyId,
    nonceBase64: descriptor.encryption.nonceBase64,
    authTagBase64: descriptor.encryption.authTagBase64,
    ciphertextBase64: Buffer.from(ciphertext).toString("base64"),
    plaintextSemanticSha256: descriptor.plaintextSemanticSha256,
    transportSha256: descriptor.ciphertextTransportSha256,
  }, keyProvider);
  return new TextDecoder("utf-8", { fatal: true }).decode(plaintext);
}

function validateRowAgainstTarget(row, targetColumns) {
  for (const [column, targetType] of Object.entries(targetColumns)) {
    const scalar = row[column];
    if (!scalar) throw new Error(`Artifact row is missing target column ${column}.`);
    if (normalizeType(scalar.pgType) !== normalizeType(targetType)) throw new Error(`Artifact PostgreSQL type for ${column} does not match target schema.`);
  }
  for (const column of Object.keys(row)) if (!Object.hasOwn(targetColumns, column)) throw new Error(`Artifact row contains unknown target column ${column}.`);
}
function typedExpression(scalar, targetType) {
  const type = safeType(targetType);
  if (scalar.text === null) return `NULL::${type}`;
  return `convert_from(decode('${Buffer.from(scalar.text, "utf8").toString("hex")}','hex'),'UTF8')::${type}`;
}
function keyPredicate(row, stableKey, targetColumns, alias = "t") {
  return stableKey.map((column) => {
    const scalar = row[column];
    if (!scalar || scalar.text === null) throw new Error(`Stable restore key ${column} must be present and non-null.`);
    return `${alias}.${qid(column)} IS NOT DISTINCT FROM ${typedExpression(scalar, targetColumns[column])}`;
  }).join(" AND ");
}
function exactPredicate(row, columns, targetColumns, alias = "t") {
  return columns.map((column) => `${alias}.${qid(column)} IS NOT DISTINCT FROM ${typedExpression(row[column], targetColumns[column])}`).join(" AND ");
}

export function buildExactRestoreRowSql({ relation, stableKey, targetColumns, canonicalRow, forceNullColumns = [], comparisonOmitColumns = [] }) {
  const table = qid(relation); const row = decodeCanonicalSegmentRow(canonicalRow); validateRowAgainstTarget(row, targetColumns);
  const forceNull = new Set(forceNullColumns);
  for (const column of forceNull) if (!Object.hasOwn(targetColumns, column)) throw new Error(`Neutralized target column ${column} does not exist.`);
  const columns = Object.keys(targetColumns);
  const values = columns.map((column) => forceNull.has(column) ? `NULL::${safeType(targetColumns[column])}` : typedExpression(row[column], targetColumns[column]));
  const compareColumns = columns.filter((column) => !comparisonOmitColumns.includes(column));
  const keyWhere = keyPredicate(row, stableKey, targetColumns); const exactWhere = exactPredicate(row, compareColumns, targetColumns); const conflict = stableKey.map(qid).join(", ");
  return `DO $plan7_restore$\nBEGIN\n  INSERT INTO public.${table} (${columns.map(qid).join(", ")})\n  VALUES (${values.join(", ")})\n  ON CONFLICT (${conflict}) DO NOTHING;\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyWhere} AND ${exactWhere}) THEN\n    RAISE EXCEPTION 'Plan7 conflicting stable identity in ${relation}';\n  END IF;\nEND\n$plan7_restore$;`;
}
export function buildPreseedValidationSql({ relation, stableKey, targetColumns, canonicalRow, comparisonColumns }) {
  const table = qid(relation); const row = decodeCanonicalSegmentRow(canonicalRow); validateRowAgainstTarget(row, targetColumns);
  const columns = comparisonColumns ?? Object.keys(targetColumns);
  return `DO $plan7_preseed$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyPredicate(row, stableKey, targetColumns)} AND ${exactPredicate(row, columns, targetColumns)}) THEN\n    RAISE EXCEPTION 'Plan7 migration-preseed mismatch in ${relation}';\n  END IF;\nEND\n$plan7_preseed$;`;
}
function buildReconstructSql({ relation, stableKey, targetColumns, canonicalRow, column }) {
  const table = qid(relation); const row = decodeCanonicalSegmentRow(canonicalRow); validateRowAgainstTarget(row, targetColumns);
  const expected = typedExpression(row[column], targetColumns[column]); const keyWhere = keyPredicate(row, stableKey, targetColumns);
  return `DO $plan7_cycle$\nBEGIN\n  UPDATE public.${table} AS t\n     SET ${qid(column)} = ${expected}\n   WHERE ${keyWhere}\n     AND t.${qid(column)} IS NULL\n     AND t.${qid(column)} IS DISTINCT FROM ${expected};\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyWhere} AND t.${qid(column)} IS NOT DISTINCT FROM ${expected}) THEN\n    RAISE EXCEPTION 'Plan7 transitional cycle conflict in ${relation}.${column}';\n  END IF;\nEND\n$plan7_cycle$;`;
}
export function buildTransitionalFoodItemsStages({ stableKey, targetColumns, canonicalRow }) {
  if (!Object.hasOwn(targetColumns, "verified_source_record_id")) throw new Error("food_items target is missing verified_source_record_id.");
  return Object.freeze({
    initialSql: buildExactRestoreRowSql({ relation: "food_items", stableKey, targetColumns, canonicalRow, forceNullColumns: ["verified_source_record_id"], comparisonOmitColumns: ["verified_source_record_id"] }),
    reconstructSql: buildReconstructSql({ relation: "food_items", stableKey, targetColumns, canonicalRow, column: "verified_source_record_id" }),
    reconstructAfterRelations: Object.freeze(["food_source_records"]),
  });
}
function safeCheckDefinition(value) {
  if (typeof value !== "string" || !/^CHECK\s*\(/iu.test(value.trim()) || /;|--|\/\*/u.test(value)) throw new Error("food_items verification state CHECK definition is invalid.");
  return value.trim();
}
export function buildFoodItemsVerificationConstraintWindowSql({ constraintName, constraintType, validated, definition }) {
  if (constraintName !== FOOD_ITEMS_VERIFICATION_CONSTRAINT) throw new Error("Only the food_items verification state check may be suspended for Plan 7 cycle restore.");
  if (constraintType !== "c") throw new Error("food_items verification state authority must be a CHECK constraint.");
  if (typeof validated !== "boolean") throw new Error("food_items verification state CHECK validation status is required.");
  const check = safeCheckDefinition(definition); const quoted = qid(constraintName);
  return Object.freeze({ validated, dropSql: `ALTER TABLE public.food_items DROP CONSTRAINT ${quoted};`, installNotValidSql: `ALTER TABLE public.food_items ADD CONSTRAINT ${quoted} ${check} NOT VALID;`, validateSql: `ALTER TABLE public.food_items VALIDATE CONSTRAINT ${quoted};` });
}
export function buildFoodItemsUpdatedAtTriggerWindowSql({ triggerName, enabled, internal, functionSchema, functionName }) {
  if (triggerName !== FOOD_ITEMS_UPDATED_AT_TRIGGER) throw new Error("Only the food_items updated-at trigger may be suspended during Plan 7 cycle reconstruction.");
  if (internal !== false) throw new Error("food_items updated-at trigger must be a non-internal Git-built trigger.");
  if (enabled !== "O") throw new Error("food_items updated-at trigger must be enabled in ordinary origin mode before reconstruction.");
  if (functionSchema !== "public" || functionName !== "set_updated_at") throw new Error("food_items updated-at trigger must execute public.set_updated_at.");
  const quoted = qid(triggerName);
  return Object.freeze({ disableSql: `ALTER TABLE public.food_items DISABLE TRIGGER ${quoted};`, enableSql: `ALTER TABLE public.food_items ENABLE TRIGGER ${quoted};` });
}
export function buildMutableSingletonRestoreSql({ relation, stableKey, targetColumns, canonicalRow }) {
  const row = decodeCanonicalSegmentRow(canonicalRow); validateRowAgainstTarget(row, targetColumns);
  const nonKeys = Object.keys(targetColumns).filter((column) => !stableKey.includes(column)); if (!nonKeys.length) throw new Error(`Mutable singleton ${relation} has no mutable fields.`);
  const keyWhere = keyPredicate(row, stableKey, targetColumns); const exactWhere = exactPredicate(row, Object.keys(targetColumns), targetColumns);
  return `DO $plan7_pointer$\nBEGIN\n  UPDATE public.${qid(relation)} AS t SET ${nonKeys.map((column) => `${qid(column)}=${typedExpression(row[column], targetColumns[column])}`).join(", ")} WHERE ${keyWhere};\n  IF NOT FOUND THEN RAISE EXCEPTION 'Plan7 pointer singleton identity missing'; END IF;\n  IF NOT EXISTS (SELECT 1 FROM public.${qid(relation)} AS t WHERE ${keyWhere} AND ${exactWhere}) THEN RAISE EXCEPTION 'Plan7 pointer restore mismatch'; END IF;\nEND\n$plan7_pointer$;`;
}

function runPsql(databaseUrl, sql, { tuplesOnly = false } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"]; if (tuplesOnly) args.push("-A", "-t");
  const result = spawnSync("psql", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Disposable restore SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}
function loadTargetColumns(databaseUrl, relation) {
  const literal = relation.replaceAll("'", "''");
  const text = runPsql(databaseUrl, `SELECT coalesce(json_object_agg(attname,format_type(atttypid,atttypmod) ORDER BY attnum),'{}'::json)::text FROM pg_attribute WHERE attrelid=to_regclass('public.${literal}') AND attnum>0 AND NOT attisdropped;`, { tuplesOnly: true });
  const parsed = JSON.parse(text || "{}"); if (!Object.keys(parsed).length) throw new Error(`Required target relation public.${relation} is missing or has no columns.`); return parsed;
}
function loadFoodItemsVerificationConstraint(databaseUrl) {
  const text = runPsql(databaseUrl, `SELECT json_build_object('constraintName',c.conname,'constraintType',c.contype,'validated',c.convalidated,'definition',pg_get_constraintdef(c.oid,true))::text FROM pg_constraint AS c WHERE c.conrelid='public.food_items'::regclass AND c.conname='${FOOD_ITEMS_VERIFICATION_CONSTRAINT}';`, { tuplesOnly: true });
  if (!text) throw new Error("Required food_items verification state CHECK is missing from the Git-built target."); return JSON.parse(text);
}
function loadFoodItemsUpdatedAtTrigger(databaseUrl) {
  const text = runPsql(databaseUrl, `SELECT json_build_object('triggerName',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'functionSchema',n.nspname,'functionName',p.proname)::text FROM pg_trigger AS t JOIN pg_proc AS p ON p.oid=t.tgfoid JOIN pg_namespace AS n ON n.oid=p.pronamespace WHERE t.tgrelid='public.food_items'::regclass AND t.tgname='${FOOD_ITEMS_UPDATED_AT_TRIGGER}';`, { tuplesOnly: true });
  if (!text) throw new Error("Required food_items updated-at trigger is missing from the Git-built target."); return JSON.parse(text);
}
function loadTargetProfile(databaseUrl) { return JSON.parse(runPsql(databaseUrl, buildPortableTargetProfileSql(), { tuplesOnly: true })); }
function segmentRows(material) { if (material === "") return []; if (!material.endsWith("\n")) throw new Error("Canonical segment must end with newline."); return material.slice(0, -1).split("\n"); }

function parseArgs(argv) {
  const options = { disposableTarget: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--artifact-dir") options.artifactDir = argv[++index];
    else if (value === "--target-url") options.targetUrl = argv[++index];
    else if (value === "--relations-json") options.relationsJson = argv[++index];
    else if (value === "--evidence-output") options.evidenceOutput = argv[++index];
    else if (value === "--disposable-target") options.disposableTarget = true;
    else throw new Error(`Unknown restore argument ${value}; exported DDL/schema inputs are not accepted.`);
  }
  return options;
}
async function readArtifactMaterials(artifactDir, manifest, protectedKeyProvider) {
  const materials = {};
  for (const segment of manifest.segments) {
    if (segment.loadMode === "DERIVED_REBUILD") continue;
    if (segment.protected) {
      const ciphertext = await readFile(resolve(artifactDir, "segments", `${segment.name}.enc`));
      materials[segment.name] = await decodeProtectedArtifactMaterial({ descriptor: segment, ciphertext, keyProvider: protectedKeyProvider });
    } else materials[segment.name] = await readFile(resolve(artifactDir, "segments", `${segment.name}.ndjson`), "utf8");
  }
  return materials;
}
async function loadRules(manifest, relationsJson) {
  if (manifest.registryAuthority === CANONICAL_REGISTRY_AUTHORITY) {
    if (relationsJson) throw new Error("Trusted canonical restore cannot use --relations-json diagnostic overrides.");
    validateCanonicalPortableProfileManifestV1(manifest);
    return { rules: FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter((rule) => rule.requiredProfile === "CORE_PORTABLE" || manifest.profile === "FULL_DR"), canonicalProfileVerified: true, certificationEligible: true };
  }
  if (manifest.registryAuthority !== DIAGNOSTIC_REGISTRY_AUTHORITY) throw new Error("Plan 7 artifact registry authority is missing or unsupported.");
  if (!relationsJson) throw new Error("DIAGNOSTIC_SUBSET restore requires the matching --relations-json diagnostic descriptor file.");
  return { rules: JSON.parse(await readFile(resolve(relationsJson), "utf8")), canonicalProfileVerified: false, certificationEligible: false };
}
function resolveSingleReplayLocalTarget(databaseUrl, sql, label) {
  const ids = runPsql(databaseUrl, sql, { tuplesOnly: true }).split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
  if (ids.length !== 1 || !UUID.test(ids[0])) throw new Error(`${label} must resolve to exactly one Git-migration target reference.`); return ids[0];
}
function remapFoodItemRow(canonicalRow, referenceMaps) {
  const decoded = decodeCanonicalSegmentRow(canonicalRow); const replacements = {};
  const kitchenId = decoded.kitchen_id?.text; const subcategoryId = decoded.subcategory_id?.text;
  if (typeof kitchenId === "string" && referenceMaps.foodKitchens.has(kitchenId)) replacements.kitchen_id = referenceMaps.foodKitchens.get(kitchenId);
  if (typeof subcategoryId === "string" && referenceMaps.foodSubcategories.has(subcategoryId)) replacements.subcategory_id = referenceMaps.foodSubcategories.get(subcategoryId);
  return Object.keys(replacements).length ? remapCanonicalRowReferences(canonicalRow, replacements) : canonicalRow;
}
function restoreReplayLocalReferenceRow({ databaseUrl, relation, stableKey, targetColumns, canonicalRow, referenceMaps }) {
  if (relation === "food_kitchens") {
    if (!isMigrationReplayLocalSystemKitchenRow(canonicalRow)) { runPsql(databaseUrl, buildExactRestoreRowSql({ relation, stableKey, targetColumns, canonicalRow })); return; }
    const sourceId = replayLocalReferenceIds(canonicalRow).id;
    const targetId = resolveSingleReplayLocalTarget(databaseUrl, buildReplayLocalSystemKitchenLookupSql({ targetColumns, canonicalRow }), "Migration system kitchen");
    referenceMaps.foodKitchens.set(sourceId, targetId); return;
  }
  if (relation === "food_subcategories") {
    const ids = replayLocalReferenceIds(canonicalRow); const mappedKitchenId = typeof ids.kitchenId === "string" ? referenceMaps.foodKitchens.get(ids.kitchenId) : undefined;
    if (mappedKitchenId && isMigrationReplayLocalSystemSubcategoryRow(canonicalRow)) {
      const targetId = resolveSingleReplayLocalTarget(databaseUrl, buildReplayLocalSystemSubcategoryLookupSql({ targetColumns, canonicalRow, targetKitchenId: mappedKitchenId }), "Migration system subcategory");
      referenceMaps.foodSubcategories.set(ids.id, targetId); return;
    }
    const runtimeRow = mappedKitchenId ? remapCanonicalRowReferences(canonicalRow, { kitchen_id: mappedKitchenId }) : canonicalRow;
    runPsql(databaseUrl, buildExactRestoreRowSql({ relation, stableKey, targetColumns, canonicalRow: runtimeRow })); return;
  }
  throw new Error(`Unsupported replay-local reference relation ${relation}.`);
}

function pointerPreflightInput(manifest, materials, rules) {
  const rule = rules.find((entry) => entry.relation === "food_catalog_current_generation");
  if (!rule) throw new Error("Canonical current-generation pointer rule is missing.");
  const rows = segmentRows(materials[rule.segment] ?? "");
  if (rows.length !== 1) throw new Error("Current-generation portable pointer must contain exactly one singleton row.");
  const pointer = decodeCanonicalSegmentRow(rows[0]);
  const currentGenerationId = pointer.current_generation_id?.text ?? null;
  const currentEventId = pointer.current_event_id?.text ?? null;
  const currentValidationReportId = pointer.current_validation_report_id?.text ?? null;
  if (currentGenerationId !== (manifest.snapshotBoundary.currentGenerationId ?? null)) throw new Error("Portable pointer generation differs from the snapshot-boundary generation.");
  return {
    currentGenerationId, currentEventId, currentValidationReportId,
    transientRules: rules.filter((entry) => (entry.transientNeutralize ?? []).length > 0).map((entry) => ({ relation: entry.relation, fields: [...entry.transientNeutralize] })),
  };
}

export async function restorePortableArtifact({ artifactDir, targetUrl, relationsJson, evidenceOutput, disposableTarget, protectedKeyProvider = null }) {
  assertDisposableRestoreTarget(targetUrl, disposableTarget);
  const manifest = JSON.parse(await readFile(resolve(artifactDir, "manifest.json"), "utf8"));
  const hasProtected = manifest.segments.some((segment) => segment.protected && segment.loadMode !== "DERIVED_REBUILD");
  const effectiveProtectedKeyProvider = protectedKeyProvider ?? (hasProtected ? createEnvironmentProtectedSegmentKeyBinding(process.env).keyProvider : null);
  const materials = await readArtifactMaterials(artifactDir, manifest, effectiveProtectedKeyProvider);
  const { rules, canonicalProfileVerified, certificationEligible } = await loadRules(manifest, relationsJson);
  validatePortableArtifact({ manifest, materials, requiredSegments: certificationEligible ? undefined : rules.map((rule) => rule.segment) });
  const targetProfile = evaluatePortableTargetProfile(loadTargetProfile(targetUrl), { migrationCount: manifest.snapshotBoundary.migrationCount, latestMigration: manifest.snapshotBoundary.latestMigration, migrationLedgerIdentity: manifest.snapshotBoundary.migrationLedgerIdentity, schemaFingerprintSha256: manifest.sourceSchemaFingerprintSha256 });
  const plan = buildFoodCatalogRestorePlan(rules); const rulesByRelation = new Map(rules.map((rule) => [rule.relation, rule])); const segmentsByName = new Map(manifest.segments.map((segment) => [segment.name, segment]));
  const columns = new Map(); const getColumns = (relation) => { if (!columns.has(relation)) columns.set(relation, loadTargetColumns(targetUrl, relation)); return columns.get(relation); };
  const referenceMaps = { foodKitchens: new Map(), foodSubcategories: new Map() };
  const evidence = { format: "plaivra-food-catalog-restore-evidence", version: 1, headSha: manifest.sourceRepositoryCommit, profile: manifest.profile, registryAuthority: manifest.registryAuthority, semanticRootSha256: manifest.semanticRootSha256, artifactSemanticRootSha256: manifest.semanticRootSha256, snapshotBoundarySha256: manifest.snapshotBoundary.sha256, targetProfile, canonicalProfileVerified, certificationEligible, artifactValid: true, restoreVerified: false, trusted: false, drReady: false, phase: "LOADING_UNTRUSTED", replayLocalReferenceMappings: { foodKitchens: 0, foodSubcategories: 0 }, appliedSteps: [] };
  if (evidenceOutput) await writeFile(resolve(evidenceOutput), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  for (const action of plan) {
    const rule = action.relation ? rulesByRelation.get(action.relation) : undefined; const descriptor = rule ? segmentsByName.get(rule.segment) : undefined;
    if (["VERIFY_TARGET_PROFILE", "MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS", "MARK_DERIVED_REBUILD_PENDING"].includes(action.kind)) { evidence.appliedSteps.push(action.kind + (action.relation ? `:${action.relation}` : "")); continue; }
    if (action.kind === "PRE_POINTER_VERIFY") {
      runPsql(targetUrl, buildPrePointerVerificationSql(pointerPreflightInput(manifest, materials, rules)));
      evidence.appliedSteps.push(action.kind); continue;
    }
    if (!rule || !descriptor) throw new Error(`Restore plan references unknown relation ${action.relation ?? "<none>"}.`);
    const targetColumns = getColumns(rule.relation); const rows = segmentRows(materials[descriptor.name] ?? ""); const ownershipPolicy = seedRuntimeOwnershipForRelation(rule.relation);
    const preseedComparisonColumns = ownershipPolicy ? Object.keys(targetColumns).filter((column) => !ownershipPolicy.preseedComparisonOmit.includes(column)) : Object.keys(targetColumns);

    if (action.kind === "VALIDATE_PRESEEDED") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildPreseedValidationSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, comparisonColumns: preseedComparisonColumns }));
    } else if (action.kind === "RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME") {
      if (!ownershipPolicy) throw new Error(`Missing seed/runtime key policy for ${rule.relation}.`);
      for (const canonicalRow of rows) {
        const key = stableKeyTextTuple(decodeCanonicalSegmentRow(canonicalRow), rule.stableKey);
        if (isMigrationSeedKey(ownershipPolicy, key)) runPsql(targetUrl, buildPreseedValidationSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, comparisonColumns: preseedComparisonColumns }));
        else runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
      }
    } else if (action.kind === "VALIDATE_POINTER_SINGLETON_IDENTITY") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildPreseedValidationSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, comparisonColumns: [...rule.stableKey] }));
    } else if (action.kind === "RESTORE_MUTABLE_SINGLETON_FIELDS") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildMutableSingletonRestoreSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
    } else if (action.kind === "RESTORE_EXACT") {
      for (const canonicalRow of rows) {
        if (rule.restoreOwnership === "MIXED_REPLAY_LOCAL_REFERENCE") restoreReplayLocalReferenceRow({ databaseUrl: targetUrl, relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, referenceMaps });
        else runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
      }
    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));
    } else if (action.kind === "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL") {
      if (rule.relation !== "food_items") throw new Error("Plan 7 transitional cycle suspension is limited to food_items.");
      if (rows.length) {
        const remappedRows = rows.map((canonicalRow) => remapFoodItemRow(canonicalRow, referenceMaps)); const constraintWindow = buildFoodItemsVerificationConstraintWindowSql(loadFoodItemsVerificationConstraint(targetUrl));
        if (constraintWindow.validated) {
          const initialSql = remappedRows.map((canonicalRow) => buildTransitionalFoodItemsStages({ stableKey: rule.stableKey, targetColumns, canonicalRow }).initialSql);
          runPsql(targetUrl, ["BEGIN;", constraintWindow.dropSql, ...initialSql, constraintWindow.installNotValidSql, "COMMIT;"].join("\n"));
        } else {
          const comparisonColumns = Object.keys(targetColumns).filter((column) => column !== "verified_source_record_id");
          for (const canonicalRow of remappedRows) runPsql(targetUrl, buildPreseedValidationSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, comparisonColumns }));
        }
      }
    } else if (action.kind === "RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD") {
      if (rule.relation !== "food_items") throw new Error("Plan 7 transitional cycle reconstruction is limited to food_items.");
      if (rows.length) {
        const remappedRows = rows.map((canonicalRow) => remapFoodItemRow(canonicalRow, referenceMaps)); const constraintWindow = buildFoodItemsVerificationConstraintWindowSql(loadFoodItemsVerificationConstraint(targetUrl)); const triggerWindow = buildFoodItemsUpdatedAtTriggerWindowSql(loadFoodItemsUpdatedAtTrigger(targetUrl));
        const reconstructSql = remappedRows.map((canonicalRow) => buildTransitionalFoodItemsStages({ stableKey: rule.stableKey, targetColumns, canonicalRow }).reconstructSql);
        runPsql(targetUrl, ["BEGIN;", triggerWindow.disableSql, ...reconstructSql, triggerWindow.enableSql, constraintWindow.validateSql, "COMMIT;"].join("\n"));
      }
    } else if (action.kind === "RESTORE_POINTER_FIELDS_LAST") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildMutableSingletonRestoreSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
    }
    evidence.appliedSteps.push(`${action.kind}:${rule.relation}`);
  }
  evidence.replayLocalReferenceMappings = { foodKitchens: referenceMaps.foodKitchens.size, foodSubcategories: referenceMaps.foodSubcategories.size };
  evidence.phase = certificationEligible ? "RESTORE_LOADED_CANONICAL_PENDING_ASSERTIONS" : "RESTORE_LOADED_DIAGNOSTIC_NON_CERTIFIABLE";
  if (evidenceOutput) await writeFile(resolve(evidenceOutput), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

async function main() {
  const options = parseArgs(process.argv.slice(2)); const targetUrl = options.targetUrl ?? process.env.PLAN7_RESTORE_DATABASE_URL;
  if (!options.artifactDir || !targetUrl) throw new Error("--artifact-dir and a disposable target URL are required.");
  const evidence = await restorePortableArtifact({ ...options, targetUrl }); process.stdout.write(`${JSON.stringify(evidence)}\n`);
}
const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
