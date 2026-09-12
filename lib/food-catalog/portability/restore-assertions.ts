import type { PortableExportProfile } from "./export-contract";

export type RestoreComparisonClass = "BYTE_HASH" | "EXACT_IDENTITY_VALUE" | "SEMANTIC";
export type RestoreAssertionStatus = "PASS" | "FAIL" | "UNKNOWN";

export type RestoreAssertionEvidence = Readonly<{
  id: string;
  comparisonClass: RestoreComparisonClass;
  mandatory: boolean;
  status: RestoreAssertionStatus;
  detail: string;
}>;

export const MANDATORY_RESTORE_ASSERTION_IDS = Object.freeze([
  "artifact_semantic_hashes",
  "transport_integrity",
  "stored_checksums",
  "typed_identity_values",
  "source_provenance",
  "nutrition_name_serving_lineage",
  "taxonomy_market_barcode",
  "verification_activation",
  "generation_composition",
  "current_pointer",
  "merge_graph",
  "governance_personal_overrides",
  "frozen_consumer_references",
  "security_rls_acl_identity",
  "migration_schema_fingerprint",
  "transient_neutralization",
] as const);

const MANDATORY_RESTORE_ASSERTION_ID_SET = new Set<string>(MANDATORY_RESTORE_ASSERTION_IDS);

const COMPARISON_CLASSES: readonly RestoreComparisonClass[] = Object.freeze([
  "BYTE_HASH",
  "EXACT_IDENTITY_VALUE",
  "SEMANTIC",
]);

export type RestoreAssertionEvaluation = Readonly<{
  profile: PortableExportProfile;
  trusted: boolean;
  restoreVerified: boolean;
  failures: readonly string[];
  unknown: readonly string[];
  missing: readonly string[];
  comparisonClasses: readonly RestoreComparisonClass[];
}>;

export function evaluateRestoreAssertions(input: Readonly<{
  profile: PortableExportProfile;
  artifactValid: boolean;
  assertions: readonly RestoreAssertionEvidence[];
}>): RestoreAssertionEvaluation {
  const byId = new Map<string, RestoreAssertionEvidence>();
  const duplicateIds = new Set<string>();
  for (const assertion of input.assertions) {
    if (byId.has(assertion.id)) duplicateIds.add(assertion.id);
    byId.set(assertion.id, assertion);
  }

  const isCanonicalMandatory = (assertion: RestoreAssertionEvidence) => MANDATORY_RESTORE_ASSERTION_ID_SET.has(assertion.id);
  const missing = MANDATORY_RESTORE_ASSERTION_IDS.filter((id) => !byId.has(id));
  const failures = input.assertions
    .filter((assertion) => isCanonicalMandatory(assertion) && assertion.status === "FAIL")
    .map((assertion) => assertion.id);
  if (!input.artifactValid) failures.unshift("artifact_validity");
  for (const id of duplicateIds) failures.push(`duplicate:${id}`);

  const unknown = [
    ...missing,
    ...input.assertions
      .filter((assertion) => isCanonicalMandatory(assertion) && assertion.status === "UNKNOWN")
      .map((assertion) => assertion.id),
  ];

  const observedClasses = new Set(
    input.assertions
      .filter((assertion) => isCanonicalMandatory(assertion) && assertion.status === "PASS")
      .map((assertion) => assertion.comparisonClass),
  );
  for (const comparisonClass of COMPARISON_CLASSES) {
    if (!observedClasses.has(comparisonClass)) unknown.push(`comparison_class:${comparisonClass}`);
  }

  const trusted = input.artifactValid && failures.length === 0 && unknown.length === 0;
  return Object.freeze({
    profile: input.profile,
    trusted,
    restoreVerified: trusted,
    failures: Object.freeze([...new Set(failures)]),
    unknown: Object.freeze([...new Set(unknown)]),
    missing: Object.freeze([...missing]),
    comparisonClasses: COMPARISON_CLASSES,
  });
}

function assertSha256(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new Error(`${label} must be a SHA-256 digest.`);
}

export function compareHashEvidence(expected: string, actual: string): true {
  assertSha256(expected, "Expected hash");
  assertSha256(actual, "Actual hash");
  if (expected !== actual) throw new Error("Restore hash/digest evidence does not match exactly.");
  return true;
}

export function compareExactTypedRows(expected: readonly string[], actual: readonly string[]): true {
  if (expected.length !== actual.length) throw new Error("Exact typed row count does not match.");
  for (let index = 0; index < expected.length; index += 1) {
    if (expected[index] !== actual[index]) {
      throw new Error(`Exact typed row mismatch at index ${index}; no numeric or timestamp coercion is allowed.`);
    }
  }
  return true;
}

