#!/usr/bin/env node
import { readFileSync } from "node:fs";
import process from "node:process";

export const PLAIVRA_PROJECT_REF = "bkwezjxvapaeasfvlhvv";
export const ACTIVITY_CATALOG_PROJECT_REF = "khlcctuefiuhunqymkbp";

export const PLAN7_RETIREMENT_CANDIDATES = Object.freeze([
  "table:public.food_aliases",
  "table:public.food_market_relevance",
  "function:public.search_nutrition_food_library",
  "table:public.food_personal_corrections",
  "table:public.user_food_favorites",
  "column:public.food_items.food_name",
  "column:public.food_items.serving_size",
  "column:public.food_items.calories",
  "column:public.food_items.protein_g",
  "column:public.food_items.carbs_g",
  "column:public.food_items.fat_g",
  "column:public.food_items.fiber_g",
  "column:public.food_items.sugar_g",
  "column:public.food_items.sodium_mg",
  "column:public.food_items.saturated_fat_g",
  "column:public.food_items.sugars_g",
  "column:public.food_items.nutrition_basis_amount",
  "column:public.food_items.nutrition_basis_unit",
  "column:public.food_items.category",
  "column:public.food_items.cuisine",
  "column:public.food_items.is_verified",
  "column:public.food_items.verified_at",
  "column:public.food_items.verified_source_record_id",
  "column:public.food_items.is_market_global",
  "column:public.food_items.merged_into_food_id",
]);

export const PLAN7_KEEP_OBJECTS = Object.freeze([
  "column:public.food_items.id",
  "column:public.food_items.lifecycle_status",
  "table:public.food_barcodes",
  "table:public.food_catalog_search_documents",
  "function:public.search_food_catalog_v2",
  "function:public.rebuild_food_catalog_search_projection_v2",
  "table:public.food_favorites",
  "table:public.food_personal_overrides",
  "table:public.food_personal_override_revisions",
  "table:public.food_personal_override_operations",
]);

const EXPECTED_OLD_SEARCH_SIGNATURE =
  "public.search_nutrition_food_library(text,text,text,integer,text,text,text,jsonb)";

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function exactSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error(`${label} must be an exact 40-character Git SHA.`);
  return normalized;
}

function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function boolean(value) {
  return value === true;
}

function candidateEvidence(input, id) {
  return safeObject(safeObject(input.candidates)[id]);
}

function candidateReferences(evidence) {
  return [
    ...stringArray(evidence.databaseFunctionReferences),
    ...stringArray(evidence.databaseViewReferences),
    ...stringArray(evidence.databaseConstraintReferences),
    ...stringArray(evidence.repositoryRuntimeReferences),
    ...stringArray(evidence.liveObservedReferences),
  ];
}

function candidateBlockers(id, evidence, owner) {
  const blockers = [];
  if (evidence.exists !== true) blockers.push("candidate_not_present");
  if (candidateReferences(evidence).length > 0) blockers.push("candidate_still_referenced");
  if (evidence.externalDependencyState !== "clear") blockers.push("external_dependency_not_cleared");
  if (evidence.liveDependencyState !== "clear") blockers.push("live_dependency_not_cleared");

  if (id === "table:public.food_personal_corrections") {
    if (evidence.rowCount !== 0) blockers.push("personal_corrections_nonzero");
  }

  if (id === "table:public.user_food_favorites") {
    if (!boolean(owner.retirementSafe)) blockers.push("owner_favorites_not_retirement_safe");
    if (owner.blocked !== 0) blockers.push("owner_favorites_blocked_rows");
    if (!Number.isSafeInteger(owner.total) || owner.total < 0) blockers.push("owner_favorites_total_invalid");
  }

  if (id === "table:public.food_market_relevance" && evidence.rowCount !== 0) {
    blockers.push("market_relevance_nonzero");
  }

  return [...new Set(blockers)];
}

