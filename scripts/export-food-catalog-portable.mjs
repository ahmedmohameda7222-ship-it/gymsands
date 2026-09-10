#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { spawn } from "node:child_process";

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;
const SHA40 = /^[0-9a-f]{40}$/;
const PROFILE = new Set(["CORE_PORTABLE", "FULL_DR"]);
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");

function assertIdentifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) {
    throw new Error(`Unsafe PostgreSQL identifier: ${String(value)}`);
  }
  return value;
}

function qid(value) {
  return `"${assertIdentifier(value)}"`;
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function relationProgram(spec) {
  const relation = assertIdentifier(spec.relation);
  const segment = assertIdentifier(spec.segment ?? relation);
  const stableKey = spec.stableKey?.map(assertIdentifier) ?? [];
  if (stableKey.length === 0) throw new Error(`Stable key is required for ${relation}.`);
  const orderBy = stableKey.map((column) => `${qid(column)}::text COLLATE "C"`).join(", ");
  const relationLiteral = sqlLiteral(relation);
  const segmentLiteral = sqlLiteral(segment);

  return `
DO $plan7$
BEGIN
  IF to_regclass('public.${relation}') IS NULL THEN
    RAISE EXCEPTION 'Plan7 required relation public.${relation} is missing';
  END IF;
END
$plan7$;
SELECT '__PLAN7_SEGMENT_BEGIN__${segment}';
SELECT format(
  'COPY (SELECT encode(convert_to(json_build_object(''segment'', %L, ''values'', json_build_object(%s))::text, ''UTF8''), ''hex'') FROM public.%I ORDER BY ${orderBy}) TO STDOUT',
  ${segmentLiteral},
  string_agg(
    format('%L, json_build_object(''pgType'', %L, ''text'', %I::text)', a.attname, format_type(a.atttypid, a.atttypmod), a.attname),
    ', ' ORDER BY a.attnum
  ),
  ${relationLiteral}
)
FROM pg_attribute a
WHERE a.attrelid = to_regclass('public.${relation}')
  AND a.attnum > 0
  AND NOT a.attisdropped
\\gexec
SELECT '__PLAN7_SEGMENT_END__${segment}';`;
}

export function buildSingleSnapshotPsqlProgram({ profile, relations }) {
  if (!PROFILE.has(profile)) throw new Error(`Unsupported Plan7 export profile: ${profile}`);
  if (!Array.isArray(relations) || relations.length === 0) throw new Error("At least one relation is required.");
  const exportable = relations.filter((spec) => spec.loadMode !== "DERIVED_REBUILD");
  exportable.forEach((spec) => {
    assertIdentifier(spec.relation);
    assertIdentifier(spec.segment ?? spec.relation);
    if (!Array.isArray(spec.stableKey) || spec.stableKey.length === 0) throw new Error(`Stable key is required for ${spec.relation}.`);
    spec.stableKey.forEach(assertIdentifier);
  });

  return `\\set ON_ERROR_STOP on
\\pset tuples_only on
\\pset format unaligned
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL TIME ZONE 'UTC';
WITH migration AS (
  SELECT count(*)::text AS migration_count,
         coalesce(max(version)::text, '') AS latest_migration,
         coalesce(string_agg(version::text, ',' ORDER BY version), '') AS migration_ledger_input
  FROM supabase_migrations.schema_migrations
), schema_identity AS (
  SELECT coalesce(string_agg(
    n.nspname || '.' || c.relname || ':' || a.attnum::text || ':' || a.attname || ':' || format_type(a.atttypid,a.atttypmod) || ':' || a.attnotnull::text,
    E'\\n' ORDER BY n.nspname,c.relname,a.attnum
  ), '') AS identity_input
  FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='public'
    AND (c.relname LIKE 'food_%' OR c.relname IN ('market_scopes','market_scope_memberships','release_schema_compatibility'))
    AND c.relkind IN ('r','p')
)
SELECT '__PLAN7_META__' || json_build_object(
  'environment', current_database(),
  'postgresSnapshot', pg_export_snapshot(),
  'capturedAt', to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
  'migrationCount', migration.migration_count,
  'latestMigration', migration.latest_migration,
  'migrationLedgerIdentityInput', migration.migration_ledger_input,
  'schemaIdentityInput', schema_identity.identity_input,
  'currentGenerationId', (SELECT current_generation_id::text FROM public.food_catalog_current_generation WHERE singleton_key IS TRUE),
  'pointerRevision', coalesce((SELECT pointer_revision::text FROM public.food_catalog_current_generation WHERE singleton_key IS TRUE), '0'),
  'compatibilityVersion', coalesce((SELECT version::text FROM public.release_schema_compatibility WHERE singleton IS TRUE), ''),
  'compatibilityMarker', coalesce((SELECT migration_version::text FROM public.release_schema_compatibility WHERE singleton IS TRUE), '')
)::text
FROM migration, schema_identity;
${exportable.map(relationProgram).join("\n")}
COMMIT;
`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function compareCodeUnits(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function snapshotBoundarySha(boundary) {
  return sha256(JSON.stringify({
    environment: boundary.environment,
    postgresSnapshot: boundary.postgresSnapshot,
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
    sourceRepositoryCommit: manifest.sourceRepositoryCommit,
    sourceSchemaFingerprintSha256: manifest.sourceSchemaFingerprintSha256,
    snapshotBoundary: {
      environment: manifest.snapshotBoundary.environment,
      postgresSnapshot: manifest.snapshotBoundary.postgresSnapshot,
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
    })).sort((left, right) => compareCodeUnits(left.name, right.name)),
  }));
}

async function loadRuntimeCanonicalizer() {
  const url = pathToFileURL(resolve("lib/food-catalog/portability/canonicalize.ts")).href;
  return import(url);
}

async function loadDefaultRules(profile) {
  const url = pathToFileURL(resolve("lib/food-catalog/portability/relation-registry.ts")).href;
  const { FOOD_CATALOG_PORTABLE_RELATIONS_V1 } = await import(url);
  return FOOD_CATALOG_PORTABLE_RELATIONS_V1.filter(
    (entry) => entry.requiredProfile === "CORE_PORTABLE" || profile === "FULL_DR",
  );
}

async function writeChunk(stream, chunk) {
  if (!stream.write(chunk, "utf8")) await once(stream, "drain");
}

async function closeStream(stream) {
  stream.end();
  await once(stream, "close");
}

export async function runAuthoritativeExport({ databaseUrl, outputDir, profile, sourceRepositoryCommit, rules }) {
  if (!databaseUrl) throw new Error("PLAN7_DATABASE_URL is required.");
  if (!PROFILE.has(profile)) throw new Error(`Unsupported Plan7 export profile: ${profile}`);
  if (!SHA40.test(sourceRepositoryCommit)) throw new Error("An exact 40-character source repository commit is required.");
  if (rules.some((rule) => rule.protected)) {
    throw new Error("FULL_DR protected relations require the Plan7 protected-segment key-provider path; plaintext fallback is forbidden.");
  }

  const { canonicalizeLosslessRow, canonicalizePostgresScalar } = await loadRuntimeCanonicalizer();
  const target = resolve(outputDir);
  const staging = `${target}.partial-${process.pid}`;
  await rm(staging, { recursive: true, force: true });
  await mkdir(resolve(staging, "segments"), { recursive: true });

  const sql = buildSingleSnapshotPsqlProgram({ profile, relations: rules });
  const child = spawn("psql", [databaseUrl, "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: process.env,
  });
  child.stdin.end(sql, "utf8");
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    if (stderr.length < 1_000_000) stderr += chunk;
  });

  let meta = null;
  let active = null;
  const completed = new Map();
  const rulesBySegment = new Map(rules.map((rule) => [rule.segment ?? rule.relation, rule]));
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });

  try {
    for await (const line of lines) {
      if (line.startsWith("__PLAN7_META__")) {
        if (meta) throw new Error("Duplicate Plan7 snapshot metadata record.");
        meta = JSON.parse(line.slice("__PLAN7_META__".length));
        continue;
      }
      if (line.startsWith("__PLAN7_SEGMENT_BEGIN__")) {
        if (active) throw new Error(`Nested Plan7 segment stream at ${line}.`);
        const name = line.slice("__PLAN7_SEGMENT_BEGIN__".length);
        const rule = rulesBySegment.get(name);
        if (!rule) throw new Error(`Unexpected Plan7 segment ${name}.`);
        const path = resolve(staging, "segments", `${name}.ndjson`);
        active = {
          name,
          rule,
          stream: createWriteStream(path, { flags: "wx" }),
          hash: createHash("sha256"),
          rowCount: 0,
          previousKey: undefined,
        };
        continue;
      }
      if (line.startsWith("__PLAN7_SEGMENT_END__")) {
        const name = line.slice("__PLAN7_SEGMENT_END__".length);
        if (!active || active.name !== name) throw new Error(`Unbalanced Plan7 segment end ${name}.`);
        await closeStream(active.stream);
        completed.set(name, {
          rowCount: active.rowCount,
          plaintextSemanticSha256: active.hash.digest("hex"),
        });
        active = null;
        continue;
      }
      if (!active || line.length === 0) continue;
      if (!/^[0-9a-f]+$/.test(line) || line.length % 2 !== 0) {
        throw new Error(`Malformed hexadecimal COPY transport for ${active.name}.`);
      }
      const envelope = JSON.parse(Buffer.from(line, "hex").toString("utf8"));
      if (envelope.segment !== active.name || !envelope.values || typeof envelope.values !== "object") {
        throw new Error(`Malformed row envelope for ${active.name}.`);
      }
      const key = JSON.stringify(active.rule.stableKey.map((column) => {
        const scalar = envelope.values[column];
        if (!scalar || scalar.text === null) throw new Error(`Missing/non-null stable key ${column} in ${active.name}.`);
        return canonicalizePostgresScalar(scalar);
      }));
      if (active.previousKey !== undefined) {
        const comparison = compareCodeUnits(active.previousKey, key);
        if (comparison === 0) throw new Error(`Duplicate stable key ${key} in ${active.name}.`);
        if (comparison > 0) throw new Error(`Non-monotonic stable key ${key} in ${active.name}.`);
      }
      active.previousKey = key;
      const canonical = `${canonicalizeLosslessRow(envelope.values)}\n`;
      active.hash.update(canonical, "utf8");
      await writeChunk(active.stream, canonical);
      active.rowCount += 1;
    }
    const [exitCode] = await once(child, "close");
    if (exitCode !== 0) throw new Error(`psql authoritative snapshot export failed with status ${exitCode}: ${stderr.trim()}`);
    if (active) throw new Error(`Plan7 segment ${active.name} did not terminate.`);
    if (!meta) throw new Error("Plan7 snapshot metadata was not emitted by PostgreSQL.");

    const migrationLedgerIdentity = sha256(meta.migrationLedgerIdentityInput ?? "");
    const sourceSchemaFingerprintSha256 = sha256(meta.schemaIdentityInput ?? "");
    const boundary = {
      environment: meta.environment,
      postgresSnapshot: meta.postgresSnapshot,
      capturedAt: meta.capturedAt,
      migrationCount: meta.migrationCount,
      latestMigration: meta.latestMigration,
      migrationLedgerIdentity,
      currentGenerationId: meta.currentGenerationId ?? null,
      pointerRevision: meta.pointerRevision,
      compatibilityVersion: meta.compatibilityVersion,
      compatibilityMarker: meta.compatibilityMarker,
      sha256: "",
    };
    boundary.sha256 = snapshotBoundarySha(boundary);

    const segments = rules.map((rule) => {
      const result = rule.loadMode === "DERIVED_REBUILD"
        ? { rowCount: 0, plaintextSemanticSha256: EMPTY_SHA256 }
        : completed.get(rule.segment ?? rule.relation);
      if (!result) throw new Error(`Required Plan7 segment ${rule.segment ?? rule.relation} was not exported.`);
      return {
        name: rule.segment ?? rule.relation,
        relation: rule.relation,
        classification: rule.classification,
        loadMode: rule.loadMode,
        stableKey: [...rule.stableKey],
        rowCount: result.rowCount,
        plaintextSemanticSha256: result.plaintextSemanticSha256,
        snapshotBoundarySha256: boundary.sha256,
        required: true,
        protected: Boolean(rule.protected),
      };
    });

    const manifest = {
      format: "plaivra-food-catalog-portable-export",
      formatVersion: 1,
      canonicalizationVersion: 1,
      profile,
      sourceRepositoryCommit,
      sourceSchemaFingerprintSha256,
      capturedAt: meta.capturedAt,
      snapshotBoundary: boundary,
      segments,
      semanticRootSha256: "",
      certification: { artifactValid: false, restoreVerified: false, drReady: false },
    };
    manifest.semanticRootSha256 = semanticRoot(manifest);
    await writeFile(resolve(staging, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await rm(target, { recursive: true, force: true });
    await rename(staging, target);
    return manifest;
  } catch (error) {
    child.kill("SIGTERM");
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function parseArgs(argv) {
  const options = { profile: "CORE_PORTABLE", outputDir: "quality-reports/food-catalog-portable", sourceRepositoryCommit: process.env.GITHUB_SHA ?? "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--profile") options.profile = argv[++index];
    else if (value === "--output-dir") options.outputDir = argv[++index];
    else if (value === "--source-commit") options.sourceRepositoryCommit = argv[++index];
    else if (value === "--relations-json") options.relationsJson = argv[++index];
    else throw new Error(`Unknown argument ${value}.`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let rules;
  if (options.relationsJson) {
    rules = JSON.parse(await readFile(resolve(options.relationsJson), "utf8"));
  } else {
    rules = await loadDefaultRules(options.profile);
  }
  const manifest = await runAuthoritativeExport({
    databaseUrl: process.env.PLAN7_DATABASE_URL,
    outputDir: options.outputDir,
    profile: options.profile,
    sourceRepositoryCommit: options.sourceRepositoryCommit,
    rules,
  });
  process.stdout.write(`Plan7 ${manifest.profile} export complete: ${basename(resolve(options.outputDir))} ${manifest.semanticRootSha256}\n`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
