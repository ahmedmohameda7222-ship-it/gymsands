import type {
  PortableExportProfile,
  PortableLoadMode,
  PortableRelationClassification,
} from "./export-contract";

export type SeedOwnership = "MIGRATION_OWNED" | "PORTABLE_OWNED" | "NONE";
export type RestoreOwnership =
  | "UNIFORM"
  | "MIXED_KEYED_PRESEEDED_RUNTIME"
  | "MUTABLE_PRESEEDED_SINGLETON";

export type PortableRelationRule = Readonly<{
  segment: string;
  relation: string;
  classification: PortableRelationClassification;
  loadMode: PortableLoadMode;
  stableKey: readonly string[];
  requiredProfile: PortableExportProfile;
  protected: boolean;
  seedOwnership: SeedOwnership;
  restoreOwnership: RestoreOwnership;
  transientNeutralize?: readonly string[];
  restoreLast?: boolean;
  operationallyDisabledAfterRestore?: boolean;
  note?: string;
}>;

function rule(
  relation: string,
  classification: PortableRelationClassification,
  loadMode: PortableLoadMode,
  stableKey: readonly string[],
  options: Partial<Omit<PortableRelationRule, "segment" | "relation" | "classification" | "loadMode" | "stableKey">> & { segment?: string } = {},
): PortableRelationRule {
  return Object.freeze({
    segment: options.segment ?? relation,
    relation,
    classification,
    loadMode,
    stableKey: Object.freeze([...stableKey]),
    requiredProfile: options.requiredProfile ?? "CORE_PORTABLE",
    protected: options.protected ?? false,
    seedOwnership: options.seedOwnership ?? "NONE",
    restoreOwnership: options.restoreOwnership ?? "UNIFORM",
    transientNeutralize: options.transientNeutralize ? Object.freeze([...options.transientNeutralize]) : undefined,
    restoreLast: options.restoreLast,
    operationallyDisabledAfterRestore: options.operationallyDisabledAfterRestore,
    note: options.note,
  });
}

const A = "PORTABLE_AUTHORITY" as const;
const H = "PORTABLE_AUDIT_HISTORY" as const;
const C = "TRANSITIONAL_PORTABLE_COMPATIBILITY" as const;
const PA = "PROTECTED_PORTABLE_AUTHORITY" as const;
const PH = "PROTECTED_PORTABLE_AUDIT_HISTORY" as const;