function globalBlockers(input) {
  const blockers = [];
  const deployment = safeObject(input.deployment);
  const migration = safeObject(input.migration);
  const ledger = safeObject(input.ledger);
  const portability = safeObject(input.portability);
  const compatibility = safeObject(input.compatibility);
  const historical = safeObject(input.historicalConsumerReferences);

  if (input.projectRef === ACTIVITY_CATALOG_PROJECT_REF) blockers.push("activity_catalog_target_forbidden");
  if (input.projectRef !== PLAIVRA_PROJECT_REF) blockers.push("wrong_production_project");

  const expectedCommit = exactSha(input.expectedDeployedCommit, "Expected deployed commit");
  const deployedCommit = exactSha(deployment.commitSha, "Deployed commit");
  if (deployedCommit !== expectedCommit) blockers.push("deployed_commit_mismatch");
  if (deployment.environment !== "production") blockers.push("deployment_not_production");
  if (!boolean(deployment.artifactIdentityValid)) blockers.push("artifact_identity_invalid");
  if (!boolean(deployment.releaseReady)) blockers.push("deployed_release_not_ready");

  const expectedLatest = String(input.expectedLatestMigrationVersion ?? "").trim();
  if (!/^\d{12,14}$/.test(expectedLatest)) blockers.push("expected_latest_migration_invalid");
  if (String(migration.latestVersion ?? "") !== expectedLatest) blockers.push("latest_migration_mismatch");
  if (String(migration.latestName ?? "") !== String(input.expectedLatestMigrationName ?? "")) blockers.push("latest_migration_name_mismatch");
  if (!Number.isSafeInteger(migration.recordCount) || migration.recordCount <= 0) blockers.push("migration_record_count_invalid");

  if (ledger.reconciliationState !== "reconciled") blockers.push("migration_ledger_not_reconciled");
  if (ledger.pendingCount !== 0) blockers.push("pending_migrations_present");
  if (ledger.schemaAppliedUntrackedCount !== 0) blockers.push("schema_untracked_migrations_present");
  if (ledger.unresolvedCount !== 0) blockers.push("unresolved_migrations_present");

  if (String(compatibility.schemaCompatibilityVersion ?? "") !== "2") blockers.push("schema_compatibility_mismatch");
  if (deployment.expectedDatabaseMigrationVersion !== compatibility.databaseMigrationVersion) {
    blockers.push("deployed_database_marker_mismatch");
  }

  if (portability.profile !== "FULL_DR") blockers.push("fresh_full_dr_missing");
  if (!boolean(portability.fresh)) blockers.push("fresh_full_dr_missing");
  if (portability.exactHead !== expectedCommit) blockers.push("full_dr_head_mismatch");
  if (portability.latestMigrationVersion !== expectedLatest) blockers.push("full_dr_schema_head_mismatch");
  if (!boolean(portability.drReady)) blockers.push("full_dr_not_ready");
  if (portability.productionMutationPerformed !== false) blockers.push("full_dr_mutated_production");

  if (!boolean(historical.verified) || historical.unresolvedCount !== 0) {
    blockers.push("historical_consumer_reference_evidence_incomplete");
  }

  return [...new Set(blockers)];
}

export function evaluatePlan7RetirementPreflight(input) {
  const normalized = safeObject(input);
  const owner = safeObject(normalized.ownerReconciliation);
  const blockers = globalBlockers(normalized);
  const candidateResults = PLAN7_RETIREMENT_CANDIDATES.map((id) => {
    const evidence = candidateEvidence(normalized, id);
    const reasons = candidateBlockers(id, evidence, owner);
    return Object.freeze({
      id,
      exists: evidence.exists === true,
      rowCount: Number.isSafeInteger(evidence.rowCount) ? evidence.rowCount : null,
      blockers: Object.freeze(reasons),
      eligibleForPlannerReview: reasons.length === 0,
    });
  });

  const proposedDestructiveObjects = candidateResults
    .filter((candidate) => candidate.eligibleForPlannerReview)
    .map((candidate) => candidate.id);
  const blockedCandidates = candidateResults
    .filter((candidate) => !candidate.eligibleForPlannerReview)
    .map((candidate) => ({ id: candidate.id, blockers: candidate.blockers }));

  const keepEvidence = safeObject(normalized.keepObjects);
  const keepViolations = PLAN7_KEEP_OBJECTS.filter((id) => keepEvidence[id] !== true);
  if (keepViolations.length > 0) blockers.push("keep_object_evidence_incomplete");

  const uniqueGlobalBlockers = [...new Set(blockers)];
  const approvable = uniqueGlobalBlockers.length === 0
    && proposedDestructiveObjects.length > 0;

  return Object.freeze({
    schemaVersion: 1,
    projectRef: normalized.projectRef ?? null,
    expectedDeployedCommit: normalized.expectedDeployedCommit ?? null,
    deployedCommit: safeObject(normalized.deployment).commitSha ?? null,
    expectedLatestMigrationVersion: normalized.expectedLatestMigrationVersion ?? null,
    globalBlockers: Object.freeze(uniqueGlobalBlockers),
    candidateResults: Object.freeze(candidateResults),
    proposedDestructiveObjects: Object.freeze(proposedDestructiveObjects),
    blockedCandidates: Object.freeze(blockedCandidates),
    keepViolations: Object.freeze(keepViolations),
    approvable,
    plannerApprovalRequired: true,
    destructiveSqlAuthorized: false,
    productionMutationAuthorized: false,
  });
}

