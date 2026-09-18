#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  assertDisposableRestoreTarget,
  decodeProtectedArtifactMaterial,
} from "./restore-food-catalog-portable.mjs";
import { captureRestoredServiceAuthority } from "./capture-food-catalog-restored-service-authority.mjs";
import { captureFoodCatalogSecurityEvidence } from "./capture-food-catalog-security-evidence.mjs";
import { captureSearchRuntimeEvidence } from "./capture-food-catalog-restored-search-runtime.mjs";
import { runAuthoritativeExport } from "./export-food-catalog-portable.mjs";
import {
  evaluatePortableTargetProfile,
  queryPortableTargetProfile,
} from "./verify-food-catalog-portable-target.mjs";
import {
  evaluateRestoreAssertions,
} from "../lib/food-catalog/portability/restore-assertions.ts";
import {
  validatePortableArtifact,
} from "../lib/food-catalog/portability/validate-artifact.ts";
import {
  validateCanonicalPortableProfileManifestV1,
} from "../lib/food-catalog/portability/profile-certification.ts";
import {
  createEnvironmentProtectedSegmentKeyBinding,
} from "../lib/food-catalog/portability/key-provider.ts";
import {
  FOOD_CATALOG_PORTABLE_RELATIONS_V1,
} from "../lib/food-catalog/portability/relation-registry.ts";
import {
  seedRuntimeOwnershipForRelation,
} from "../lib/food-catalog/portability/seed-runtime-ownership.ts";
import {
  prepareReplayLocalReferenceComparison,
} from "../lib/food-catalog/portability/replay-local-reference-comparison.mjs";