export const FOOD_CATALOG_PORTABLE_RELATIONS_V1: readonly PortableRelationRule[] = Object.freeze([
  rule("food_items", A, "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY", ["id"], {
    transientNeutralize: ["verified_source_record_id"],
    note: "Stable Food ID plus current physical compatibility values; food_name remains NOT NULL before retirement.",
  }),
  rule("food_source_records", A, "RESTORE_EXACT", ["id"]),
  rule("food_nutrition_revisions", A, "RESTORE_EXACT", ["id"]),
  rule("food_serving_options", A, "RESTORE_EXACT", ["id"]),
  rule("food_names", A, "RESTORE_EXACT", ["id"]),
  rule("food_aliases", C, "RESTORE_EXACT", ["id"]),
  rule("food_barcodes", A, "RESTORE_EXACT", ["id"]),
  rule("food_market_relevance", C, "RESTORE_EXACT", ["id"]),
  rule("food_taxonomy_namespaces", A, "VALIDATE_PRESEEDED", ["namespace_code"], { seedOwnership: "MIGRATION_OWNED" }),
  rule("food_taxonomy_nodes", A, "VALIDATE_PRESEEDED", ["node_code"], {
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
    note: "Existing Git-migration keys validate exactly; source-only runtime taxonomy nodes restore exactly.",
  }),
  rule("food_taxonomy_assignments", A, "RESTORE_EXACT", ["id"]),
  rule("market_scopes", A, "VALIDATE_PRESEEDED", ["scope_code"], {
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
    note: "Existing Git-migration keys validate exactly; source-only runtime scope extensions restore exactly.",
  }),
  rule("market_scope_memberships", A, "VALIDATE_PRESEEDED", ["child_scope_code", "parent_scope_code"], {
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
    note: "Existing Git-migration keys validate exactly; source-only runtime membership extensions restore exactly.",
  }),
  rule("food_market_assignments", A, "RESTORE_EXACT", ["id"]),
  rule("food_verification_assertions", A, "RESTORE_EXACT", ["id"]),
  rule("food_merge_events", H, "RESTORE_EXACT", ["id"]),
  rule("food_kitchens", "REFERENCE_ONLY", "RESTORE_EXACT", ["id"]),
  rule("food_subcategories", "REFERENCE_ONLY", "RESTORE_EXACT", ["id"]),

  rule("food_catalog_activation_sets", A, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_activation_set_members", A, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_activation_events", H, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_generations", A, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_generation_foods", A, "RESTORE_EXACT", ["generation_id", "food_id"]),
  rule("food_catalog_generation_names", A, "RESTORE_EXACT", ["generation_id", "food_id", "name_fact_id"]),
  rule("food_catalog_generation_servings", A, "RESTORE_EXACT", ["generation_id", "food_id", "serving_option_id"]),
  rule("food_catalog_generation_taxonomy", A, "RESTORE_EXACT", ["generation_id", "food_id", "taxonomy_assignment_id"]),
  rule("food_catalog_generation_markets", A, "RESTORE_EXACT", ["generation_id", "food_id", "market_assignment_id"]),
  rule("food_catalog_generation_verification", A, "RESTORE_EXACT", ["generation_id", "food_id", "assertion_scope"]),
  rule("food_catalog_generation_redirects", A, "RESTORE_EXACT", ["generation_id", "source_food_id"]),
  rule("food_catalog_generation_validation_reports", H, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_generation_validation_findings", H, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_generation_events", H, "RESTORE_EXACT", ["id"]),
  rule("food_catalog_control_operations", H, "RESTORE_EXACT", ["operation_id"]),
  rule("food_catalog_current_generation", A, "VALIDATE_PRESEEDED", ["singleton_key"], {
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MUTABLE_PRESEEDED_SINGLETON",
    restoreLast: true,
  }),

  rule("food_ingestion_batches", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_batch_records", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_control_operations", H, "RESTORE_EXACT", ["operation_id"]),
  rule("food_ingestion_manifest_records", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_materialized_results", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_operational_events", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_quarantines", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_quarantine_resolutions", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_reconciliations", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_release_diffs", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_release_diff_records", H, "RESTORE_EXACT", ["id"]),
  rule("food_ingestion_runs", H, "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", ["id"], {
    transientNeutralize: ["lease_owner", "lease_token", "lease_expires_at"],
  }),

  rule("food_catalog_search_nutrition_policies", A, "RESTORE_EXACT", ["policy_version"]),
  rule("food_catalog_search_documents", "DERIVED_REBUILD", "DERIVED_REBUILD", ["generation_id", "food_id", "language_tag", "script_code", "projection_version"], {
    note: "Rebuild only through public.rebuild_food_catalog_search_projection_v2(uuid,text,text).",
  }),
  rule("release_schema_compatibility", "REFERENCE_ONLY", "VALIDATE_PRESEEDED", ["singleton"], {
    seedOwnership: "MIGRATION_OWNED",
    note: "Source compatibility is evidence only and never target promotion authority.",
  }),

  rule("food_catalog_governance_principals", PA, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_capability_assignments", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_policy_versions", PA, "VALIDATE_PRESEEDED", ["policy_version"], {
    requiredProfile: "FULL_DR",
    protected: true,
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MIXED_KEYED_PRESEEDED_RUNTIME",
    note: "Migration-created policy versions validate; runtime-created policy versions restore exactly.",
  }),
  rule("food_catalog_governance_policy_pointer", PA, "VALIDATE_PRESEEDED", ["singleton"], {
    requiredProfile: "FULL_DR",
    protected: true,
    seedOwnership: "MIGRATION_OWNED",
    restoreOwnership: "MUTABLE_PRESEEDED_SINGLETON",
    note: "Singleton identity is migration-owned while approved current policy pointer fields are portable mutable state.",
  }),
  rule("food_catalog_correction_cases", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_correction_reports", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_correction_report_member_payloads", PH, "RESTORE_EXACT", ["report_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_correction_evidence", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_correction_events", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_authority_revisions", PA, "RESTORE_EXACT", ["food_id", "authority_kind", "authority_key"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_operations", PH, "RESTORE_EXACT", ["operation_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_service_proposals", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_audit_events", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_lifecycle_events", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_barcode_corrections", PH, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_governance_outbox", PH, "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION", ["event_id"], {
    requiredProfile: "FULL_DR",
    protected: true,
    transientNeutralize: ["claim_principal_id", "lease_token", "lease_epoch", "lease_acquired_at", "lease_expires_at"],
    operationallyDisabledAfterRestore: true,
  }),
  rule("food_catalog_serving_fact_lineages", PA, "RESTORE_EXACT", ["lineage_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_serving_fact_revisions", PA, "RESTORE_EXACT", ["serving_option_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_name_fact_lineages", PA, "RESTORE_EXACT", ["lineage_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_catalog_name_fact_revisions", PA, "RESTORE_EXACT", ["name_fact_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_personal_override_revisions", PA, "RESTORE_EXACT", ["id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_personal_overrides", PA, "RESTORE_EXACT", ["user_id", "food_id"], { requiredProfile: "FULL_DR", protected: true }),
  rule("food_personal_override_operations", PH, "RESTORE_EXACT", ["user_id", "operation_id"], { requiredProfile: "FULL_DR", protected: true }),
]);

const byRelation = new Map<string, PortableRelationRule>();
for (const entry of FOOD_CATALOG_PORTABLE_RELATIONS_V1) {
  if (!byRelation.has(entry.relation)) byRelation.set(entry.relation, entry);
}

export function findPortableRelationRule(relation: string): PortableRelationRule | undefined {
  return byRelation.get(relation);
}

export function requiredSegmentsForProfile(profile: PortableExportProfile): string[] {
  return FOOD_CATALOG_PORTABLE_RELATIONS_V1
    .filter((entry) => entry.requiredProfile === "CORE_PORTABLE" || profile === "FULL_DR")
    .map((entry) => entry.segment);
}