export function buildPlan7RetirementDiscoverySql() {
  const columnCandidates = PLAN7_RETIREMENT_CANDIDATES
    .filter((id) => id.startsWith("column:public.food_items."))
    .map((id) => id.split(".").at(-1));

  const columnJson = columnCandidates.map((column) => `
      '${column}', jsonb_build_object(
        'exists', exists(
          select 1 from information_schema.columns
          where table_schema='public' and table_name='food_items' and column_name='${column}'
        ),
        'nonNullCount', case
          when exists(
            select 1 from information_schema.columns
            where table_schema='public' and table_name='food_items' and column_name='${column}'
          )
          then (select count(*) from public.food_items where ${column} is not null)
          else null
        end,
        'databaseFunctionReferences', coalesce((
          select jsonb_agg(signature order by signature)
          from (
            select p.oid::regprocedure::text as signature
            from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private')
              and p.prokind='f'
              and position('${column}' in lower(pg_get_functiondef(p.oid)))>0
          ) refs
        ), '[]'::jsonb),
        'databaseConstraintReferences', coalesce((
          select jsonb_agg(name order by name)
          from (
            select c.conname as name
            from pg_constraint c
            where c.conrelid='public.food_items'::regclass
              and position('${column}' in lower(pg_get_constraintdef(c.oid)))>0
          ) refs
        ), '[]'::jsonb)
      )`).join(",");

  const tableJson = [
    ["food_aliases", "public.food_aliases"],
    ["food_market_relevance", "public.food_market_relevance"],
    ["food_personal_corrections", "public.food_personal_corrections"],
    ["user_food_favorites", "public.user_food_favorites"],
  ].map(([key, relation]) => `
      '${key}', jsonb_build_object(
        'exists', to_regclass('${relation}') is not null,
        'rowCount', case when to_regclass('${relation}') is not null
          then (select count(*) from ${relation}) else null end,
        'databaseFunctionReferences', coalesce((
          select jsonb_agg(signature order by signature)
          from (
            select p.oid::regprocedure::text as signature
            from pg_proc p
            join pg_namespace n on n.oid=p.pronamespace
            where n.nspname in ('public','private')
              and p.prokind='f'
              and position('${key}' in lower(pg_get_functiondef(p.oid)))>0
          ) refs
        ), '[]'::jsonb),
        'databaseViewReferences', coalesce((
          select jsonb_agg(view_name order by view_name)
          from (
            select schemaname || '.' || viewname as view_name
            from pg_views
            where schemaname in ('public','private')
              and position('${key}' in lower(definition))>0
          ) refs
        ), '[]'::jsonb)
      )`).join(",");

  return `begin read only;
select jsonb_build_object(
  'migration', jsonb_build_object(
    'recordCount', (select count(*) from supabase_migrations.schema_migrations),
    'latestVersion', (select version from supabase_migrations.schema_migrations order by version desc limit 1),
    'latestName', (select name from supabase_migrations.schema_migrations order by version desc limit 1)
  ),
  'currentGeneration', (
    select jsonb_build_object(
      'currentGenerationId', current_generation_id,
      'currentEventId', current_event_id,
      'currentValidationReportId', current_validation_report_id,
      'pointerRevision', pointer_revision
    )
    from public.food_catalog_current_generation
    where singleton_key=true
  ),
  'compatibility', (
    select jsonb_build_object(
      'schemaCompatibilityVersion', version,
      'databaseMigrationVersion', migration_version
    )
    from public.release_schema_compatibility
    where singleton=true
  ),
  'tables', jsonb_build_object(
    ${tableJson}
  ),
  'foodItemColumns', jsonb_build_object(
    ${columnJson}
  ),
  'oldSearch', jsonb_build_object(
    'exists', to_regprocedure('${EXPECTED_OLD_SEARCH_SIGNATURE}') is not null,
    'authenticatedExecute', case when to_regprocedure('${EXPECTED_OLD_SEARCH_SIGNATURE}') is not null
      then has_function_privilege('authenticated','${EXPECTED_OLD_SEARCH_SIGNATURE}','EXECUTE') else false end,
    'serviceRoleExecute', case when to_regprocedure('${EXPECTED_OLD_SEARCH_SIGNATURE}') is not null
      then has_function_privilege('service_role','${EXPECTED_OLD_SEARCH_SIGNATURE}','EXECUTE') else false end,
    'anonExecute', case when to_regprocedure('${EXPECTED_OLD_SEARCH_SIGNATURE}') is not null
      then has_function_privilege('anon','${EXPECTED_OLD_SEARCH_SIGNATURE}','EXECUTE') else false end
  )
) as plan7_retirement_discovery;
rollback;`;
}

function parseArgs(argv) {
  const options = {};
  for (let index=0; index<argv.length; index+=1) {
    const item = argv[index];
    if (item === "--emit-sql") {
      options.emitSql = true;
      continue;
    }
    if (!item.startsWith("--")) throw new Error(`Unexpected argument: ${item}`);
    const value = argv[index+1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for ${item}`);
    options[item.slice(2)] = value;
    index += 1;
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.emitSql) {
    process.stdout.write(`${buildPlan7RetirementDiscoverySql()}\n`);
    return;
  }
  if (!options.evidence) throw new Error("--evidence <path> is required unless --emit-sql is used.");
  const evidence = JSON.parse(readFileSync(options.evidence, "utf8"));
  const result = evaluatePlan7RetirementPreflight(evidence);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.approvable) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