const SHA256 = /^[0-9a-f]{64}$/u;
const SHA40 = /^[0-9a-f]{40}$/u;
const CANONICAL_REGISTRY_AUTHORITY = "CANONICAL_REGISTRY_V1";
const PROTECTED_OWNER_STATE_RELATIONS = Object.freeze([
  "food_catalog_governance_principals",
  "food_catalog_governance_capability_assignments",
  "food_catalog_governance_policy_versions",
  "food_catalog_governance_policy_pointer",
  "food_catalog_correction_report_member_payloads",
  "food_personal_override_revisions",
  "food_personal_overrides",
  "food_personal_override_operations",
  "food_personal_corrections",
  "food_favorites",
  "user_food_favorites",
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function parseCanonicalRow(line) {
  let parsed;
  try { parsed = JSON.parse(line); } catch { throw new Error("Portable canonical row is not valid JSON."); }
  if (!Array.isArray(parsed)) throw new Error("Portable canonical row must be an array.");
  const map = new Map();
  for (const tuple of parsed) {
    if (!Array.isArray(tuple) || tuple.length !== 3) throw new Error("Portable canonical row has a malformed typed tuple.");
    const [column, pgType, text] = tuple;
    if (typeof column !== "string" || typeof pgType !== "string" || (text !== null && typeof text !== "string")) {
      throw new Error("Portable canonical row has an invalid typed tuple.");
    }
    if (map.has(column)) throw new Error(`Portable canonical row duplicates column ${column}.`);
    map.set(column, { column, pgType, text });
  }
  return { parsed, map };
}

function stableKeyForRow(line, stableKey) {
  const { map } = parseCanonicalRow(line);
  return stableKey.map((column) => {
    const scalar = map.get(column);
    if (!scalar || scalar.text === null) throw new Error(`Stable comparison key ${column} is absent/null.`);
    return scalar.text;
  });
}

function keyToken(key) {
  return JSON.stringify(key);
}

function filteredCanonicalRow(line, omittedColumns) {
  const omitted = new Set(omittedColumns);
  const { parsed } = parseCanonicalRow(line);
  return JSON.stringify(parsed.filter(([column]) => !omitted.has(column)));
}

function rowsByStableKey(rows, stableKey, relation) {
  const result = new Map();
  for (const line of rows) {
    const token = keyToken(stableKeyForRow(line, stableKey));
    if (result.has(token)) throw new Error(`Duplicate stable row identity in ${relation}: ${token}.`);
    result.set(token, line);
  }
  return result;
}

function isSeedKey(seedPolicy, key) {
  if (!seedPolicy) return false;
  return seedPolicy.migrationSeedKeys.some((seed) => seed.length === key.length && seed.every((value, index) => value === key[index]));
}

export function comparePortableRelationRows({
  relation,
  stableKey,
  sourceRows,
  targetRows,
  restoreOwnership = "UNIFORM",
  loadMode,
  seedPolicy,
  transientNeutralize = [],
  sourceTransientNeutralize = [],
}) {
  const source = rowsByStableKey(sourceRows, stableKey, relation);
  const target = rowsByStableKey(targetRows, stableKey, relation);
  if (source.size !== target.size) throw new Error(`Exact row-count mismatch for ${relation}.`);

  let transientNeutralized = true;
  for (const [token, sourceLine] of source) {
    const targetLine = target.get(token);
    if (targetLine === undefined) throw new Error(`Exact stable identity mismatch for ${relation}: ${token}.`);
    const key = JSON.parse(token);

    if (loadMode === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION") {
      const { map: sourceMap } = parseCanonicalRow(sourceLine);
      for (const column of sourceTransientNeutralize) {
        const scalar = sourceMap.get(column);
        if (!scalar || scalar.text !== null) {
          transientNeutralized = false;
          throw new Error(`Source transient field ${relation}.${column} was retained instead of neutralized to NULL.`);
        }
      }
      const { map: targetMap } = parseCanonicalRow(targetLine);
      for (const column of transientNeutralize) {
        const scalar = targetMap.get(column);
        if (!scalar || scalar.text !== null) {
          transientNeutralized = false;
          throw new Error(`Transient restore field ${relation}.${column} was not neutralized to NULL.`);
        }
      }
      const sourceComparable = filteredCanonicalRow(sourceLine, transientNeutralize);
      const targetComparable = filteredCanonicalRow(targetLine, transientNeutralize);
      if (sourceComparable !== targetComparable) throw new Error(`Exact typed row mismatch for ${relation} after transient neutralization.`);
      continue;
    }

    if (
      loadMode === "VALIDATE_PRESEEDED"
      && restoreOwnership !== "MUTABLE_PRESEEDED_SINGLETON"
      && isSeedKey(seedPolicy, key)
    ) {
      const omitted = seedPolicy?.preseedComparisonOmit ?? [];
      if (filteredCanonicalRow(sourceLine, omitted) !== filteredCanonicalRow(targetLine, omitted)) {
        throw new Error(`Migration-preseed semantic mismatch for ${relation}: ${token}.`);
      }
      continue;
    }

    if (sourceLine !== targetLine) {
      const kind = restoreOwnership === "MIXED_KEYED_PRESEEDED_RUNTIME" ? "runtime" : "exact typed";
      throw new Error(`${kind} row mismatch for ${relation}: ${token}.`);
    }
  }

  for (const token of target.keys()) {
    if (!source.has(token)) throw new Error(`Unexpected restored stable identity in ${relation}: ${token}.`);
  }

  return Object.freeze({ relation, rowCount: source.size, exact: true, transientNeutralized });
}

export function areDeclaredTransientRelationsNeutralized(rules, relationResults) {
  const resultsByRelation = new Map(relationResults.map((entry) => [entry.relation, entry]));
  return rules
    .filter((rule) => rule.loadMode === "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION")
    .every((rule) => resultsByRelation.get(rule.relation)?.transientNeutralized === true);
}

export function evaluateRestoredIngestionExecutionEvidence(observed) {
  for (const field of ["durableHistoryPreserved","transientLeaseStateNeutralized","restoreBlocksExact","guardPrecedesReplay","freshAcquireRejected","replayAcquireRejected"]) {
    if (observed?.[field] !== true) throw new Error(`Restored ingestion execution isolation failed: ${field}.`);
  }
  const expectedBlockedRunCount = Number(observed.expectedBlockedRunCount);
  if (!Number.isInteger(expectedBlockedRunCount) || expectedBlockedRunCount < 0) throw new Error("Restored ingestion expected block count is invalid.");
  if (Number(observed.observedBlockedRunCount) !== expectedBlockedRunCount) throw new Error("Restored ingestion block count mismatch.");
  const replayableAcquireOperationCount = Number(observed.replayableAcquireOperationCount);
  if (!Number.isInteger(replayableAcquireOperationCount) || replayableAcquireOperationCount < 0) {
    throw new Error("Restored ingestion replayable acquire-operation count is invalid.");
  }
  if (expectedBlockedRunCount > 0 && replayableAcquireOperationCount === 0) {
    throw new Error("Restored ingestion FULL_DR proof requires replayable acquire authority for active Production history.");
  }
  return Object.freeze({
    verified: true,
    expectedBlockedRunCount,
    observedBlockedRunCount: expectedBlockedRunCount,
    replayableAcquireOperationCount,
    restoredIngestionHistoryPreserved: true,
    restoredIngestionLeaseNeutralized: true,
    restoredIngestionOperationalBlockVerified: true,
    restoredIngestionAcquireRejected: true,
    restoredIngestionReplayRejected: true,
  });
}

function verifyRestoredIngestionExecutionIsolation(databaseUrl, sourceRows, sourceOperationRows) {
  const expected = [];
  for (const sourceRow of sourceRows) {
    const { map } = parseCanonicalRow(sourceRow);
    const id = map.get("id")?.text;
    const executionMode = map.get("execution_mode")?.text;
    const status = map.get("status")?.text;
    const leaseEpoch = map.get("lease_epoch")?.text;
    if (executionMode !== "production" || (status !== "prepared" && status !== "running")) continue;
    if (typeof id !== "string" || !/^[0-9a-f-]{36}$/iu.test(id) || typeof leaseEpoch !== "string" || !/^[0-9]+$/u.test(leaseEpoch)) {
      throw new Error("Canonical nonterminal Production ingestion history is malformed.");
    }
    expected.push(Object.freeze({ runId: id, status, leaseEpoch: Number(leaseEpoch) }));
  }
  expected.sort((a, b) => a.runId.localeCompare(b.runId));
  const expectedRunIds = new Set(expected.map((entry) => entry.runId));
  const replayAuthorities = [];
  for (const operationRow of sourceOperationRows) {
    const { map } = parseCanonicalRow(operationRow);
    const commandName = map.get("command_name")?.text;
    const runId = map.get("run_id")?.text;
    if (commandName !== "food_catalog_ingestion_acquire_lease_v2" || !expectedRunIds.has(runId)) continue;
    const operationId = map.get("operation_id")?.text;
    const commandChecksumSha256 = map.get("command_checksum_sha256")?.text?.toLowerCase();
    const resultText = map.get("result_json")?.text;
    let resultJson;
    try { resultJson = JSON.parse(resultText ?? "null"); } catch { throw new Error("Canonical replayable ingestion acquire result is malformed."); }
    if (typeof operationId !== "string" || !/^[0-9a-f-]{36}$/iu.test(operationId)
      || typeof commandChecksumSha256 !== "string" || !SHA256.test(commandChecksumSha256)
      || resultJson?.runId !== runId) {
      throw new Error("Canonical replayable ingestion acquire authority is malformed.");
    }
    replayAuthorities.push(Object.freeze({ operationId, commandChecksumSha256, runId }));
  }
  replayAuthorities.sort((a, b) => a.operationId.localeCompare(b.operationId));
  const targetRows = JSON.parse(runPsql(databaseUrl, `select coalesce(json_agg(json_build_object(
    'runId',run.id::text,'status',run.status,'leaseEpoch',run.lease_epoch,
    'leaseOwnerNull',run.lease_owner is null,'leaseTokenNull',run.lease_token is null,
    'leaseAcquiredAtNull',run.lease_acquired_at is null,'leaseHeartbeatAtNull',run.lease_heartbeat_at is null,
    'leaseExpiresAtNull',run.lease_expires_at is null
  ) order by run.id),'[]'::json)::text from public.food_ingestion_runs run where run.execution_mode='production' and run.status in ('prepared','running');`) || "[]");
  const blockRows = JSON.parse(runPsql(databaseUrl, `select coalesce(json_agg(json_build_object(
    'runId',restore_block.run_id::text,'status',restore_block.restored_status,'leaseEpoch',restore_block.restored_lease_epoch
  ) order by restore_block.run_id),'[]'::json)::text from public.food_catalog_ingestion_restore_blocks restore_block;`) || "[]");
  const normalizedTarget = targetRows.map((row) => ({ runId: row.runId, status: row.status, leaseEpoch: Number(row.leaseEpoch) })).sort((a,b) => a.runId.localeCompare(b.runId));
  const normalizedBlocks = blockRows.map((row) => ({ runId: row.runId, status: row.status, leaseEpoch: Number(row.leaseEpoch) })).sort((a,b) => a.runId.localeCompare(b.runId));
  const durableHistoryPreserved = stableStringify(normalizedTarget) === stableStringify(expected);
  const transientLeaseStateNeutralized = targetRows.every((row) => row.leaseOwnerNull && row.leaseTokenNull && row.leaseAcquiredAtNull && row.leaseHeartbeatAtNull && row.leaseExpiresAtNull);
  const restoreBlocksExact = stableStringify(normalizedBlocks) === stableStringify(expected);
  const functionDefinition = runPsql(databaseUrl, "select pg_get_functiondef('public.food_catalog_ingestion_acquire_lease_v2(jsonb)'::regprocedure);");
  const guardIndex = functionDefinition.indexOf("food_catalog_ingestion_require_not_restore_blocked_v1");
  const replayIndex = functionDefinition.indexOf("food_catalog_ingestion_replay_operation_v2");
  const guardPrecedesReplay = guardIndex >= 0 && replayIndex > guardIndex;
  let freshAcquireRejected = expected.length === 0;
  if (expected.length > 0) {
    const runId = expected[0].runId;
    const probe = runPsql(databaseUrl, `begin;
do $plan7_integrated_ingestion_gate$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','7b000000-0000-4000-8000-000000000001','commandChecksumSha256',repeat('b',64),
      'runId','${runId}'::uuid,'leaseOwner','plan7-integrated-restore-probe',
      'leaseToken','7b000000-0000-4000-8000-000000000101','leaseSeconds',120
    ));
    perform set_config('plan7.ingestion_restore_blocked','false',true);
  exception when sqlstate '55000' then
    perform set_config('plan7.ingestion_restore_blocked','true',true);
  end;
end
$plan7_integrated_ingestion_gate$;
select current_setting('plan7.ingestion_restore_blocked',true);
rollback;`);
    freshAcquireRejected = probe.split(/\r?\n/u).some((line) => line.trim() === "true" || line.trim() === "t");
  }
  let replayAcquireRejected = expected.length === 0;
  if (replayAuthorities.length > 0) {
    replayAcquireRejected = true;
    for (const authority of replayAuthorities) {
      const probe = runPsql(databaseUrl, `begin;
do $plan7_integrated_ingestion_replay_gate$
begin
  begin
    perform public.food_catalog_ingestion_acquire_lease_v2(jsonb_build_object(
      'operationId','${authority.operationId}'::uuid,'commandChecksumSha256','${authority.commandChecksumSha256}',
      'runId','${authority.runId}'::uuid,'leaseOwner','plan7-integrated-restored-replay-probe',
      'leaseToken','7b000000-0000-4000-8000-000000000102'::uuid,'leaseSeconds',120
    ));
    perform set_config('plan7.ingestion_restore_replay_blocked','false',true);
  exception when sqlstate '55000' then
    perform set_config('plan7.ingestion_restore_replay_blocked','true',true);
  end;
end
$plan7_integrated_ingestion_replay_gate$;
select current_setting('plan7.ingestion_restore_replay_blocked',true);
rollback;`);
      replayAcquireRejected = replayAcquireRejected
        && probe.split(/\r?\n/u).some((line) => line.trim() === "true" || line.trim() === "t");
    }
  }
  return evaluateRestoredIngestionExecutionEvidence({
    durableHistoryPreserved,
    transientLeaseStateNeutralized,
    restoreBlocksExact,
    guardPrecedesReplay,
    freshAcquireRejected,
    replayAcquireRejected,
    replayableAcquireOperationCount: replayAuthorities.length,
    expectedBlockedRunCount: expected.length,
    observedBlockedRunCount: blockRows.length,
  });
}

export function areProtectedOwnerStateRelationsVerified(relationsByName) {
  return PROTECTED_OWNER_STATE_RELATIONS
    .every((relation) => relationsByName.get(relation)?.exact === true);
}

function assertion(id, comparisonClass, passed, detail) {
  return Object.freeze({
    id,
    comparisonClass,
    mandatory: true,
    status: passed ? "PASS" : "FAIL",
    detail,
  });
}

export function buildFinalAssertionEvidence(input) {
  return Object.freeze([
    assertion("artifact_semantic_hashes", "BYTE_HASH", input.artifactHashesVerified, "Source and restored readback artifacts passed canonical structural/hash validation."),
    assertion("transport_integrity", "BYTE_HASH", input.transportVerified, "Protected encrypted transport authenticated and plaintext semantic digests verified."),
    assertion("stored_checksums", "BYTE_HASH", input.exactRelationComparisonVerified, "Stored architecture-defined checksum fields survived exact typed relation comparison."),
    assertion("typed_identity_values", "EXACT_IDENTITY_VALUE", input.exactRelationComparisonVerified, "Portable stable identities and typed scalar values match under declared restore semantics."),
    assertion("source_provenance", "EXACT_IDENTITY_VALUE", input.provenanceVerified, "Food provenance/source record identities match exactly."),
    assertion("nutrition_name_serving_lineage", "EXACT_IDENTITY_VALUE", input.lineageVerified, "Nutrition, name, serving and Plan 6 lineage authority matches exactly."),
    assertion("taxonomy_market_barcode", "EXACT_IDENTITY_VALUE", input.taxonomyMarketBarcodeVerified, "Taxonomy, market and GTIN/barcode authority matches exactly, including mixed runtime extensions."),
    assertion("verification_activation", "EXACT_IDENTITY_VALUE", input.verificationActivationVerified, "Verification and activation authority/history matches exactly."),
    assertion("generation_composition", "EXACT_IDENTITY_VALUE", input.generationVerified, "Catalog generations and composition match exactly."),
    assertion("current_pointer", "EXACT_IDENTITY_VALUE", input.pointerVerified, "Current-generation and governance pointer identities/values match after restore-last semantics."),
    assertion("merge_graph", "SEMANTIC", input.mergeGraphVerified, "Merge/redirect graph resolves without cycles or missing canonical targets."),
    assertion("governance_personal_overrides", "EXACT_IDENTITY_VALUE", input.governanceOwnerVerified, "Protected governance/personal authority and external owner bindings were restored and validated."),
    assertion("frozen_consumer_references", "SEMANTIC", input.consumerReferencesVerified, "Controlled frozen consumer reference preserves the stable Food ID and immutable snapshot checksum."),
    assertion("security_rls_acl_identity", "SEMANTIC", input.securityVerified, "RLS/policy/ACL/function privilege identity matches source authority and critical boundaries pass."),
    assertion("service_execution_binding", "SEMANTIC", input.serviceExecutionBindingVerified, "Durable Service principal/capability history survived while restored source/random/auth execution identities cannot claim normalized pending outbox authority."),
    assertion("migration_schema_fingerprint", "BYTE_HASH", input.migrationSchemaVerified, "Target PostgreSQL capability, migration ledger and schema fingerprint match artifact/Git authority."),
    assertion("transient_neutralization", "SEMANTIC", input.transientNeutralizationVerified, "Every declared resumable lease/claim field is NULL and restored nonterminal Production ingestion history remains blocked from lease reacquisition."),
  ]);
}

export function computeRestoredTargetIdentitySha256({
  migrationLedgerIdentity,
  schemaFingerprintSha256,
  securityRlsAclIdentitySha256,
  ownerBindingSha256,
  serviceAuthorityEvidenceSha256,
}) {
  for (const [value, label] of [
    [migrationLedgerIdentity, "migration ledger identity"],
    [schemaFingerprintSha256, "schema fingerprint"],
    [securityRlsAclIdentitySha256, "security/RLS/ACL identity"],
    [ownerBindingSha256, "owner binding identity"],
    [serviceAuthorityEvidenceSha256, "Service authority evidence identity"],
  ]) {
    if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return sha256(stableStringify({
    migrationLedgerIdentity,
    schemaFingerprintSha256,
    securityRlsAclIdentitySha256,
    ownerBindingSha256,
    serviceAuthorityEvidenceSha256,
  }));
}

function runPsql(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Integrated restore evidence SQL failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim();
}

export function buildOwnerBindingEvidenceSql() {
  return `WITH required_owner AS (
  SELECT human_user_id AS user_id, 'governance'::text AS source
  FROM public.food_catalog_governance_principals
  WHERE principal_type='human' AND active AND revoked_at IS NULL
  UNION
  SELECT user_id, 'personal_override'::text AS source FROM public.food_personal_overrides
  UNION
  SELECT user_id, 'personal_override_revision'::text AS source FROM public.food_personal_override_revisions
  UNION
  SELECT user_id, 'personal_override_operation'::text AS source FROM public.food_personal_override_operations
  UNION
  SELECT user_id, 'personal_correction'::text AS source FROM public.food_personal_corrections
  UNION
  SELECT user_id, 'favorite'::text AS source FROM public.food_favorites
  UNION
  SELECT user_id, 'transitional_favorite'::text AS source FROM public.user_food_favorites
  UNION
  SELECT reporter_user_id AS user_id, 'correction_report_member_payload'::text AS source
  FROM public.food_catalog_correction_report_member_payloads
), owner_id AS (
  SELECT DISTINCT user_id FROM required_owner WHERE user_id IS NOT NULL
), evidence AS (
  SELECT owner.user_id::text AS user_id,
         (SELECT count(*) FROM auth.users u WHERE u.id=owner.user_id) AS auth_matches,
         (SELECT count(*) FROM public.profiles p WHERE p.id=owner.user_id) AS profile_matches,
         (SELECT count(*) FROM public.account_access_states a WHERE a.user_id=owner.user_id AND a.state='active' AND a.disabled_at IS NULL) AS active_access_matches,
         (SELECT count(*) FROM public.food_catalog_governance_principals g WHERE g.principal_type='human' AND g.human_user_id=owner.user_id AND g.active AND g.revoked_at IS NULL) AS live_governance_matches
  FROM owner_id owner
)
SELECT coalesce(json_agg(evidence ORDER BY user_id),'[]'::json)::text FROM evidence;`;
}

function queryOwnerBindingEvidence(databaseUrl) {
  const rows = JSON.parse(runPsql(databaseUrl, buildOwnerBindingEvidenceSql()) || "[]");
  for (const row of rows) {
    if (Number(row.auth_matches) !== 1 || Number(row.profile_matches) !== 1 || Number(row.active_access_matches) !== 1) {
      throw new Error(`Owner identity binding failed closed for ${row.user_id}.`);
    }
    if (Number(row.live_governance_matches) > 1) throw new Error(`Ambiguous live governance owner binding for ${row.user_id}.`);
  }
  return Object.freeze({
    verified: true,
    ownerCount: rows.length,
    ownerBindingSha256: sha256(stableStringify(rows)),
  });
}

function verifyMergeGraph(databaseUrl) {
  const sql = `WITH RECURSIVE edges AS (
  SELECT id AS source_id, merged_into_food_id AS target_id FROM public.food_items WHERE merged_into_food_id IS NOT NULL
  UNION ALL
  SELECT source_food_id, target_food_id FROM public.food_catalog_generation_redirects
), walk AS (
  SELECT source_id AS start_id, source_id, target_id, ARRAY[source_id]::uuid[] AS path, false AS cycle FROM edges
  UNION ALL
  SELECT walk.start_id, edge.source_id, edge.target_id, walk.path || edge.source_id,
         edge.source_id = ANY(walk.path) AS cycle
  FROM walk JOIN edges edge ON edge.source_id=walk.target_id
  WHERE NOT walk.cycle
)
SELECT json_build_object(
  'edgeCount',(SELECT count(*) FROM edges),
  'cycleCount',(SELECT count(*) FROM walk WHERE cycle),
  'missingTargetCount',(SELECT count(*) FROM edges e LEFT JOIN public.food_items f ON f.id=e.target_id WHERE f.id IS NULL)
)::text;`;
  const evidence = JSON.parse(runPsql(databaseUrl, sql));
  if (Number(evidence.cycleCount) !== 0 || Number(evidence.missingTargetCount) !== 0) {
    throw new Error("Restored merge/redirect graph contains a cycle or missing target.");
  }
  return Object.freeze({ verified: true, ...evidence });
}

function postgresVersion(databaseUrl) {
  const version = runPsql(databaseUrl, "select current_setting('server_version');");
  if (!version.startsWith("17.")) throw new Error(`Expected PostgreSQL 17.x, observed ${version}.`);
  return version;
}

function materialRows(material) {
  if (material === "") return [];
  if (!material.endsWith("\n")) throw new Error("Canonical portable material must end with newline.");
  return material.slice(0, -1).split("\n");
}

async function readArtifact(artifactDir, keyProvider) {
  const manifest = JSON.parse(await readFile(resolve(artifactDir, "manifest.json"), "utf8"));
  validateCanonicalPortableProfileManifestV1(manifest);
  if (manifest.registryAuthority !== CANONICAL_REGISTRY_AUTHORITY) throw new Error("Integrated certification requires canonical-registry artifacts.");
  const materials = {};
  let protectedCount = 0;
  for (const segment of manifest.segments) {
    if (segment.loadMode === "DERIVED_REBUILD") continue;
    if (segment.protected) {
      protectedCount += 1;
      const ciphertext = await readFile(resolve(artifactDir, "segments", `${segment.name}.enc`));
      materials[segment.name] = await decodeProtectedArtifactMaterial({ descriptor: segment, ciphertext, keyProvider });
    } else {
      materials[segment.name] = await readFile(resolve(artifactDir, "segments", `${segment.name}.ndjson`), "utf8");
    }
  }
  validatePortableArtifact({ manifest, materials });
  return { manifest, materials, protectedCount };
}

function durableSnapshotBoundary(boundary) {
  return Object.freeze({
    migrationCount: boundary?.migrationCount,
    latestMigration: boundary?.latestMigration,
    migrationLedgerIdentity: boundary?.migrationLedgerIdentity,
    currentGenerationId: boundary?.currentGenerationId,
    pointerRevision: boundary?.pointerRevision,
    compatibilityVersion: boundary?.compatibilityVersion,
    compatibilityMarker: boundary?.compatibilityMarker,
  });
}

export function assertRecordedTargetReadbackMatchesLive(recorded, live, rules) {
  if (recorded?.manifest?.profile !== "FULL_DR" || live?.manifest?.profile !== "FULL_DR") {
    throw new Error("Recorded target readback and fresh live target readback must both be FULL_DR.");
  }
  if (recorded.manifest.sourceRepositoryCommit !== live.manifest.sourceRepositoryCommit) {
    throw new Error("Recorded target readback repository commit does not match fresh live target readback.");
  }
  if (recorded.manifest.sourceSchemaFingerprintSha256 !== live.manifest.sourceSchemaFingerprintSha256) {
    throw new Error("Recorded target readback schema fingerprint does not match fresh live target readback.");
  }
  if (stableStringify(durableSnapshotBoundary(recorded.manifest.snapshotBoundary)) !== stableStringify(durableSnapshotBoundary(live.manifest.snapshotBoundary))) {
    throw new Error("Recorded target readback durable snapshot boundary does not match fresh live target readback.");
  }
  const recordedDescriptors = new Map(recorded.manifest.segments.map((segment) => [segment.name, segment]));
  const liveDescriptors = new Map(live.manifest.segments.map((segment) => [segment.name, segment]));
  for (const rule of rules) {
    if (rule.loadMode === "DERIVED_REBUILD") continue;
    const recordedDescriptor = recordedDescriptors.get(rule.segment);
    const liveDescriptor = liveDescriptors.get(rule.segment);
    if (!recordedDescriptor || !liveDescriptor) throw new Error(`Recorded/live target readback is missing ${rule.segment}.`);
    if (recordedDescriptor.rowCount !== liveDescriptor.rowCount || recordedDescriptor.plaintextSemanticSha256 !== liveDescriptor.plaintextSemanticSha256) {
      throw new Error(`Recorded target readback segment ${rule.segment} does not match fresh live target readback.`);
    }
    if ((recorded.materials[rule.segment] ?? "") !== (live.materials[rule.segment] ?? "")) {
      throw new Error(`Recorded target readback material ${rule.segment} does not match fresh live target readback.`);
    }
  }
  return true;
}

async function recaptureLiveTargetArtifact({ databaseUrl, expectedHead, rules, binding }) {
  const outputDir = await mkdtemp(join(tmpdir(), "plaivra-plan7-live-target-"));
  try {
    await runAuthoritativeExport({
      databaseUrl,
      outputDir,
      profile: "FULL_DR",
      sourceRepositoryCommit: expectedHead,
      rules,
      registryAuthority: CANONICAL_REGISTRY_AUTHORITY,
      protectedKeyProvider: binding.keyProvider,
      protectedKeyId: binding.keyId,
    });
    return await readArtifact(outputDir, binding.keyProvider);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}

export function requireLinkedSearchEvidence(sourceSearch, targetSearch, manifest, expectedHead) {
  if (sourceSearch.providerNetworkUsed || targetSearch.providerNetworkUsed) throw new Error("Integrated search proof must remain provider-network isolated.");
  if (sourceSearch.headSha !== expectedHead || targetSearch.headSha !== expectedHead) throw new Error("Integrated search evidence head SHA mismatch.");
  if (sourceSearch.mode !== "source-adversarial" || sourceSearch.staleAdversarialFixtureVerified !== true) {
    throw new Error("Integrated source search evidence must be source-adversarial with stale fixture proof.");
  }
  if (targetSearch.mode !== "restored-authoritative" || targetSearch.authoritativeCurrentOnlyRebuildVerified !== true || Number(targetSearch.documentCounts?.stale) !== 0) {
    throw new Error("Integrated target search evidence must be restored-authoritative and current-only with zero stale documents.");
  }
  if (!sourceSearch.rebuildVerified || !targetSearch.rebuildVerified || !targetSearch.staleGenerationIsolationVerified) {
    throw new Error("Integrated search rebuild/stale-generation evidence is incomplete.");
  }
  if (sourceSearch.goldenResultSha256 !== targetSearch.goldenResultSha256) throw new Error("Restored search golden result differs from source behavior.");
  if (sourceSearch.currentGenerationId !== manifest.snapshotBoundary.currentGenerationId || targetSearch.currentGenerationId !== manifest.snapshotBoundary.currentGenerationId) {
    throw new Error("Search evidence is not bound to the exact exported/restored current generation.");
  }
  return true;
}

export function evaluateRestoredServiceAuthorityEvidence(observed, expected) {
  if (observed?.format !== "plaivra-food-catalog-restored-service-authority-evidence" || observed?.version !== 4) {
    throw new Error("Restored Service authority evidence binding format/version is invalid.");
  }
  if (!expected || typeof expected !== "object") throw new Error("Restored Service authority evidence expected binding is required.");
  const bindings = [
    ["headSha", SHA40, "head"],
    ["artifactSemanticRootSha256", SHA256, "artifact semantic root"],
    ["snapshotBoundarySha256", SHA256, "snapshot boundary"],
    ["targetMigrationLedgerIdentity", SHA256, "target migration ledger"],
    ["targetSchemaFingerprintSha256", SHA256, "target schema fingerprint"],
  ];
  const expectedValue = (field) => {
    if (field === "targetMigrationLedgerIdentity") return expected.migrationLedgerIdentity;
    if (field === "targetSchemaFingerprintSha256") return expected.schemaFingerprintSha256;
    return expected[field];
  };
  for (const [field, pattern, label] of bindings) {
    const actual = observed?.[field];
    const required = expectedValue(field);
    if (typeof actual !== "string" || !pattern.test(actual) || typeof required !== "string" || !pattern.test(required) || actual !== required) {
      throw new Error(`Restored Service authority evidence ${label} binding mismatch.`);
    }
  }
  const requiredTrue = [
    "sourceServiceIdentityRejected",
    "authenticatedClaimRejected",
    "randomServiceIdentityRejected",
    "principalHistoryPreserved",
    "capabilityHistoryPreserved",
    "outboxPendingUnclaimed",
    "serviceExecutionBindingUnavailable",
  ];
  for (const field of requiredTrue) {
    if (observed?.[field] !== true) throw new Error(`Restored Service execution binding evidence failed: ${field}.`);
  }
  if (observed.automaticDeliveryObserved !== false) throw new Error("Restored Service execution binding evidence observed automatic delivery.");
  return Object.freeze({
    verified: true,
    automaticDeliveryObserved: false,
    serviceAuthorityEvidenceSha256: sha256(stableStringify(observed)),
  });
}

async function verifyConsumerReference(databaseUrl, fixturePath) {
  const fixture = JSON.parse(await readFile(resolve(fixturePath), "utf8"));
  if (typeof fixture.foodId !== "string" || typeof fixture.frozenSnapshot !== "object" || fixture.frozenSnapshot === null) {
    throw new Error("Controlled consumer-reference fixture is malformed.");
  }
  const expectedHash = sha256(stableStringify(fixture.frozenSnapshot));
  if (fixture.frozenSnapshotSha256 !== expectedHash) throw new Error("Controlled frozen consumer snapshot checksum mismatch.");
  const literal = fixture.foodId.replaceAll("'", "''");
  if (runPsql(databaseUrl, `select count(*)::text from public.food_items where id='${literal}'::uuid;`) !== "1") {
    throw new Error("Controlled consumer Food ID no longer resolves on restored target.");
  }
  return Object.freeze({ verified: true, foodId: fixture.foodId, frozenSnapshotSha256: expectedHash });
}

export function parseIntegratedRestoreArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = () => {
      const result = argv[++index];
      if (!result) throw new Error(`${value} requires a value.`);
      return result;
    };
    if (value === "--source-artifact-dir") options.sourceArtifactDir = next();
    else if (value === "--target-artifact-dir") options.targetArtifactDir = next();
    else if (value === "--target-url") options.targetUrl = next();
    else if (value === "--restore-evidence") options.restoreEvidencePath = next();
    else if (value === "--source-security") options.sourceSecurityPath = next();
    else if (value === "--target-security") options.targetSecurityPath = next();
    else if (value === "--target-service-authority") options.targetServiceAuthorityPath = next();
    else if (value === "--source-service-identity") options.sourceServiceIdentity = next();
    else if (value === "--source-search") options.sourceSearchPath = next();
    else if (value === "--target-search") options.targetSearchPath = next();
    else if (value === "--consumer-reference") options.consumerReferencePath = next();
    else if (value === "--expected-head") options.expectedHead = next();
    else if (value === "--max-artifact-age-ms") options.maxArtifactAgeMs = next();
    else if (value === "--output") options.output = next();
    else throw new Error(`Unknown integrated restore verifier argument ${value}.`);
  }
  const required = ["sourceArtifactDir","targetArtifactDir","targetUrl","restoreEvidencePath","sourceSecurityPath","targetSecurityPath","targetServiceAuthorityPath","sourceServiceIdentity","sourceSearchPath","targetSearchPath","consumerReferencePath","expectedHead","maxArtifactAgeMs","output"];
  for (const field of required) if (!options[field]) throw new Error(`Missing required integrated restore verifier option ${field}.`);
  if (!SHA40.test(options.expectedHead)) throw new Error("Integrated restore verifier expected head must be an exact commit SHA.");
  const maxArtifactAgeMs = Number(options.maxArtifactAgeMs);
  if (!Number.isFinite(maxArtifactAgeMs) || !Number.isInteger(maxArtifactAgeMs) || maxArtifactAgeMs <= 0) {
    throw new Error("Integrated restore verifier max artifact age must be a finite positive integer in milliseconds.");
  }
  options.maxArtifactAgeMs = maxArtifactAgeMs;
  return options;
}

export async function verifyIntegratedRestore(options) {
  const disposableTarget = assertDisposableRestoreTarget(options.targetUrl, true);
  const binding = createEnvironmentProtectedSegmentKeyBinding(process.env);
  const source = await readArtifact(options.sourceArtifactDir, binding.keyProvider);
  const recordedTarget = await readArtifact(options.targetArtifactDir, binding.keyProvider);
  if (source.manifest.profile !== "FULL_DR" || recordedTarget.manifest.profile !== "FULL_DR") throw new Error("Integrated certification proof requires FULL_DR source and target-readback artifacts.");
  if (source.manifest.sourceRepositoryCommit !== options.expectedHead || recordedTarget.manifest.sourceRepositoryCommit !== options.expectedHead) {
    throw new Error("Integrated artifact repository commit does not match exact CI head.");
  }

  const restoreEvidence = JSON.parse(await readFile(resolve(options.restoreEvidencePath), "utf8"));
  if (restoreEvidence.semanticRootSha256 !== source.manifest.semanticRootSha256 || restoreEvidence.artifactValid !== true) {
    throw new Error("Restore loader evidence is not linked to the source artifact root.");
  }

  const targetProfileObserved = queryPortableTargetProfile(options.targetUrl);
  const targetProfile = evaluatePortableTargetProfile(targetProfileObserved, {
    migrationCount: source.manifest.snapshotBoundary.migrationCount,
    latestMigration: source.manifest.snapshotBoundary.latestMigration,
    migrationLedgerIdentity: source.manifest.snapshotBoundary.migrationLedgerIdentity,
    schemaFingerprintSha256: source.manifest.sourceSchemaFingerprintSha256,
  });

  const rules = FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter((rule) => rule.requiredProfile === "CORE_PORTABLE" || source.manifest.profile === "FULL_DR");
  const target = await recaptureLiveTargetArtifact({
    databaseUrl: options.targetUrl,
    expectedHead: options.expectedHead,
    rules,
    binding,
  });
  assertRecordedTargetReadbackMatchesLive(recordedTarget, target, rules);
  if (target.manifest.sourceRepositoryCommit !== options.expectedHead) throw new Error("Fresh live target readback repository commit does not match exact CI head.");

  const sourceDescriptors = new Map(source.manifest.segments.map((segment) => [segment.name, segment]));
  const targetDescriptors = new Map(target.manifest.segments.map((segment) => [segment.name, segment]));
  const sourceRowsFor = (relation) => {
    const rule = rules.find((entry) => entry.relation === relation);
    if (!rule) throw new Error(`Missing canonical registry rule for ${relation}.`);
    return materialRows(source.materials[rule.segment] ?? "");
  };
  const targetRowsFor = (relation) => {
    const rule = rules.find((entry) => entry.relation === relation);
    if (!rule) throw new Error(`Missing canonical registry rule for ${relation}.`);
    return materialRows(target.materials[rule.segment] ?? "");
  };
  const replayReferences = prepareReplayLocalReferenceComparison({
    sourceKitchenRows: sourceRowsFor("food_kitchens"),
    targetKitchenRows: targetRowsFor("food_kitchens"),
    sourceSubcategoryRows: sourceRowsFor("food_subcategories"),
    targetSubcategoryRows: targetRowsFor("food_subcategories"),
    sourceFoodRows: sourceRowsFor("food_items"),
  });

  const relationResults = [replayReferences.kitchenResult, replayReferences.subcategoryResult];
  for (const rule of rules) {
    if (rule.loadMode === "DERIVED_REBUILD" || rule.restoreOwnership === "MIXED_REPLAY_LOCAL_REFERENCE") continue;
    const sourceDescriptor = sourceDescriptors.get(rule.segment);
    const targetDescriptor = targetDescriptors.get(rule.segment);
    if (!sourceDescriptor || !targetDescriptor) throw new Error(`Canonical integrated artifact is missing ${rule.segment}.`);
    relationResults.push(comparePortableRelationRows({
      relation: rule.relation,
      stableKey: rule.stableKey,
      sourceRows: rule.relation === "food_items" ? replayReferences.foodItemSourceRows : materialRows(source.materials[rule.segment] ?? ""),
      targetRows: materialRows(target.materials[rule.segment] ?? ""),
      restoreOwnership: rule.restoreOwnership ?? "UNIFORM",
      loadMode: rule.loadMode,
      seedPolicy: seedRuntimeOwnershipForRelation(rule.relation),
      transientNeutralize: rule.transientNeutralize ?? [],
      sourceTransientNeutralize: rule.sourceTransientNeutralize ?? [],
    }));
  }

  const sourceSecurity = JSON.parse(await readFile(resolve(options.sourceSecurityPath), "utf8"));
  const recordedTargetSecurity = JSON.parse(await readFile(resolve(options.targetSecurityPath), "utf8"));
  const targetSecurity = captureFoodCatalogSecurityEvidence(options.targetUrl);
  if (stableStringify(recordedTargetSecurity) !== stableStringify(targetSecurity)) {
    throw new Error("Recorded target security evidence does not match a fresh proof on the current target.");
  }
  if (!sourceSecurity.criticalBoundariesVerified || !targetSecurity.criticalBoundariesVerified) throw new Error("Critical Food Catalog RLS/ACL boundary verification failed.");
  if (sourceSecurity.securityRlsAclIdentitySha256 !== targetSecurity.securityRlsAclIdentitySha256) throw new Error("Restored RLS/ACL/policy identity differs from source Git-migrated authority.");
  if (!SHA256.test(targetSecurity.securityRlsAclIdentitySha256 ?? "")) throw new Error("Target security identity digest is malformed.");

  const recordedServiceAuthority = JSON.parse(await readFile(resolve(options.targetServiceAuthorityPath), "utf8"));
  const liveServiceAuthority = captureRestoredServiceAuthority(options.targetUrl, options.sourceServiceIdentity);
  if (stableStringify(recordedServiceAuthority) !== stableStringify(liveServiceAuthority)) {
    throw new Error("Recorded restored Service authority evidence does not match a fresh proof on the current target.");
  }
  const boundServiceAuthority = Object.freeze({
    ...liveServiceAuthority,
    version: 4,
    headSha: options.expectedHead,
    artifactSemanticRootSha256: source.manifest.semanticRootSha256,
    snapshotBoundarySha256: source.manifest.snapshotBoundary.sha256,
    targetMigrationLedgerIdentity: targetProfile.migrationLedgerIdentity,
    targetSchemaFingerprintSha256: targetProfile.schemaFingerprintSha256,
  });
  const serviceExecutionBinding = evaluateRestoredServiceAuthorityEvidence(boundServiceAuthority, {
    headSha: options.expectedHead,
    artifactSemanticRootSha256: source.manifest.semanticRootSha256,
    snapshotBoundarySha256: source.manifest.snapshotBoundary.sha256,
    migrationLedgerIdentity: targetProfile.migrationLedgerIdentity,
    schemaFingerprintSha256: targetProfile.schemaFingerprintSha256,
  });

  const ownerBinding = queryOwnerBindingEvidence(options.targetUrl);
  const targetIdentity = computeRestoredTargetIdentitySha256({
    migrationLedgerIdentity: targetProfile.migrationLedgerIdentity,
    schemaFingerprintSha256: targetProfile.schemaFingerprintSha256,
    securityRlsAclIdentitySha256: targetSecurity.securityRlsAclIdentitySha256,
    ownerBindingSha256: ownerBinding.ownerBindingSha256,
    serviceAuthorityEvidenceSha256: serviceExecutionBinding.serviceAuthorityEvidenceSha256,
  });
  const mergeGraph = verifyMergeGraph(options.targetUrl);
  const consumerReference = await verifyConsumerReference(options.targetUrl, options.consumerReferencePath);
  const sourceSearch = JSON.parse(await readFile(resolve(options.sourceSearchPath), "utf8"));
  const recordedTargetSearch = JSON.parse(await readFile(resolve(options.targetSearchPath), "utf8"));
  const targetSearch = captureSearchRuntimeEvidence(options.targetUrl, options.expectedHead, "restored-authoritative");
  if (stableStringify(recordedTargetSearch) !== stableStringify(targetSearch)) {
    throw new Error("Recorded restored search evidence does not match a fresh proof on the current target.");
  }
  requireLinkedSearchEvidence(sourceSearch, targetSearch, source.manifest, options.expectedHead);

  const relationsByName = new Map(relationResults.map((entry) => [entry.relation, entry]));
  const verifiedRelations = (names) => names.every((name) => relationsByName.get(name)?.exact === true);
  const protectedVerified = source.protectedCount > 0 && target.protectedCount === source.protectedCount;
  const transientVerified = areDeclaredTransientRelationsNeutralized(rules, relationResults);
  const restoredIngestionExecution = verifyRestoredIngestionExecutionIsolation(
    options.targetUrl,
    sourceRowsFor("food_ingestion_runs"),
    sourceRowsFor("food_ingestion_control_operations"),
  );

  const assertionEvidence = buildFinalAssertionEvidence({
    artifactHashesVerified: true,
    transportVerified: protectedVerified,
    exactRelationComparisonVerified: relationResults.every((entry) => entry.exact === true),
    provenanceVerified: verifiedRelations(["food_source_records"]),
    lineageVerified: verifiedRelations(["food_nutrition_revisions","food_serving_options","food_names","food_catalog_serving_fact_lineages","food_catalog_serving_fact_revisions","food_catalog_name_fact_lineages","food_catalog_name_fact_revisions"]),
    taxonomyMarketBarcodeVerified: verifiedRelations(["food_taxonomy_namespaces","food_taxonomy_nodes","food_taxonomy_assignments","market_scopes","market_scope_memberships","food_market_assignments","food_barcodes","food_catalog_barcode_corrections"]),
    verificationActivationVerified: verifiedRelations(["food_verification_assertions","food_catalog_activation_sets","food_catalog_activation_set_members","food_catalog_activation_events"]),
    generationVerified: verifiedRelations(["food_catalog_generations","food_catalog_generation_foods","food_catalog_generation_servings","food_catalog_generation_names","food_catalog_generation_taxonomy","food_catalog_generation_markets","food_catalog_generation_verification","food_catalog_generation_redirects","food_catalog_generation_validation_reports","food_catalog_generation_validation_findings","food_catalog_generation_events"]),
    pointerVerified: verifiedRelations(["food_catalog_current_generation","food_catalog_governance_policy_pointer","release_schema_compatibility"]),
    mergeGraphVerified: mergeGraph.verified,
    governanceOwnerVerified: ownerBinding.verified && areProtectedOwnerStateRelationsVerified(relationsByName),
    consumerReferencesVerified: consumerReference.verified,
    securityVerified: true,
    serviceExecutionBindingVerified: serviceExecutionBinding.verified,
    migrationSchemaVerified: targetProfile.compatible === true,
    transientNeutralizationVerified: transientVerified && restoredIngestionExecution.verified,
  });
  const evaluation = evaluateRestoreAssertions({ profile: "FULL_DR", artifactValid: true, assertions: assertionEvidence });
  if (!evaluation.trusted || !evaluation.restoreVerified || evaluation.failures.length || evaluation.unknown.length) {
    throw new Error(`Integrated mandatory assertion evaluation failed: ${JSON.stringify(evaluation)}`);
  }

  const result = Object.freeze({
    format: "plaivra-food-catalog-integrated-restore-evidence",
    version: 1,
    headSha: options.expectedHead,
    profile: "FULL_DR",
    artifactSemanticRootSha256: source.manifest.semanticRootSha256,
    snapshotBoundarySha256: source.manifest.snapshotBoundary.sha256,
    restoredTargetIdentitySha256: targetIdentity,
    protectedSegmentsVerified: protectedVerified,
    liveTargetReadbackVerified: true,
    liveTargetSecurityVerified: true,
    replayLocalReferenceMappingCounts: replayReferences.mappingCounts,
    relationComparisonCount: relationResults.length,
    relationComparisons: relationResults,
    ownerBinding,
    mergeGraph,
    consumerReference,
    serviceExecutionBinding,
    restoredIngestionExecution,
    securityRlsAclIdentitySha256: targetSecurity.securityRlsAclIdentitySha256,
    search: Object.freeze({
      sameRestoredTargetVerified: true,
      liveTargetVerified: true,
      rebuildVerified: targetSearch.rebuildVerified === true,
      goldenSearchVerified: sourceSearch.goldenResultSha256 === targetSearch.goldenResultSha256,
      staleGenerationIsolationVerified: targetSearch.staleGenerationIsolationVerified === true,
      goldenResultSha256: targetSearch.goldenResultSha256,
    }),
    assertionEvaluation: evaluation,
    verificationInput: Object.freeze({
      profile: "FULL_DR",
      headSha: options.expectedHead,
      artifact: Object.freeze({
        valid: true,
        semanticRootSha256: source.manifest.semanticRootSha256,
        snapshotBoundarySha256: source.manifest.snapshotBoundary.sha256,
        capturedAt: source.manifest.capturedAt,
      }),
      target: Object.freeze({
        postgresVersion: postgresVersion(options.targetUrl),
        postgresMajor: 17,
        extensions: Object.freeze([...(targetProfileObserved.extensions ?? [])]),
        migrationLedgerIdentity: targetProfile.migrationLedgerIdentity,
        schemaFingerprintSha256: targetProfile.schemaFingerprintSha256,
        securityRlsAclIdentitySha256: targetSecurity.securityRlsAclIdentitySha256,
        restoredTargetIdentitySha256: targetIdentity,
        authRlsCompatibilityVerified: true,
        disposableTargetVerified: disposableTarget.loopback === true,
      }),
      assertions: Object.freeze({ evidence: assertionEvidence }),
      recoveryEvaluation: Object.freeze({
        evaluationTime: new Date().toISOString(),
        maxArtifactAgeMs: options.maxArtifactAgeMs,
      }),
    }),
  });
  return result;
}

async function main() {
  const options = parseIntegratedRestoreArgs(process.argv.slice(2));
  const result = await verifyIntegratedRestore(options);
  await writeFile(resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({
    format: result.format,
    headSha: result.headSha,
    artifactSemanticRootSha256: result.artifactSemanticRootSha256,
    restoredTargetIdentitySha256: result.restoredTargetIdentitySha256,
    protectedSegmentsVerified: result.protectedSegmentsVerified,
    restoredIngestionHistoryPreserved: result.restoredIngestionExecution.restoredIngestionHistoryPreserved,
    restoredIngestionLeaseNeutralized: result.restoredIngestionExecution.restoredIngestionLeaseNeutralized,
    restoredIngestionOperationalBlockVerified: result.restoredIngestionExecution.restoredIngestionOperationalBlockVerified,
    restoredIngestionAcquireRejected: result.restoredIngestionExecution.restoredIngestionAcquireRejected,
    restoredIngestionReplayRejected: result.restoredIngestionExecution.restoredIngestionReplayRejected,
    transient_neutralization: result.verificationInput.assertions.evidence.find((entry) => entry.id === "transient_neutralization")?.status,
    restoreVerified: result.assertionEvaluation.restoreVerified,
    trusted: result.assertionEvaluation.trusted,
  })}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
