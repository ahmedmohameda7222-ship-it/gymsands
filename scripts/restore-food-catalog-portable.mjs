#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPortableTargetProfileSql, evaluatePortableTargetProfile } from "./verify-food-catalog-portable-target.mjs";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const SAFE_TYPE = /^[a-zA-Z0-9_." \[\](),]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);
const CANONICAL_REGISTRY_AUTHORITY = "CANONICAL_REGISTRY_V1";
const DIAGNOSTIC_REGISTRY_AUTHORITY = "DIAGNOSTIC_SUBSET";

function qid(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`Unsafe PostgreSQL identifier ${String(value)}.`);
  return `"${value}"`;
}

function safeType(value) {
  if (typeof value !== "string" || !SAFE_TYPE.test(value) || /;|--|\/\*/.test(value)) {
    throw new Error(`Unsafe PostgreSQL target type ${String(value)}.`);
  }
  return value;
}

function normalizeType(value) {
  return String(value).trim().toLowerCase().replace(/^pg_catalog\./, "").replace(/\s+/g, " ");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function codeUnitSort(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function snapshotBoundarySha(boundary) {
  return sha256(JSON.stringify({
    environment: boundary.environment,
    postgresSnapshot: boundary.postgresSnapshot,
    capturedAt: boundary.capturedAt,
    migrationCount: boundary.migrationCount,
    latestMigration: boundary.latestMigration,
    migrationLedgerIdentity: boundary.migrationLedgerIdentity,
    currentGenerationId: boundary.currentGenerationId,
    pointerRevision: boundary.pointerRevision,
    compatibilityVersion: boundary.compatibilityVersion,
    compatibilityMarker: boundary.compatibilityMarker,
  }));
}

function semanticRoot(manifest) {
  return sha256(JSON.stringify({
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    canonicalizationVersion: manifest.canonicalizationVersion,
    profile: manifest.profile,
    registryAuthority: manifest.registryAuthority ?? null,
    sourceRepositoryCommit: manifest.sourceRepositoryCommit,
    sourceSchemaFingerprintSha256: manifest.sourceSchemaFingerprintSha256,
    snapshotBoundary: {
      environment: manifest.snapshotBoundary.environment,
      postgresSnapshot: manifest.snapshotBoundary.postgresSnapshot,
      capturedAt: manifest.snapshotBoundary.capturedAt,
      migrationCount: manifest.snapshotBoundary.migrationCount,
      latestMigration: manifest.snapshotBoundary.latestMigration,
      migrationLedgerIdentity: manifest.snapshotBoundary.migrationLedgerIdentity,
      currentGenerationId: manifest.snapshotBoundary.currentGenerationId,
      pointerRevision: manifest.snapshotBoundary.pointerRevision,
      compatibilityVersion: manifest.snapshotBoundary.compatibilityVersion,
      compatibilityMarker: manifest.snapshotBoundary.compatibilityMarker,
      sha256: manifest.snapshotBoundary.sha256,
    },
    segments: [...manifest.segments].map((segment) => ({
      name: segment.name,
      relation: segment.relation,
      classification: segment.classification,
      loadMode: segment.loadMode,
      stableKey: [...segment.stableKey],
      rowCount: segment.rowCount,
      plaintextSemanticSha256: segment.plaintextSemanticSha256,
      snapshotBoundarySha256: segment.snapshotBoundarySha256,
      required: segment.required,
      protected: segment.protected,
    })).sort((left, right) => codeUnitSort(left.name, right.name)),
  }));
}

export function assertDisposableRestoreTarget(databaseUrl, acknowledged) {
  if (!acknowledged) throw new Error("Plan 7 restore requires explicit disposable-target acknowledgement.");
  let parsed;
  try { parsed = new URL(databaseUrl); } catch { throw new Error("Disposable restore target URL is invalid."); }
  if (!/^postgres(?:ql)?:$/.test(parsed.protocol)) throw new Error("Disposable restore target must be PostgreSQL.");
  const host = parsed.hostname.toLowerCase();
  if (host.endsWith(".supabase.co") || host.includes("prod") || host.includes("production")) {
    throw new Error("Provider/production-looking hosts are forbidden for Plan 7 disposable restore.");
  }
  return Object.freeze({ acknowledged: true, loopback: LOOPBACK.has(host), host });
}

export function decodeCanonicalSegmentRow(line) {
  let parsed;
  try { parsed = JSON.parse(line); } catch { throw new Error("Canonical segment row is not valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("Canonical segment row must be an array of typed column tuples.");
  const result = {};
  for (const tuple of parsed) {
    if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error("Malformed canonical typed column tuple.");
    const [column, pgType, text] = tuple;
    if (typeof column !== "string" || !IDENTIFIER.test(column) || typeof pgType !== "string" || !pgType.trim()) {
      throw new Error("Malformed canonical typed column identity.");
    }
    if (text !== null && typeof text !== "string") throw new Error(`Canonical scalar ${column} must be text or null.`);
    if (Object.hasOwn(result, column)) throw new Error(`Duplicate canonical column ${column}.`);
    result[column] = Object.freeze({ pgType, text });
  }
  return Object.freeze(result);
}

async function loadProtectedRuntime() {
  const protectedUrl = pathToFileURL(resolve("lib/food-catalog/portability/protected-segments.ts")).href;
  const keyProviderUrl = pathToFileURL(resolve("lib/food-catalog/portability/key-provider.ts")).href;
  const [protectedSegments, keyProvider] = await Promise.all([import(protectedUrl), import(keyProviderUrl)]);
  return {
    decryptProtectedSegment: protectedSegments.decryptProtectedSegment,
    createEnvironmentProtectedSegmentKeyBinding: keyProvider.createEnvironmentProtectedSegmentKeyBinding,
  };
}

export async function decodeProtectedArtifactMaterial({ descriptor, ciphertext, keyProvider }) {
  if (!descriptor?.protected) throw new Error("Protected artifact descriptor is required.");
  if (!descriptor.encryption || descriptor.encryption.algorithm !== "AES-256-GCM") {
    throw new Error(`Protected segment ${descriptor.name ?? "<unknown>"} is missing AES-256-GCM encryption metadata.`);
  }
  if (typeof descriptor.ciphertextTransportSha256 !== "string" || !SHA256.test(descriptor.ciphertextTransportSha256)) {
    throw new Error(`Protected segment ${descriptor.name ?? "<unknown>"} is missing ciphertext transport integrity.`);
  }
  if (!(ciphertext instanceof Uint8Array)) throw new Error("Protected segment ciphertext bytes are required.");
  const runtime = await loadProtectedRuntime();
  const plaintext = await runtime.decryptProtectedSegment({
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
    if (normalizeType(scalar.pgType) !== normalizeType(targetType)) {
      throw new Error(`Artifact PostgreSQL type for ${column} does not match target schema.`);
    }
  }
  for (const column of Object.keys(row)) {
    if (!Object.hasOwn(targetColumns, column)) throw new Error(`Artifact row contains unknown target column ${column}.`);
  }
}

function typedExpression(scalar, targetType) {
  const type = safeType(targetType);
  if (scalar.text === null) return `NULL::${type}`;
  const hex = Buffer.from(scalar.text, "utf8").toString("hex");
  return `convert_from(decode('${hex}','hex'),'UTF8')::${type}`;
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
  const table = qid(relation);
  const row = decodeCanonicalSegmentRow(canonicalRow);
  validateRowAgainstTarget(row, targetColumns);
  const forceNull = new Set(forceNullColumns);
  for (const column of forceNull) {
    if (!Object.hasOwn(targetColumns, column)) throw new Error(`Neutralized target column ${column} does not exist.`);
  }
  const columns = Object.keys(targetColumns);
  const values = columns.map((column) => forceNull.has(column) ? `NULL::${safeType(targetColumns[column])}` : typedExpression(row[column], targetColumns[column]));
  const compareColumns = columns.filter((column) => !comparisonOmitColumns.includes(column));
  const keyWhere = keyPredicate(row, stableKey, targetColumns);
  const exactWhere = exactPredicate(row, compareColumns, targetColumns);
  const conflict = stableKey.map(qid).join(", ");
  return `DO $plan7_restore$\nBEGIN\n  INSERT INTO public.${table} (${columns.map(qid).join(", ")})\n  VALUES (${values.join(", ")})\n  ON CONFLICT (${conflict}) DO NOTHING;\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyWhere} AND ${exactWhere}) THEN\n    RAISE EXCEPTION 'Plan7 conflicting stable identity in ${relation}';\n  END IF;\nEND\n$plan7_restore$;`;
}

export function buildPreseedValidationSql({ relation, stableKey, targetColumns, canonicalRow, comparisonColumns }) {
  const table = qid(relation);
  const row = decodeCanonicalSegmentRow(canonicalRow);
  validateRowAgainstTarget(row, targetColumns);
  const columns = comparisonColumns ?? Object.keys(targetColumns);
  const keyWhere = keyPredicate(row, stableKey, targetColumns);
  const exactWhere = exactPredicate(row, columns, targetColumns);
  return `DO $plan7_preseed$\nBEGIN\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyWhere} AND ${exactWhere}) THEN\n    RAISE EXCEPTION 'Plan7 migration-preseed mismatch in ${relation}';\n  END IF;\nEND\n$plan7_preseed$;`;
}

function buildReconstructSql({ relation, stableKey, targetColumns, canonicalRow, column }) {
  const table = qid(relation);
  const row = decodeCanonicalSegmentRow(canonicalRow);
  validateRowAgainstTarget(row, targetColumns);
  const expected = typedExpression(row[column], targetColumns[column]);
  const keyWhere = keyPredicate(row, stableKey, targetColumns);
  return `DO $plan7_cycle$\nBEGIN\n  UPDATE public.${table} AS t\n     SET ${qid(column)} = ${expected}\n   WHERE ${keyWhere}\n     AND (t.${qid(column)} IS NULL OR t.${qid(column)} IS NOT DISTINCT FROM ${expected});\n  IF NOT EXISTS (SELECT 1 FROM public.${table} AS t WHERE ${keyWhere} AND t.${qid(column)} IS NOT DISTINCT FROM ${expected}) THEN\n    RAISE EXCEPTION 'Plan7 transitional cycle conflict in ${relation}.${column}';\n  END IF;\nEND\n$plan7_cycle$;`;
}

export function buildTransitionalFoodItemsStages({ stableKey, targetColumns, canonicalRow }) {
  if (!Object.hasOwn(targetColumns, "verified_source_record_id")) throw new Error("food_items target is missing verified_source_record_id.");
  return Object.freeze({
    initialSql: buildExactRestoreRowSql({
      relation: "food_items",
      stableKey,
      targetColumns,
      canonicalRow,
      forceNullColumns: ["verified_source_record_id"],
      comparisonOmitColumns: ["verified_source_record_id"],
    }),
    reconstructSql: buildReconstructSql({
      relation: "food_items",
      stableKey,
      targetColumns,
      canonicalRow,
      column: "verified_source_record_id",
    }),
    reconstructAfterRelations: Object.freeze(["food_source_records"]),
  });
}

export function buildMutableSingletonRestoreSql({ relation, stableKey, targetColumns, canonicalRow }) {
  const row = decodeCanonicalSegmentRow(canonicalRow);
  validateRowAgainstTarget(row, targetColumns);
  const nonKeys = Object.keys(targetColumns).filter((column) => !stableKey.includes(column));
  if (!nonKeys.length) throw new Error(`Mutable singleton ${relation} has no mutable fields.`);
  const keyWhere = keyPredicate(row, stableKey, targetColumns);
  const exactWhere = exactPredicate(row, Object.keys(targetColumns), targetColumns);
  return `DO $plan7_pointer$\nBEGIN\n  UPDATE public.${qid(relation)} AS t SET ${nonKeys.map((column) => `${qid(column)}=${typedExpression(row[column], targetColumns[column])}`).join(", ")} WHERE ${keyWhere};\n  IF NOT FOUND THEN RAISE EXCEPTION 'Plan7 pointer singleton identity missing'; END IF;\n  IF NOT EXISTS (SELECT 1 FROM public.${qid(relation)} AS t WHERE ${keyWhere} AND ${exactWhere}) THEN RAISE EXCEPTION 'Plan7 pointer restore mismatch'; END IF;\nEND\n$plan7_pointer$;`;
}

function runPsql(databaseUrl, sql, { tuplesOnly = false } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuplesOnly) args.push("-A", "-t");
  const result = spawnSync("psql", args, { input: sql, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Disposable restore SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}

function loadTargetColumns(databaseUrl, relation) {
  const literal = relation.replaceAll("'", "''");
  const sql = `SELECT coalesce(json_object_agg(attname,format_type(atttypid,atttypmod) ORDER BY attnum),'{}'::json)::text FROM pg_attribute WHERE attrelid=to_regclass('public.${literal}') AND attnum>0 AND NOT attisdropped;`;
  const text = runPsql(databaseUrl, sql, { tuplesOnly: true });
  const parsed = JSON.parse(text || "{}");
  if (!Object.keys(parsed).length) throw new Error(`Required target relation public.${relation} is missing or has no columns.`);
  return parsed;
}

function loadTargetProfile(databaseUrl) {
  const text = runPsql(databaseUrl, buildPortableTargetProfileSql(), { tuplesOnly: true });
  return JSON.parse(text);
}

function validateRuntimeArtifact(manifest, materials) {
  if (manifest.format !== "plaivra-food-catalog-portable-export" || manifest.formatVersion !== 1 || manifest.canonicalizationVersion !== 1) {
    throw new Error("Unsupported Plan 7 portable artifact format.");
  }
  if (![CANONICAL_REGISTRY_AUTHORITY, DIAGNOSTIC_REGISTRY_AUTHORITY].includes(manifest.registryAuthority)) {
    throw new Error("Plan 7 artifact registry authority is missing or unsupported.");
  }
  if (!SHA256.test(manifest.semanticRootSha256) || !SHA256.test(manifest.snapshotBoundary?.sha256)) throw new Error("Artifact digests are malformed.");
  if (manifest.capturedAt !== manifest.snapshotBoundary.capturedAt) throw new Error("Artifact capture-time evidence is inconsistent.");
  if (snapshotBoundarySha(manifest.snapshotBoundary) !== manifest.snapshotBoundary.sha256) throw new Error("Artifact snapshot boundary digest mismatch.");
  if (semanticRoot(manifest) !== manifest.semanticRootSha256) throw new Error("Artifact semantic root mismatch.");
  for (const segment of manifest.segments) {
    if (segment.snapshotBoundarySha256 !== manifest.snapshotBoundary.sha256) throw new Error(`Segment ${segment.name} is snapshot-torn.`);
    if (segment.loadMode === "DERIVED_REBUILD") continue;
    if (segment.protected) {
      if (manifest.profile !== "FULL_DR") throw new Error(`Protected segment ${segment.name} requires FULL_DR profile.`);
      if (!segment.encryption || segment.encryption.algorithm !== "AES-256-GCM" || !SHA256.test(segment.ciphertextTransportSha256 ?? "")) {
        throw new Error(`Protected segment ${segment.name} has incomplete encrypted transport metadata.`);
      }
    }
    const bytes = materials[segment.name];
    if (bytes === undefined) throw new Error(`Missing segment material ${segment.name}.`);
    if (sha256(bytes) !== segment.plaintextSemanticSha256) throw new Error(`Segment ${segment.name} semantic digest mismatch.`);
    const rowCount = bytes.length === 0 ? 0 : bytes.endsWith("\n") ? bytes.slice(0, -1).split("\n").length : -1;
    if (rowCount !== segment.rowCount) throw new Error(`Segment ${segment.name} row-count mismatch.`);
  }
  return true;
}

function segmentRows(material) {
  if (material === "") return [];
  if (!material.endsWith("\n")) throw new Error("Canonical segment must end with newline.");
  return material.slice(0, -1).split("\n");
}

function prePointerSql(manifest) {
  const generation = manifest.snapshotBoundary.currentGenerationId;
  if (generation === null) return "SELECT true;";
  const hex = Buffer.from(String(generation), "utf8").toString("hex");
  return `DO $plan7_pre_pointer$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.food_catalog_generations WHERE id=convert_from(decode('${hex}','hex'),'UTF8')::uuid) THEN RAISE EXCEPTION 'Plan7 current generation is not restored'; END IF; END $plan7_pre_pointer$;`;
}

async function loadCanonicalRuntime() {
  const registryUrl = pathToFileURL(resolve("lib/food-catalog/portability/relation-registry.ts")).href;
  const profileUrl = pathToFileURL(resolve("lib/food-catalog/portability/profile-certification.ts")).href;
  const seedUrl = pathToFileURL(resolve("lib/food-catalog/portability/seed-runtime-ownership.ts")).href;
  const [registry, profile, seed] = await Promise.all([import(registryUrl), import(profileUrl), import(seedUrl)]);
  return {
    rulesForProfile: (requestedProfile) => registry.FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter(
      (rule) => rule.requiredProfile === "CORE_PORTABLE" || requestedProfile === "FULL_DR",
    ),
    validateCanonicalProfileManifest: profile.validateCanonicalProfileManifest,
    seedRuntimeOwnershipForRelation: seed.seedRuntimeOwnershipForRelation,
    stableKeyTextTuple: seed.stableKeyTextTuple,
    isMigrationSeedKey: seed.isMigrationSeedKey,
  };
}

async function loadRules(manifest, relationsJson) {
  const canonicalRuntime = await loadCanonicalRuntime();
  if (manifest.registryAuthority === CANONICAL_REGISTRY_AUTHORITY) {
    if (relationsJson) throw new Error("Trusted canonical restore cannot use --relations-json diagnostic overrides.");
    canonicalRuntime.validateCanonicalProfileManifest(manifest);
    return {
      rules: canonicalRuntime.rulesForProfile(manifest.profile),
      canonicalProfileVerified: true,
      certificationEligible: true,
      canonicalRuntime,
    };
  }
  if (!relationsJson) throw new Error("DIAGNOSTIC_SUBSET restore requires the matching --relations-json diagnostic descriptor file.");
  return {
    rules: JSON.parse(await readFile(resolve(relationsJson), "utf8")),
    canonicalProfileVerified: false,
    certificationEligible: false,
    canonicalRuntime,
  };
}

async function loadRestorePlan(rules) {
  const moduleUrl = pathToFileURL(resolve("lib/food-catalog/portability/restore-plan.ts")).href;
  const { buildFoodCatalogRestorePlan } = await import(moduleUrl);
  return buildFoodCatalogRestorePlan(rules);
}

function parseArgs(argv) {
  const options = { disposableTarget: false };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--artifact-dir") options.artifactDir = argv[++i];
    else if (value === "--target-url") options.targetUrl = argv[++i];
    else if (value === "--relations-json") options.relationsJson = argv[++i];
    else if (value === "--evidence-output") options.evidenceOutput = argv[++i];
    else if (value === "--disposable-target") options.disposableTarget = true;
    else throw new Error(`Unknown restore argument ${value}; exported DDL/schema inputs are not accepted.`);
  }
  return options;
}

export async function restorePortableArtifact({
  artifactDir,
  targetUrl,
  relationsJson,
  evidenceOutput,
  disposableTarget,
  protectedKeyProvider = null,
}) {
  assertDisposableRestoreTarget(targetUrl, disposableTarget);
  const manifest = JSON.parse(await readFile(resolve(artifactDir, "manifest.json"), "utf8"));
  const hasProtected = manifest.segments.some((segment) => segment.protected && segment.loadMode !== "DERIVED_REBUILD");
  let effectiveProtectedKeyProvider = protectedKeyProvider;
  if (hasProtected && !effectiveProtectedKeyProvider) {
    const runtime = await loadProtectedRuntime();
    effectiveProtectedKeyProvider = runtime.createEnvironmentProtectedSegmentKeyBinding(process.env).keyProvider;
  }

  const materials = {};
  for (const segment of manifest.segments) {
    if (segment.loadMode === "DERIVED_REBUILD") continue;
    if (segment.protected) {
      const ciphertext = await readFile(resolve(artifactDir, "segments", `${segment.name}.enc`));
      materials[segment.name] = await decodeProtectedArtifactMaterial({ descriptor: segment, ciphertext, keyProvider: effectiveProtectedKeyProvider });
    } else {
      materials[segment.name] = await readFile(resolve(artifactDir, "segments", `${segment.name}.ndjson`), "utf8");
    }
  }
  validateRuntimeArtifact(manifest, materials);
  const { rules, canonicalProfileVerified, certificationEligible, canonicalRuntime } = await loadRules(manifest, relationsJson);
  const targetProfile = evaluatePortableTargetProfile(loadTargetProfile(targetUrl), {
    migrationCount: manifest.snapshotBoundary.migrationCount,
    latestMigration: manifest.snapshotBoundary.latestMigration,
    migrationLedgerIdentity: manifest.snapshotBoundary.migrationLedgerIdentity,
    schemaFingerprintSha256: manifest.sourceSchemaFingerprintSha256,
  });
  const plan = await loadRestorePlan(rules);
  const rulesByRelation = new Map(rules.map((rule) => [rule.relation, rule]));
  const segmentsByName = new Map(manifest.segments.map((segment) => [segment.name, segment]));
  const columns = new Map();
  const getColumns = (relation) => {
    if (!columns.has(relation)) columns.set(relation, loadTargetColumns(targetUrl, relation));
    return columns.get(relation);
  };
  const evidence = {
    format: "plaivra-food-catalog-restore-evidence",
    version: 1,
    headSha: manifest.sourceRepositoryCommit,
    profile: manifest.profile,
    registryAuthority: manifest.registryAuthority,
    semanticRootSha256: manifest.semanticRootSha256,
    artifactSemanticRootSha256: manifest.semanticRootSha256,
    snapshotBoundarySha256: manifest.snapshotBoundary.sha256,
    targetProfile,
    canonicalProfileVerified,
    certificationEligible,
    artifactValid: true,
    restoreVerified: false,
    trusted: false,
    drReady: false,
    phase: "LOADING_UNTRUSTED",
    appliedSteps: [],
  };
  if (evidenceOutput) await writeFile(resolve(evidenceOutput), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  for (const action of plan) {
    const rule = action.relation ? rulesByRelation.get(action.relation) : undefined;
    const descriptor = rule ? segmentsByName.get(rule.segment) : undefined;
    if (["VERIFY_TARGET_PROFILE", "MARK_RESTORE_UNTRUSTED_PENDING_ASSERTIONS", "MARK_DERIVED_REBUILD_PENDING"].includes(action.kind)) {
      evidence.appliedSteps.push(action.kind + (action.relation ? `:${action.relation}` : ""));
      continue;
    }
    if (action.kind === "PRE_POINTER_VERIFY") {
      runPsql(targetUrl, prePointerSql(manifest));
      evidence.appliedSteps.push(action.kind);
      continue;
    }
    if (!rule || !descriptor) throw new Error(`Restore plan references unknown relation ${action.relation ?? "<none>"}.`);
    const targetColumns = getColumns(rule.relation);
    const rows = segmentRows(materials[descriptor.name] ?? "");
    const ownershipPolicy = canonicalRuntime.seedRuntimeOwnershipForRelation(rule.relation);
    const preseedComparisonColumns = ownershipPolicy
      ? Object.keys(targetColumns).filter((column) => !ownershipPolicy.preseedComparisonOmit.includes(column))
      : Object.keys(targetColumns);

    if (action.kind === "VALIDATE_PRESEEDED") {
      for (const canonicalRow of rows) {
        runPsql(targetUrl, buildPreseedValidationSql({
          relation: rule.relation,
          stableKey: rule.stableKey,
          targetColumns,
          canonicalRow,
          comparisonColumns: preseedComparisonColumns,
        }));
      }
    } else if (action.kind === "RESTORE_MIXED_KEYED_PRESEEDED_RUNTIME") {
      if (!ownershipPolicy) throw new Error(`Missing seed/runtime key policy for ${rule.relation}.`);
      for (const canonicalRow of rows) {
        const decoded = decodeCanonicalSegmentRow(canonicalRow);
        const stableKey = canonicalRuntime.stableKeyTextTuple(decoded, rule.stableKey);
        if (canonicalRuntime.isMigrationSeedKey(ownershipPolicy, stableKey)) {
          runPsql(targetUrl, buildPreseedValidationSql({
            relation: rule.relation,
            stableKey: rule.stableKey,
            targetColumns,
            canonicalRow,
            comparisonColumns: preseedComparisonColumns,
          }));
        } else {
          runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
        }
      }
    } else if (action.kind === "VALIDATE_POINTER_SINGLETON_IDENTITY") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildPreseedValidationSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, comparisonColumns: [...rule.stableKey] }));
    } else if (action.kind === "RESTORE_MUTABLE_SINGLETON_FIELDS") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildMutableSingletonRestoreSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
    } else if (action.kind === "RESTORE_EXACT") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
    } else if (action.kind === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildExactRestoreRowSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow, forceNullColumns: [...(rule.transientNeutralize ?? [])], comparisonOmitColumns: [...(rule.transientNeutralize ?? [])] }));
    } else if (action.kind === "RESTORE_TRANSITIONAL_WITH_CYCLE_NULL") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildTransitionalFoodItemsStages({ stableKey: rule.stableKey, targetColumns, canonicalRow }).initialSql);
    } else if (action.kind === "RECONSTRUCT_TRANSITIONAL_CYCLE_FIELD") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildTransitionalFoodItemsStages({ stableKey: rule.stableKey, targetColumns, canonicalRow }).reconstructSql);
    } else if (action.kind === "RESTORE_POINTER_FIELDS_LAST") {
      for (const canonicalRow of rows) runPsql(targetUrl, buildMutableSingletonRestoreSql({ relation: rule.relation, stableKey: rule.stableKey, targetColumns, canonicalRow }));
    }
    evidence.appliedSteps.push(`${action.kind}:${rule.relation}`);
  }
  evidence.phase = certificationEligible
    ? "RESTORE_LOADED_CANONICAL_PENDING_ASSERTIONS"
    : "RESTORE_LOADED_DIAGNOSTIC_NON_CERTIFIABLE";
  if (evidenceOutput) await writeFile(resolve(evidenceOutput), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const targetUrl = options.targetUrl ?? process.env.PLAN7_RESTORE_DATABASE_URL;
  if (!options.artifactDir || !targetUrl) throw new Error("--artifact-dir and a disposable target URL are required.");
  const evidence = await restorePortableArtifact({ ...options, targetUrl });
  process.stdout.write(`${JSON.stringify(evidence)}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`); process.exitCode = 1; });
