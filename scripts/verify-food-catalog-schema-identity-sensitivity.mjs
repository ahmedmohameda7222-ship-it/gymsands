#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { buildFoodCatalogSchemaIdentitySql } from "./schema-identity.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const PROBE_TABLE = "public.food_plan7_schema_identity_probe";
const TRIGGER_HELPER = "public.plan7_schema_identity_probe_trigger_fn";
const CAPTURED_FUNCTION = "public.food_plan7_schema_identity_probe_fn";

function psql(databaseUrl, sql, { tuples = false } = {}) {
  const args = [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1"];
  if (tuples) args.push("-q", "-A", "-t");
  args.push("-c", sql);
  const result = spawnSync("psql", args, {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Schema identity sensitivity SQL failed: ${(result.stderr ?? "").trim()}`);
  }
  return (result.stdout ?? "").trim();
}

function fingerprint(databaseUrl) {
  const sql = `WITH ${buildFoodCatalogSchemaIdentitySql()}
SELECT encode(digest(convert_to(schema_identity.identity_input,'UTF8'),'sha256'),'hex')
FROM schema_identity;`;
  const value = psql(databaseUrl, sql, { tuples: true }).split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
  if (!SHA256.test(value)) throw new Error(`Schema identity fingerprint is not a lowercase SHA-256 digest: ${value || "<empty>"}`);
  return value;
}

function changed(before, after, label) {
  if (before === after) throw new Error(`Schema identity did not change after ${label}.`);
  return true;
}

function cleanup(databaseUrl) {
  psql(databaseUrl, `
DROP TABLE IF EXISTS ${PROBE_TABLE} CASCADE;
DROP FUNCTION IF EXISTS ${TRIGGER_HELPER}() CASCADE;
DROP FUNCTION IF EXISTS ${CAPTURED_FUNCTION}() CASCADE;
`);
}

export function verifyFoodCatalogSchemaIdentitySensitivity(databaseUrl) {
  if (!databaseUrl) throw new Error("PLAN7_DATABASE_URL is required for disposable schema identity sensitivity proof.");

  cleanup(databaseUrl);
  try {
    psql(databaseUrl, `
CREATE TABLE ${PROBE_TABLE}(
  id integer PRIMARY KEY,
  owner_id uuid NOT NULL,
  value text NOT NULL DEFAULT 'base'
);
`);

    const baselineSha256 = fingerprint(databaseUrl);

    psql(databaseUrl, `ALTER TABLE ${PROBE_TABLE} ADD CONSTRAINT food_plan7_schema_identity_probe_value_check CHECK (char_length(value) > 0);`);
    const constraintSha256 = fingerprint(databaseUrl);
    const constraintChanged = changed(baselineSha256, constraintSha256, "constraint mutation");

    psql(databaseUrl, `ALTER TABLE ${PROBE_TABLE} ENABLE ROW LEVEL SECURITY;`);
    const prePolicySha256 = fingerprint(databaseUrl);
    psql(databaseUrl, `CREATE POLICY food_plan7_schema_identity_probe_select ON ${PROBE_TABLE} FOR SELECT TO public USING (true);`);
    const policySha256 = fingerprint(databaseUrl);
    const policyChanged = changed(prePolicySha256, policySha256, "RLS policy mutation");

    psql(databaseUrl, `
CREATE FUNCTION ${TRIGGER_HELPER}() RETURNS trigger
LANGUAGE plpgsql
AS $$ BEGIN NEW.value := NEW.value; RETURN NEW; END $$;
`);
    const preTriggerSha256 = fingerprint(databaseUrl);
    psql(databaseUrl, `CREATE TRIGGER food_plan7_schema_identity_probe_before_write BEFORE INSERT OR UPDATE ON ${PROBE_TABLE} FOR EACH ROW EXECUTE FUNCTION ${TRIGGER_HELPER}();`);
    const triggerSha256 = fingerprint(databaseUrl);
    const triggerChanged = changed(preTriggerSha256, triggerSha256, "non-internal trigger mutation");

    psql(databaseUrl, `CREATE FUNCTION ${CAPTURED_FUNCTION}() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;`);
    const preFunctionDefinitionSha256 = fingerprint(databaseUrl);
    psql(databaseUrl, `CREATE OR REPLACE FUNCTION ${CAPTURED_FUNCTION}() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;`);
    const functionDefinitionSha256 = fingerprint(databaseUrl);
    const functionDefinitionChanged = changed(preFunctionDefinitionSha256, functionDefinitionSha256, "Food Catalog function definition mutation");

    const preFunctionAclSha256 = functionDefinitionSha256;
    psql(databaseUrl, `REVOKE EXECUTE ON FUNCTION ${CAPTURED_FUNCTION}() FROM PUBLIC;`);
    const functionAclSha256 = fingerprint(databaseUrl);
    const functionAclChanged = changed(preFunctionAclSha256, functionAclSha256, "Food Catalog function ACL mutation");

    return Object.freeze({
      verified: true,
      constraintChanged,
      policyChanged,
      triggerChanged,
      functionDefinitionChanged,
      functionAclChanged,
      hashes: Object.freeze({
        baselineSha256,
        constraintSha256,
        prePolicySha256,
        policySha256,
        preTriggerSha256,
        triggerSha256,
        preFunctionDefinitionSha256,
        functionDefinitionSha256,
        functionAclSha256,
      }),
    });
  } finally {
    cleanup(databaseUrl);
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const evidence = verifyFoodCatalogSchemaIdentitySensitivity(process.env.PLAN7_DATABASE_URL);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