export function assertRedirectGraph(input: Readonly<{
  canonicalFoodIds: readonly string[];
  redirects: readonly Readonly<{ sourceFoodId: string; targetFoodId: string }>[];
}>): true {
  const canonicalIds = new Set(input.canonicalFoodIds);
  const redirects = new Map<string, string>();
  for (const edge of input.redirects) {
    if (!canonicalIds.has(edge.sourceFoodId)) throw new Error(`Redirect source is missing: ${edge.sourceFoodId}`);
    if (!canonicalIds.has(edge.targetFoodId)) throw new Error(`Redirect target is missing: ${edge.targetFoodId}`);
    if (redirects.has(edge.sourceFoodId)) throw new Error(`Redirect source has multiple targets: ${edge.sourceFoodId}`);
    redirects.set(edge.sourceFoodId, edge.targetFoodId);
  }

  for (const start of redirects.keys()) {
    const seen = new Set<string>();
    let current: string | undefined = start;
    while (current && redirects.has(current)) {
      if (seen.has(current)) throw new Error(`Redirect cycle detected from ${start}.`);
      seen.add(current);
      current = redirects.get(current);
    }
  }
  return true;
}

export function assertExactOwnerBindings(bindings: readonly Readonly<{
  sourceOwnerId: string;
  targetOwnerId: string;
  matches: number;
}>[]): true {
  for (const binding of bindings) {
    if (binding.matches !== 1) {
      throw new Error(`Owner identity binding must have exactly one match; ambiguous/exact binding failure for ${binding.sourceOwnerId}.`);
    }
    if (binding.sourceOwnerId !== binding.targetOwnerId) {
      throw new Error(`Owner identity mismatch for ${binding.sourceOwnerId}.`);
    }
  }
  return true;
}

export function assertTransientNeutralization(
  row: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): true {
  for (const field of fields) {
    if (!(field in row) || row[field] !== null) {
      throw new Error(`Transient field ${field} is not restore-neutralized to NULL.`);
    }
  }
  return true;
}

const SQL_IDENTIFIER = /^[a-z_][a-z0-9_]*$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPERATIONAL_TRANSIENT_RELATIONS = new Set([
  "food_ingestion_runs",
  "food_catalog_governance_outbox",
]);

export type PrePointerTransientRule = Readonly<{
  relation: string;
  fields: readonly string[];
}>;

export type PrePointerVerificationInput = Readonly<{
  currentGenerationId: string | null;
  currentEventId: string | null;
  currentValidationReportId: string | null;
  transientRules?: readonly PrePointerTransientRule[];
}>;

function prePointerUuid(value: string | null, label: string, nullable = false): string | null {
  if (nullable && value == null) return null;
  if (typeof value !== "string" || !UUID.test(value)) throw new Error(`${label} must be a UUID.`);
  return value.toLowerCase();
}

function prePointerIdentifier(value: string, label: string): string {
  if (typeof value !== "string" || !SQL_IDENTIFIER.test(value)) throw new Error(`${label} must be a safe SQL identifier.`);
  return value;
}

function buildTransientSemanticSql(rules: readonly PrePointerTransientRule[]): string {
  const operational = rules.filter((rule) => OPERATIONAL_TRANSIENT_RELATIONS.has(rule.relation));
  for (const required of OPERATIONAL_TRANSIENT_RELATIONS) {
    if (!operational.some((rule) => rule.relation === required)) {
      throw new Error(`Pre-pointer verification is missing operational transient rule ${required}.`);
    }
  }
  return operational.map((rule) => {
    const relation = prePointerIdentifier(rule.relation, "transient relation");
    if (!Array.isArray(rule.fields) || rule.fields.length === 0) throw new Error(`Transient relation ${relation} must declare fields.`);
    const fields = rule.fields.map((field) => prePointerIdentifier(field, `${relation} transient field`));
    return `  IF EXISTS (SELECT 1 FROM public.${relation} WHERE ${fields.map((field) => `${field} IS NOT NULL`).join(" OR ")}) THEN\n    RAISE EXCEPTION 'Plan7 pre-pointer transient authority remains in ${relation}';\n  END IF;`;
  }).join("\n");
}

/**
 * Canonical semantic gate executed immediately before current-generation pointer activation.
 * It intentionally lives beside the final restore assertion authority so restore loading and
 * final certification share one semantic source of truth instead of independent gate engines.
 */
