#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildFoodCatalogSecurityEvidenceSql,
  evaluateFoodCatalogSecurityEvidence,
} from "./capture-food-catalog-security-evidence.mjs";
import { buildFoodCatalogSchemaIdentitySql } from "./schema-identity.mjs";

const SHA256 = /^[0-9a-f]{64}$/;
const PROBE_TABLE = "public.food_plan7_schema_identity_probe";
const TRIGGER_HELPER = "public.plan7_schema_identity_probe_trigger_fn";
const CAPTURED_FUNCTION = "public.food_plan7_schema_identity_probe_fn";
const USER_FOOD_TABLE = "public.user_food_items";
const PRIVATE_CAPTURED_FUNCTION = "private.food_catalog_plan7_schema_identity_probe_fn";
const PRIVATE_UNRELATED_FUNCTION = "private.plan7_schema_identity_unrelated_probe_fn";

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

function runFocusedSchemaSecurityContractTests() {
  const result = spawnSync(process.execPath, [
    "--test",
    "scripts/schema-identity.test.mjs",
    "scripts/capture-food-catalog-security-evidence.test.mjs",
  ], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error("Focused schema identity/security evidence contract tests failed.");
}

function fingerprintSql() {
  return `WITH ${buildFoodCatalogSchemaIdentitySql()}
SELECT encode(digest(convert_to(schema_identity.identity_input,'UTF8'),'sha256'),'hex')
FROM schema_identity;`;
}

function fingerprint(databaseUrl) {
  const value = psql(databaseUrl, fingerprintSql(), { tuples: true }).split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
  if (!SHA256.test(value)) throw new Error(`Schema identity fingerprint is not a lowercase SHA-256 digest: ${value || "<empty>"}`);
  return value;
}

function fingerprintDuringRollbackOnlyMutation(databaseUrl, mutationSql) {
  const value = psql(databaseUrl, `BEGIN;
${mutationSql}
${fingerprintSql()}
ROLLBACK;`, { tuples: true }).split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
  if (!SHA256.test(value)) throw new Error(`Rollback-only schema identity fingerprint is not a lowercase SHA-256 digest: ${value || "<empty>"}`);
  return value;
}

function changed(before, after, label) {
  if (before === after) throw new Error(`Schema identity did not change after ${label}.`);
  return true;
}

function unchanged(before, after, label) {
  if (before !== after) throw new Error(`Schema identity unexpectedly changed after ${label}.`);
  return true;
}

function completeSecurityObserved() {
  return {
    relations: [{ name: "user_food_items", rls: true, forceRls: false, acl: "" }],
    policies: [{ table: "user_food_items", name: "user_food_items_own_all" }],
    privileges: [{ table: "user_food_items", grantee: "authenticated", privilege: "SELECT" }],
    critical: {
      searchDocumentsRls: true,
      searchDocumentsMutationIsolated: true,
      rebuildServiceOnly: true,
      searchMemberBoundary: true,
      currentGenerationServiceMutationDenied: true,
      governanceDirectMemberMutationDenied: true,
      personalOverrideDirectMutationDenied: true,
    },
    behavioral: {
      ownerScopedReadVerified: true,
      wrongOwnerReadDenied: true,
      ownMutationAllowed: true,
      wrongOwnerMutationDenied: true,
      transitionalOwnerScopedReadVerified: true,
      transitionalWrongOwnerReadDenied: true,
      transitionalOwnMutationAllowed: true,
      transitionalWrongOwnerMutationDenied: true,
      myFoodsOwnerScopedReadVerified: true,
      myFoodsWrongOwnerReadDenied: true,
      myFoodsOwnerInsertUpdateDeleteVerified: true,
      myFoodsWrongOwnerMutationDenied: true,
      personalizedSearchIsolationVerified: true,
      authenticatedServiceOnlyDenied: true,
      anonUnauthorizedVerified: true,
      serviceOutboxAuthorizedVerified: true,
    },
    schemaIdentityAdversarial: {
      userFoodItemsDriftDetected: true,
      privateFoodCatalogAclDriftDetected: true,
      searchNormalizationHelperDriftDetected: true,
      unrelatedPrivateFunctionExcluded: true,
      rollbackVerified: true,
    },
  };
}

function verifySecurityCertificationContract() {
  const metadataSql = buildFoodCatalogSecurityEvidenceSql();
  if (!metadataSql.includes("'user_food_items'")) {
    throw new Error("Food Catalog security metadata scope does not include public.user_food_items.");
  }

  for (const field of [
    "myFoodsOwnerScopedReadVerified",
    "myFoodsWrongOwnerReadDenied",
    "myFoodsOwnerInsertUpdateDeleteVerified",
    "myFoodsWrongOwnerMutationDenied",
  ]) {
    const observed = completeSecurityObserved();
    observed.behavioral[field] = false;
    let rejected = false;
    try {
      evaluateFoodCatalogSecurityEvidence(observed);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error(`Food Catalog security evaluator accepted false My Foods behavioral evidence: ${field}.`);
  }
  return true;
}

function booleanScalar(databaseUrl, sql) {
  return psql(databaseUrl, sql, { tuples: true }).split(/\r?\n/u).filter(Boolean).at(-1) === "t";
}

function cleanupSynthetic(databaseUrl, { dropUserFoodItems, dropPrivateSchema }) {
  psql(databaseUrl, `
DROP TABLE IF EXISTS ${PROBE_TABLE} CASCADE;
DROP FUNCTION IF EXISTS ${TRIGGER_HELPER}() CASCADE;
DROP FUNCTION IF EXISTS ${CAPTURED_FUNCTION}() CASCADE;
DROP FUNCTION IF EXISTS ${PRIVATE_CAPTURED_FUNCTION}() CASCADE;
DROP FUNCTION IF EXISTS ${PRIVATE_UNRELATED_FUNCTION}() CASCADE;
${dropUserFoodItems ? `DROP TABLE IF EXISTS ${USER_FOOD_TABLE} CASCADE;` : ""}
${dropPrivateSchema ? "DROP SCHEMA IF EXISTS private;" : ""}
`);
}

export function verifyFoodCatalogSchemaIdentitySensitivity(databaseUrl) {
  if (!databaseUrl) throw new Error("PLAN7_DATABASE_URL is required for disposable schema identity sensitivity proof.");

  const securityCertificationContractVerified = verifySecurityCertificationContract();
  const searchNormalizationHelperExists = booleanScalar(
    databaseUrl,
    "select to_regprocedure('private.normalize_nutrition_food_search_text(text)') is not null;",
  );
  if (!searchNormalizationHelperExists) {
    throw new Error("Real private.normalize_nutrition_food_search_text(text) is required for schema identity sensitivity proof.");
  }
  const userFoodItemsPreexisting = booleanScalar(databaseUrl, "select to_regclass('public.user_food_items') is not null;");
  const privateSchemaPreexisting = booleanScalar(databaseUrl, "select exists(select 1 from pg_namespace where nspname='private');");
  if (!privateSchemaPreexisting) psql(databaseUrl, "CREATE SCHEMA private;");

  cleanupSynthetic(databaseUrl, { dropUserFoodItems: false, dropPrivateSchema: false });
  try {
    psql(databaseUrl, `
CREATE TABLE ${PROBE_TABLE}(
  id integer PRIMARY KEY,
  owner_id uuid NOT NULL,
  value text NOT NULL DEFAULT 'base'
);
CREATE FUNCTION ${PRIVATE_CAPTURED_FUNCTION}() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;
CREATE FUNCTION ${PRIVATE_UNRELATED_FUNCTION}() RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 1 $$;
${userFoodItemsPreexisting ? "" : `CREATE TABLE ${USER_FOOD_TABLE}(
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  food_name text NOT NULL,
  category text NOT NULL DEFAULT 'Custom'
);
ALTER TABLE ${USER_FOOD_TABLE} ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_food_items_own_all ON ${USER_FOOD_TABLE} FOR ALL TO public USING (true) WITH CHECK (true);`}
`);

    const baselineSha256 = fingerprint(databaseUrl);

    const userFoodItemsSha256 = fingerprintDuringRollbackOnlyMutation(databaseUrl, `ALTER TABLE ${USER_FOOD_TABLE} ALTER COLUMN category SET DEFAULT 'Plan7 schema identity drift';`);
    const userFoodItemsDriftDetected = changed(baselineSha256, userFoodItemsSha256, "public.user_food_items default mutation");
    const userFoodRollbackSha256 = fingerprint(databaseUrl);
    const userFoodRollbackVerified = unchanged(baselineSha256, userFoodRollbackSha256, "public.user_food_items rollback");

    const privateFoodCatalogAclSha256 = fingerprintDuringRollbackOnlyMutation(databaseUrl, `REVOKE EXECUTE ON FUNCTION ${PRIVATE_CAPTURED_FUNCTION}() FROM PUBLIC;`);
    const privateFoodCatalogAclDriftDetected = changed(baselineSha256, privateFoodCatalogAclSha256, "private.food_catalog_* function ACL mutation");
    const privateFoodRollbackSha256 = fingerprint(databaseUrl);
    const privateFoodRollbackVerified = unchanged(baselineSha256, privateFoodRollbackSha256, "private Food Catalog helper rollback");

    const searchNormalizationHelperSha256 = fingerprintDuringRollbackOnlyMutation(databaseUrl, `CREATE OR REPLACE FUNCTION private.normalize_nutrition_food_search_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $function$
  SELECT 'plan7-schema-identity-drift'::text
$function$;`);
    const searchNormalizationHelperDriftDetected = changed(
      baselineSha256,
      searchNormalizationHelperSha256,
      "private.normalize_nutrition_food_search_text definition mutation",
    );
    const searchNormalizationHelperRollbackSha256 = fingerprint(databaseUrl);
    const searchNormalizationHelperRollbackVerified = unchanged(
      baselineSha256,
      searchNormalizationHelperRollbackSha256,
      "Search normalization helper rollback",
    );

    const unrelatedPrivateFunctionSha256 = fingerprintDuringRollbackOnlyMutation(databaseUrl, `REVOKE EXECUTE ON FUNCTION ${PRIVATE_UNRELATED_FUNCTION}() FROM PUBLIC;`);
    const unrelatedPrivateFunctionExcluded = unchanged(baselineSha256, unrelatedPrivateFunctionSha256, "unrelated private function ACL mutation");
    const unrelatedPrivateRollbackSha256 = fingerprint(databaseUrl);
    const unrelatedPrivateRollbackVerified = unchanged(baselineSha256, unrelatedPrivateRollbackSha256, "unrelated private helper rollback");

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
      securityCertificationContractVerified,
      userFoodItemsDriftDetected,
      privateFoodCatalogAclDriftDetected,
      searchNormalizationHelperDriftDetected,
      unrelatedPrivateFunctionExcluded,
      rollbackVerified:
        userFoodRollbackVerified &&
        privateFoodRollbackVerified &&
        searchNormalizationHelperRollbackVerified &&
        unrelatedPrivateRollbackVerified,
      constraintChanged,
      policyChanged,
      triggerChanged,
      functionDefinitionChanged,
      functionAclChanged,
      hashes: Object.freeze({
        baselineSha256,
        userFoodItemsSha256,
        privateFoodCatalogAclSha256,
        searchNormalizationHelperSha256,
        unrelatedPrivateFunctionSha256,
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
    cleanupSynthetic(databaseUrl, {
      dropUserFoodItems: !userFoodItemsPreexisting,
      dropPrivateSchema: !privateSchemaPreexisting,
    });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    runFocusedSchemaSecurityContractTests();
    const evidence = verifyFoodCatalogSchemaIdentitySensitivity(process.env.PLAN7_DATABASE_URL);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
