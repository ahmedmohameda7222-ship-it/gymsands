#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const OWNER_ID = "71000000-0000-4000-8000-000000000001";
const OTHER_OWNER_ID = "72000000-0000-4000-8000-000000000001";
const CURRENT_FOOD_ID = "71000000-0000-4000-8000-000000000101";
const STALE_FOOD_ID = "71000000-0000-4000-8000-000000000103";
const TEMP_FAVORITE_ID = "71000000-0000-4000-8000-000000000f01";
const CURRENT_GENERATION_ID = "71000000-0000-4000-8000-000000000901";
const TEMP_SERVICE_PRINCIPAL_ID = "73000000-0000-4000-8000-000000000d10";
const TEMP_SERVICE_CAPABILITY_ID = "73000000-0000-4000-8000-000000000d11";
const TEMP_SERVICE_OPERATION_ID = "73000000-0000-4000-8000-000000000d12";
const TEMP_SERVICE_EVENT_ID = "73000000-0000-4000-8000-000000000d13";
const TEMP_SERVICE_IDENTITY = "plan7-security-service";

function stableJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function psql(databaseUrl, sql) {
  const result = spawnSync("psql", [databaseUrl,"-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-c",sql], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`RLS/ACL behavioral evidence query failed: ${(result.stderr ?? "").trim()}`);
  return (result.stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
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

function booleanEvidence(databaseUrl, sql, label) {
  const value = psql(databaseUrl, sql);
  if (value !== "t") throw new Error(`Food Catalog behavioral security boundary failed: ${label}.`);
  return true;
}

export function captureFoodCatalogBehavioralSecurityEvidence(databaseUrl) {
  const ownerScopedReadVerified = booleanEvidence(databaseUrl, `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','${OWNER_ID}',true);
select exists(select 1 from public.food_favorites where user_id='${OWNER_ID}'::uuid and food_id='${CURRENT_FOOD_ID}'::uuid);
rollback;`, "ownerScopedReadVerified");

  const wrongOwnerReadDenied = booleanEvidence(databaseUrl, `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','${OTHER_OWNER_ID}',true);
select not exists(select 1 from public.food_favorites where user_id='${OWNER_ID}'::uuid and food_id='${CURRENT_FOOD_ID}'::uuid);
rollback;`, "wrongOwnerReadDenied");

  const ownMutationAllowed = booleanEvidence(databaseUrl, `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','${OWNER_ID}',true);
insert into public.food_favorites(id,user_id,food_id,created_at) values('${TEMP_FAVORITE_ID}','${OWNER_ID}','${STALE_FOOD_ID}','2026-09-10T18:31:00Z');
select exists(select 1 from public.food_favorites where id='${TEMP_FAVORITE_ID}'::uuid and user_id='${OWNER_ID}'::uuid);
rollback;`, "ownMutationAllowed");

  const wrongOwnerMutationDenied = booleanEvidence(databaseUrl, `begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','${OTHER_OWNER_ID}',true);
do $plan7_rls$
begin
  begin
    insert into public.food_favorites(id,user_id,food_id,created_at) values('${TEMP_FAVORITE_ID}','${OWNER_ID}','${STALE_FOOD_ID}','2026-09-10T18:31:00Z');
    raise exception 'Plan7 wrong-owner favorite mutation unexpectedly succeeded';
  exception when insufficient_privilege then
    perform set_config('plan7.wrong_owner_mutation_denied','true',true);
  end;
end
$plan7_rls$;
select current_setting('plan7.wrong_owner_mutation_denied',true)='true';
rollback;`, "wrongOwnerMutationDenied");

  const personalizedSearchIsolationVerified = booleanEvidence(databaseUrl, `begin;
select public.rebuild_food_catalog_search_projection_v2('${CURRENT_GENERATION_ID}'::uuid,'search-projection-v2',null);
set local role authenticated;
select set_config('request.jwt.claim.sub','${OWNER_ID}',true);
select set_config('plan7.owner_search_ok',(
  (public.search_food_catalog_v2('','en','Latn','DE',null,20,null,null,'favorites','{}'::jsonb)->'items'->0->>'id')='${CURRENT_FOOD_ID}'
)::text,true);
select set_config('request.jwt.claim.sub','${OTHER_OWNER_ID}',true);
select current_setting('plan7.owner_search_ok',true)='true'
  and jsonb_array_length(public.search_food_catalog_v2('','en','Latn','DE',null,20,null,null,'favorites','{}'::jsonb)->'items')=0;
rollback;`, "personalizedSearchIsolationVerified");

  const authenticatedServiceOnlyDenied = booleanEvidence(databaseUrl, `begin;
set local role authenticated;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub','${OWNER_ID}')::text,true);
do $plan7_authenticated_service_only$
begin
  begin
    perform public.food_catalog_claim_governance_outbox('${TEMP_SERVICE_EVENT_ID}'::uuid,30);
    raise exception 'Plan7 authenticated service-only outbox execution unexpectedly succeeded';
  exception when insufficient_privilege then
    perform set_config('plan7.authenticated_service_only_denied','true',true);
  end;
end
$plan7_authenticated_service_only$;
select current_setting('plan7.authenticated_service_only_denied',true)='true';
rollback;`, "authenticatedServiceOnlyDenied");

  const anonUnauthorizedVerified = booleanEvidence(databaseUrl, `begin;
set local role anon;
select set_config('request.jwt.claims',jsonb_build_object('role','anon')::text,true);
do $plan7_anon$
begin
  begin
    perform public.search_food_catalog_v2('','en','Latn','DE',null,20,null,null,'all','{}'::jsonb);
    raise exception 'Plan7 anon Food Catalog search execution unexpectedly succeeded';
  exception when insufficient_privilege then
    perform set_config('plan7.anon_unauthorized','true',true);
  end;
end
$plan7_anon$;
select current_setting('plan7.anon_unauthorized',true)='true';
rollback;`, "anonUnauthorizedVerified");

  const serviceOutboxAuthorizedVerified = booleanEvidence(databaseUrl, `begin;
insert into public.food_catalog_governance_principals(
  id,principal_type,subject_id,service_identity_sha256,role_class,active,created_at
) values(
  '${TEMP_SERVICE_PRINCIPAL_ID}'::uuid,'service','plan7-security-service',
  encode(extensions.digest(convert_to('${TEMP_SERVICE_IDENTITY}','UTF8'),'sha256'),'hex'),
  'service',true,'2026-09-10T18:32:00Z'
);
insert into public.food_catalog_governance_capability_assignments(
  id,principal_id,capability,granted_at,reason
) values(
  '${TEMP_SERVICE_CAPABILITY_ID}'::uuid,'${TEMP_SERVICE_PRINCIPAL_ID}'::uuid,
  'food.outbox.deliver','2026-09-10T18:32:01Z','plan7 behavioral security proof'
);
insert into public.food_catalog_governance_operations(
  operation_id,principal_id,principal_type,capability,command_name,target_food_id,policy_version,
  reason,semantic_checksum_sha256,result_json,replay_count,created_at,completed_at
) values(
  '${TEMP_SERVICE_OPERATION_ID}'::uuid,'${TEMP_SERVICE_PRINCIPAL_ID}'::uuid,'service',
  'food.outbox.deliver','food_catalog_outbox_deliver','${CURRENT_FOOD_ID}'::uuid,'plan6-v1',
  'plan7 behavioral security proof',repeat('9',64),'{}'::jsonb,0,'2026-09-10T18:32:02Z','2026-09-10T18:32:03Z'
);
insert into public.food_catalog_governance_outbox(
  event_id,operation_id,event_type,payload,status,attempt_count,available_at,lease_epoch,created_at,updated_at
) values(
  '${TEMP_SERVICE_EVENT_ID}'::uuid,'${TEMP_SERVICE_OPERATION_ID}'::uuid,'food.catalog.security.proof',
  jsonb_build_object('foodId','${CURRENT_FOOD_ID}'),'pending',0,'2026-09-10T18:32:04Z',0,
  '2026-09-10T18:32:04Z','2026-09-10T18:32:04Z'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims',jsonb_build_object(
  'role','service_role','plaivra_food_service_identity','${TEMP_SERVICE_IDENTITY}'
)::text,true);
select (
  public.food_catalog_claim_governance_outbox('${TEMP_SERVICE_EVENT_ID}'::uuid,30)->>'eventId'
)='${TEMP_SERVICE_EVENT_ID}';
rollback;`, "serviceOutboxAuthorizedVerified");

  return Object.freeze({
    ownerScopedReadVerified,
    wrongOwnerReadDenied,
    ownMutationAllowed,
    wrongOwnerMutationDenied,
    personalizedSearchIsolationVerified,
    authenticatedServiceOnlyDenied,
    anonUnauthorizedVerified,
    serviceOutboxAuthorizedVerified,
  });
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
  const behavioral = observed.behavioral ?? {};
  const requiredBehavioral = [
    "ownerScopedReadVerified",
    "wrongOwnerReadDenied",
    "ownMutationAllowed",
    "wrongOwnerMutationDenied",
    "personalizedSearchIsolationVerified",
    "authenticatedServiceOnlyDenied",
    "anonUnauthorizedVerified",
    "serviceOutboxAuthorizedVerified",
  ];
  for (const name of requiredBehavioral) {
    if (behavioral[name] !== true) throw new Error(`Food Catalog behavioral owner-isolation boundary failed: ${name}.`);
  }
  const metadata = {
    relations: observed.relations,
    policies: observed.policies,
    privileges: observed.privileges,
    critical,
  };
  const securityRlsAclMetadataIdentitySha256 = sha256(stableJson(metadata));
  const securityBehavioralIdentitySha256 = sha256(stableJson(behavioral));
  return Object.freeze({
    securityRlsAclIdentitySha256: sha256(stableJson({
      metadataIdentitySha256: securityRlsAclMetadataIdentitySha256,
      behavioralIdentitySha256: securityBehavioralIdentitySha256,
    })),
    securityRlsAclMetadataIdentitySha256,
    securityBehavioralIdentitySha256,
    relationCount: observed.relations.length,
    policyCount: observed.policies.length,
    privilegeCount: observed.privileges.length,
    criticalBoundariesVerified: true,
    behavioralBoundariesVerified: true,
  });
}

export function captureFoodCatalogSecurityEvidence(databaseUrl) {
  if (!databaseUrl) throw new Error("Disposable PostgreSQL URL is required for RLS/ACL evidence.");
  const result = spawnSync("psql", [databaseUrl,"-X","-A","-t","-v","ON_ERROR_STOP=1","-c",buildFoodCatalogSecurityEvidenceSql()], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`RLS/ACL evidence query failed: ${(result.stderr ?? "").trim()}`);
  const metadata = JSON.parse((result.stdout ?? "").trim());
  const observed = Object.freeze({ ...metadata, behavioral: captureFoodCatalogBehavioralSecurityEvidence(databaseUrl) });
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
