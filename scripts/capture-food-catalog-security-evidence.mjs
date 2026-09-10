#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildFoodCatalogSecurityEvidenceSql() {
  return `WITH food_relations AS (
  SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity,coalesce(c.relacl::text,'') relacl
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public'
    AND c.relkind IN ('r','p')
    AND (c.relname LIKE 'food_%' OR c.relname IN ('market_scopes','market_scope_memberships','release_schema_compatibility'))
), policy_rows AS (
  SELECT tablename,policyname,permissive,roles::text,cmd,coalesce(qual,'') AS qual,coalesce(with_check,'') AS with_check
  FROM pg_policies
  WHERE schemaname='public'
    AND tablename IN (SELECT relname FROM food_relations)
), privilege_rows AS (
  SELECT table_name,grantee,privilege_type
  FROM information_schema.role_table_grants
  WHERE table_schema='public'
    AND table_name IN (SELECT relname FROM food_relations)
    AND grantee IN ('anon','authenticated','service_role','authenticator')
), critical AS (
 SELECT jsonb_build_object(
   'searchDocumentsRls',coalesce((SELECT relrowsecurity FROM food_relations WHERE relname='food_catalog_search_documents'),false),
   'searchDocumentsMutationIsolated',
      NOT has_table_privilege('anon','public.food_catalog_search_documents','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('authenticated','public.food_catalog_search_documents','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('service_role','public.food_catalog_search_documents','INSERT,UPDATE,DELETE'),
   'rebuildServiceOnly',
      has_function_privilege('service_role','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','EXECUTE')
      AND NOT has_function_privilege('authenticated','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','EXECUTE')
      AND NOT has_function_privilege('anon','public.rebuild_food_catalog_search_projection_v2(uuid,text,text)','EXECUTE'),
   'searchMemberBoundary',
      has_function_privilege('authenticated','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
      AND has_function_privilege('service_role','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE')
      AND NOT has_function_privilege('anon','public.search_food_catalog_v2(text,text,text,text,text,integer,text,text,text,jsonb)','EXECUTE'),
   'currentGenerationServiceMutationDenied',
      NOT has_table_privilege('service_role','public.food_catalog_current_generation','INSERT,UPDATE,DELETE,TRUNCATE'),
   'governanceDirectMemberMutationDenied',
      NOT has_table_privilege('authenticated','public.food_catalog_governance_principals','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('authenticated','public.food_catalog_governance_policy_pointer','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('anon','public.food_catalog_governance_principals','SELECT,INSERT,UPDATE,DELETE'),
   'personalOverrideDirectMutationDenied',
      NOT has_table_privilege('authenticated','public.food_personal_overrides','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('authenticated','public.food_personal_override_revisions','INSERT,UPDATE,DELETE')
      AND NOT has_table_privilege('authenticated','public.food_personal_override_operations','INSERT,UPDATE,DELETE')
 ) value
)
SELECT jsonb_build_object(
  'relations',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,'forceRls',relforcerowsecurity,'acl',relacl) ORDER BY relname),'[]'::jsonb) FROM food_relations),
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'permissive',permissive,'roles',roles,'cmd',cmd,'qual',qual,'withCheck',with_check) ORDER BY tablename,policyname),'[]'::jsonb) FROM policy_rows),
  'privileges',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',table_name,'grantee',grantee,'privilege',privilege_type) ORDER BY table_name,grantee,privilege_type),'[]'::jsonb) FROM privilege_rows),
  'critical',(SELECT value FROM critical)
)::text;`;
}

export function evaluateFoodCatalogSecurityEvidence(observed) {
  if (!observed || !Array.isArray(observed.relations) || observed.relations.length === 0) throw new Error("Food Catalog security relation evidence is missing.");
  if (!Array.isArray(observed.policies) || !Array.isArray(observed.privileges)) throw new Error("Food Catalog RLS/ACL evidence is incomplete.");
  const critical = observed.critical ?? {};
  const requiredCritical = [
    "searchDocumentsRls",
    "searchDocumentsMutationIsolated",
    "rebuildServiceOnly",
    "searchMemberBoundary",
    "currentGenerationServiceMutationDenied",
    "governanceDirectMemberMutationDenied",
    "personalOverrideDirectMutationDenied",
  ];
  for (const name of requiredCritical) {
    if (critical[name] !== true) throw new Error(`Food Catalog critical RLS/ACL boundary failed: ${name}.`);
  }
  return Object.freeze({
    securityRlsAclIdentitySha256: sha256(stableJson({
      relations: observed.relations,
      policies: observed.policies,
      privileges: observed.privileges,
    })),
    relationCount: observed.relations.length,
    policyCount: observed.policies.length,
    privilegeCount: observed.privileges.length,
    criticalBoundariesVerified: true,
  });
}

export function captureFoodCatalogSecurityEvidence(databaseUrl) {
  if (!databaseUrl) throw new Error("Disposable PostgreSQL URL is required for RLS/ACL evidence.");
  const result = spawnSync("psql", [databaseUrl,"-X","-A","-t","-v","ON_ERROR_STOP=1","-c",buildFoodCatalogSecurityEvidenceSql()], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`RLS/ACL evidence query failed: ${(result.stderr ?? "").trim()}`);
  const observed = JSON.parse((result.stdout ?? "").trim());
  const summary = evaluateFoodCatalogSecurityEvidence(observed);
  return Object.freeze({
    ...summary,
    observed,
    summary,
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const evidence = captureFoodCatalogSecurityEvidence(process.env.PLAN7_RESTORE_DATABASE_URL ?? process.env.PLAN7_DATABASE_URL);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
