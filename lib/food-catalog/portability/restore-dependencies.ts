import type { PortableRelationRule } from "./relation-registry";

/**
 * Cross-relation dependency authority for portable data replay. This is deliberately
 * explicit rather than inferred from exported DDL: Git migrations remain schema
 * authority, while this graph documents the data-loader ordering contract.
 *
 * Dependencies that are satisfied in earlier restore phases (migration preseeds,
 * food_items, food_source_records) are still listed so registry changes fail closed
 * when they accidentally invert an authority relationship.
 */
export const FOOD_CATALOG_RESTORE_DEPENDENCIES_V1: Readonly<Record<string, readonly string[]>> = Object.freeze({
  food_subcategories: Object.freeze(["food_kitchens"]),
  food_items: Object.freeze(["food_kitchens", "food_subcategories"]),
  food_source_records: Object.freeze(["food_items"]),
  food_nutrition_revisions: Object.freeze(["food_items", "food_source_records"]),
  food_serving_options: Object.freeze(["food_items", "food_source_records"]),
  food_names: Object.freeze(["food_items", "food_source_records"]),
  food_aliases: Object.freeze(["food_items"]),
  food_barcodes: Object.freeze(["food_items", "food_source_records"]),
  food_market_relevance: Object.freeze(["food_items"]),
  food_taxonomy_nodes: Object.freeze(["food_taxonomy_namespaces"]),
  food_taxonomy_assignments: Object.freeze(["food_items", "food_source_records", "food_taxonomy_nodes"]),
  market_scope_memberships: Object.freeze(["market_scopes"]),
  food_market_assignments: Object.freeze(["food_items", "food_source_records", "market_scopes"]),
  food_verification_assertions: Object.freeze(["food_items", "food_source_records"]),
  food_merge_events: Object.freeze(["food_items"]),

  food_catalog_activation_set_members: Object.freeze(["food_catalog_activation_sets", "food_items"]),
  food_catalog_activation_events: Object.freeze(["food_catalog_activation_sets", "food_catalog_control_operations"]),
  food_catalog_generation_foods: Object.freeze([
    "food_catalog_generations",
    "food_items",
    "food_nutrition_revisions",
    "food_catalog_activation_sets",
    "food_catalog_activation_set_members",
    "food_catalog_activation_events",
  ]),
  food_catalog_generation_names: Object.freeze(["food_catalog_generation_foods", "food_names"]),
  food_catalog_generation_servings: Object.freeze(["food_catalog_generation_foods", "food_serving_options"]),
  food_catalog_generation_taxonomy: Object.freeze(["food_catalog_generation_foods", "food_taxonomy_assignments"]),
  food_catalog_generation_markets: Object.freeze(["food_catalog_generation_foods", "food_market_assignments"]),
  food_catalog_generation_verification: Object.freeze(["food_catalog_generation_foods", "food_verification_assertions"]),
  food_catalog_generation_redirects: Object.freeze(["food_catalog_generations", "food_catalog_generation_foods", "food_items"]),
  food_catalog_generation_validation_reports: Object.freeze(["food_catalog_generations"]),
  food_catalog_generation_validation_findings: Object.freeze(["food_catalog_generation_validation_reports", "food_items"]),
  food_catalog_generation_events: Object.freeze([
    "food_catalog_control_operations",
    "food_catalog_generations",
    "food_catalog_generation_validation_reports",
  ]),
  food_catalog_current_generation: Object.freeze([
    "food_catalog_generations",
    "food_catalog_generation_events",
    "food_catalog_generation_validation_reports",
  ]),

  food_ingestion_batch_records: Object.freeze(["food_ingestion_batches", "food_source_records"]),
  food_ingestion_runs: Object.freeze(["food_ingestion_batches"]),
  food_ingestion_control_operations: Object.freeze(["food_ingestion_runs"]),
  food_ingestion_manifest_records: Object.freeze(["food_ingestion_batches"]),
  food_ingestion_materialized_results: Object.freeze(["food_ingestion_batch_records"]),
  food_ingestion_operational_events: Object.freeze(["food_ingestion_runs"]),
  food_ingestion_quarantines: Object.freeze(["food_ingestion_batches"]),
  food_ingestion_quarantine_resolutions: Object.freeze(["food_ingestion_quarantines"]),
  food_ingestion_reconciliations: Object.freeze(["food_ingestion_runs"]),
  food_ingestion_release_diffs: Object.freeze(["food_ingestion_batches"]),
  food_ingestion_release_diff_records: Object.freeze(["food_ingestion_release_diffs"]),

  food_catalog_governance_capability_assignments: Object.freeze(["food_catalog_governance_principals"]),
  food_catalog_governance_policy_pointer: Object.freeze(["food_catalog_governance_policy_versions"]),
  food_catalog_correction_cases: Object.freeze(["food_items"]),
  food_catalog_correction_reports: Object.freeze(["food_catalog_correction_cases"]),
  food_catalog_correction_report_member_payloads: Object.freeze(["food_catalog_correction_reports"]),
  food_catalog_correction_evidence: Object.freeze([
    "food_catalog_correction_cases",
    "food_items",
    "food_source_records",
    "food_catalog_governance_principals",
  ]),
  food_catalog_governance_authority_revisions: Object.freeze(["food_items"]),
  food_catalog_governance_operations: Object.freeze([
    "food_catalog_governance_principals",
    "food_items",
    "food_catalog_correction_cases",
  ]),
  food_catalog_service_proposals: Object.freeze([
    "food_catalog_governance_operations",
    "food_catalog_governance_principals",
    "food_items",
  ]),
  food_catalog_correction_events: Object.freeze([
    "food_catalog_correction_cases",
    "food_catalog_governance_principals",
  ]),
  food_catalog_governance_audit_events: Object.freeze([
    "food_catalog_governance_operations",
    "food_catalog_governance_principals",
  ]),
  food_catalog_governance_lifecycle_events: Object.freeze(["food_catalog_governance_operations", "food_items"]),
  food_catalog_barcode_corrections: Object.freeze([
    "food_catalog_governance_operations",
    "food_catalog_correction_cases",
    "food_items",
    "food_source_records",
  ]),
  food_catalog_governance_outbox: Object.freeze(["food_catalog_governance_operations"]),
  food_catalog_serving_fact_lineages: Object.freeze(["food_items"]),
  food_catalog_serving_fact_revisions: Object.freeze(["food_catalog_serving_fact_lineages", "food_serving_options"]),
  food_catalog_name_fact_lineages: Object.freeze(["food_items"]),
  food_catalog_name_fact_revisions: Object.freeze(["food_catalog_name_fact_lineages", "food_names"]),
  food_personal_override_revisions: Object.freeze(["food_items"]),
  food_personal_overrides: Object.freeze(["food_items", "food_personal_override_revisions"]),
  food_personal_override_operations: Object.freeze(["food_items"]),
});

export function sortRestoreRulesByDependencies(
  rules: readonly PortableRelationRule[],
  alreadySatisfied: readonly string[] = [],
): readonly PortableRelationRule[] {
  const remaining = new Map(rules.map((rule, index) => [rule.relation, { rule, index }]));
  const satisfied = new Set(alreadySatisfied);
  const result: PortableRelationRule[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(({ rule }) => (FOOD_CATALOG_RESTORE_DEPENDENCIES_V1[rule.relation] ?? []).every((dependency) =>
        satisfied.has(dependency) || !remaining.has(dependency),
      ))
      .sort((left, right) => left.index - right.index);

    if (ready.length === 0) {
      const blocked = [...remaining.values()].map(({ rule }) => ({
        relation: rule.relation,
        dependencies: FOOD_CATALOG_RESTORE_DEPENDENCIES_V1[rule.relation] ?? [],
      }));
      throw new Error(`Plan 7 restore dependency graph contains a cycle or unresolved in-phase dependency: ${JSON.stringify(blocked)}.`);
    }

    for (const { rule } of ready) {
      if (!remaining.delete(rule.relation)) continue;
      result.push(rule);
      satisfied.add(rule.relation);
    }
  }

  return Object.freeze(result);
}