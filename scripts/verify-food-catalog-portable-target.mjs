#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const REQUIRED_EXTENSIONS = ["pgcrypto", "pg_trgm", "uuid-ossp"];
const REQUIRED_ROLES = ["anon", "authenticated", "service_role", "authenticator"];
const SHA256 = /^[0-9a-f]{64}$/;

export function buildPortableTargetProfileSql() {
  return `WITH migration AS (
  SELECT count(*)::text AS migration_count,
         coalesce(max(version)::text, '') AS latest_migration,
         coalesce(string_agg(version::text, ',' ORDER BY version), '') AS ledger_input
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
SELECT json_build_object(
  'serverVersionNum', current_setting('server_version_num'),
  'extensions', (SELECT coalesce(json_agg(extname ORDER BY extname), '[]'::json) FROM pg_extension WHERE extname IN ('pgcrypto','pg_trgm','uuid-ossp')),
  'roles', (SELECT coalesce(json_agg(rolname ORDER BY rolname), '[]'::json) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','authenticator')),
  'authUsersPresent', to_regclass('auth.users') IS NOT NULL,
  'migrationCount', migration.migration_count,
  'latestMigration', migration.latest_migration,
  'migrationLedgerIdentity', encode(digest(convert_to(migration.ledger_input,'UTF8'),'sha256'),'hex'),
  'schemaFingerprintSha256', encode(digest(convert_to(schema_identity.identity_input,'UTF8'),'sha256'),'hex')
)::text
FROM migration, schema_identity;`;
}

function assertString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is missing from target profile evidence.`);
  return value;
}

export function evaluatePortableTargetProfile(observed, expected) {
  const version = Number.parseInt(assertString(observed?.serverVersionNum, "serverVersionNum"), 10);
  if (!Number.isSafeInteger(version) || Math.floor(version / 10000) !== 17) {
    throw new Error(`Plan 7 restore requires PostgreSQL 17.x; observed ${observed?.serverVersionNum ?? "unknown"}.`);
  }
  const extensions = new Set(Array.isArray(observed.extensions) ? observed.extensions : []);
  for (const extension of REQUIRED_EXTENSIONS) {
    if (!extensions.has(extension)) throw new Error(`Missing required PostgreSQL extension ${extension}.`);
  }
  const roles = new Set(Array.isArray(observed.roles) ? observed.roles : []);
  for (const role of REQUIRED_ROLES) {
    if (!roles.has(role)) throw new Error(`Missing required auth/RLS compatibility role ${role}.`);
  }
  if (observed.authUsersPresent !== true) throw new Error("Target auth.users compatibility authority is missing.");

  for (const field of ["migrationCount", "latestMigration", "migrationLedgerIdentity", "schemaFingerprintSha256"]) {
    const actual = assertString(observed[field], field);
    const required = assertString(expected[field], `expected ${field}`);
    if (field.endsWith("Identity") || field.endsWith("Sha256")) {
      if (!SHA256.test(actual) || !SHA256.test(required)) throw new Error(`${field} must be a lowercase SHA-256 digest.`);
    }
    if (actual !== required) throw new Error(`Target ${field} does not match artifact/Git authority.`);
  }

  return Object.freeze({
    compatible: true,
    postgresMajor: 17,
    serverVersionNum: String(observed.serverVersionNum),
    migrationCount: String(observed.migrationCount),
    latestMigration: String(observed.latestMigration),
    migrationLedgerIdentity: String(observed.migrationLedgerIdentity),
    schemaFingerprintSha256: String(observed.schemaFingerprintSha256),
  });
}

export function queryPortableTargetProfile(databaseUrl) {
  if (!databaseUrl) throw new Error("Disposable target database URL is required.");
  const result = spawnSync("psql", [databaseUrl, "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", buildPortableTargetProfileSql()], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Target profile query failed: ${(result.stderr ?? "").trim()}`);
  const text = (result.stdout ?? "").trim();
  if (!text) throw new Error("Target profile query returned no evidence.");
  return JSON.parse(text);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const databaseUrl = process.env.PLAN7_RESTORE_DATABASE_URL;
  try {
    const observed = queryPortableTargetProfile(databaseUrl);
    process.stdout.write(`${JSON.stringify(observed)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