export function buildPrePointerVerificationSql({
  currentGenerationId,
  currentEventId,
  currentValidationReportId,
  transientRules = [],
}: PrePointerVerificationInput): string {
  if (currentGenerationId == null) {
    if (currentEventId != null || currentValidationReportId != null) throw new Error("Null current generation requires null event/report pointer identities.");
    return "SELECT true;";
  }
  const generation = prePointerUuid(currentGenerationId, "current generation") as string;
  const event = prePointerUuid(currentEventId, "current event") as string;
  const report = prePointerUuid(currentValidationReportId, "current validation report") as string;
  return `DO $plan7_pre_pointer$
DECLARE
  v_generation_checksum text;
BEGIN
  SELECT composition_checksum_sha256 INTO v_generation_checksum
  FROM public.food_catalog_generations
  WHERE id='${generation}'::uuid AND sealed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan7 current generation is missing or unsealed'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.food_catalog_generation_foods WHERE generation_id='${generation}'::uuid) THEN
    RAISE EXCEPTION 'Plan7 current generation composition is empty';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.food_catalog_generation_foods gf
    LEFT JOIN public.food_items f ON f.id=gf.food_id
    LEFT JOIN public.food_nutrition_revisions nr ON nr.id=gf.nutrition_revision_id AND nr.food_id=gf.food_id
    WHERE gf.generation_id='${generation}'::uuid
      AND (f.id IS NULL OR (gf.nutrition_revision_id IS NOT NULL AND nr.id IS NULL))
  ) THEN RAISE EXCEPTION 'Plan7 generation Food/nutrition composition is semantically incomplete'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.food_catalog_generation_names gn
    LEFT JOIN public.food_names n ON n.id=gn.name_fact_id AND n.food_id=gn.food_id
    WHERE gn.generation_id='${generation}'::uuid AND n.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_servings gs
    LEFT JOIN public.food_serving_options s ON s.id=gs.serving_option_id AND s.food_id=gs.food_id
    WHERE gs.generation_id='${generation}'::uuid AND s.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_taxonomy gt
    LEFT JOIN public.food_taxonomy_assignments a ON a.id=gt.taxonomy_assignment_id AND a.food_id=gt.food_id AND a.assignment_action='assign'
    WHERE gt.generation_id='${generation}'::uuid AND a.id IS NULL
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_markets gm
    LEFT JOIN public.food_market_assignments a ON a.id=gm.market_assignment_id AND a.food_id=gm.food_id AND a.assignment_action='assign'
    WHERE gm.generation_id='${generation}'::uuid AND a.id IS NULL
  ) THEN RAISE EXCEPTION 'Plan7 selected generation facts are semantically incomplete'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_validation_reports r
    WHERE r.id='${report}'::uuid AND r.generation_id='${generation}'::uuid
      AND r.generation_checksum_sha256=v_generation_checksum
      AND r.blocker_count = 0 AND r.error_count = 0
  ) THEN RAISE EXCEPTION 'Plan7 validation report/checksum/blocker gate failed'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_generation_events e
    WHERE e.id='${event}'::uuid AND e.event_type='promote'
      AND e.to_generation_id='${generation}'::uuid
      AND e.validation_report_id='${report}'::uuid
      AND e.generation_checksum_sha256=v_generation_checksum
  ) THEN RAISE EXCEPTION 'Plan7 promotion event linkage/checksum gate failed'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.food_catalog_governance_policy_pointer p
    JOIN public.food_catalog_governance_policy_versions v ON v.policy_version=p.current_policy_version
    WHERE p.singleton
  ) THEN RAISE EXCEPTION 'Plan7 governance policy linkage is missing'; END IF;

  IF EXISTS (
    WITH RECURSIVE redirect_walk(source_food_id,target_food_id,path,cycle) AS (
      SELECT r.source_food_id,r.target_food_id,ARRAY[r.source_food_id]::uuid[],false
      FROM public.food_catalog_generation_redirects r WHERE r.generation_id='${generation}'::uuid
      UNION ALL
      SELECT w.source_food_id,r.target_food_id,w.path || r.source_food_id,r.source_food_id=ANY(w.path)
      FROM redirect_walk w
      JOIN public.food_catalog_generation_redirects r ON r.generation_id='${generation}'::uuid AND r.source_food_id=w.target_food_id
      WHERE NOT w.cycle
    ) SELECT 1 FROM redirect_walk WHERE cycle
  ) OR EXISTS (
    SELECT 1 FROM public.food_catalog_generation_redirects r
    LEFT JOIN public.food_items source ON source.id=r.source_food_id
    LEFT JOIN public.food_catalog_generation_foods target ON target.generation_id=r.generation_id AND target.food_id=r.target_food_id AND target.lifecycle='active'
    WHERE r.generation_id='${generation}'::uuid AND (source.id IS NULL OR target.food_id IS NULL)
  ) THEN RAISE EXCEPTION 'Plan7 redirect topology is cyclic or has a missing canonical target'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.food_catalog_governance_principals p
    LEFT JOIN auth.users u ON u.id=p.human_user_id
    LEFT JOIN public.profiles profile ON profile.id=p.human_user_id
    LEFT JOIN public.account_access_states access ON access.user_id=p.human_user_id AND access.state='active' AND access.disabled_at IS NULL
    WHERE p.principal_type='human' AND p.active AND p.revoked_at IS NULL
      AND (p.human_user_id IS NULL OR u.id IS NULL OR profile.id IS NULL OR access.user_id IS NULL)
  ) THEN RAISE EXCEPTION 'Plan7 governance principal owner mapping is incomplete'; END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='food_favorites')
     OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='food_personal_corrections')
     OR NOT EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='food_catalog_search_documents' AND c.relrowsecurity
     ) THEN RAISE EXCEPTION 'Plan7 RLS policy metadata baseline is incomplete'; END IF;
${buildTransientSemanticSql(transientRules)}
END
$plan7_pre_pointer$;`;
}
