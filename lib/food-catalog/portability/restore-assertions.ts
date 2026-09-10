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

const COMPARISON_CLASSES: readonly RestoreComparisonClass[] = Object.freeze([
  "BYTE_HASH",
  "EXACT_IDENTITY_VALUE",
  "SEMANTIC",
]);

export type RestoreAssertionEvaluation = Readonly<{
  profile: PortableExportProfile;
  trusted: boolean;
  restoreVerified: boolean;
  drReady: boolean;
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

  const missing = MANDATORY_RESTORE_ASSERTION_IDS.filter((id) => !byId.has(id));
  const failures = input.assertions
    .filter((assertion) => assertion.mandatory && assertion.status === "FAIL")
    .map((assertion) => assertion.id);
  if (!input.artifactValid) failures.unshift("artifact_validity");
  for (const id of duplicateIds) failures.push(`duplicate:${id}`);

  const unknown = [
    ...missing,
    ...input.assertions
      .filter((assertion) => assertion.mandatory && assertion.status === "UNKNOWN")
      .map((assertion) => assertion.id),
  ];

  const observedClasses = new Set(
    input.assertions
      .filter((assertion) => assertion.mandatory && assertion.status === "PASS")
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
    drReady: trusted && input.profile === "FULL_DR",
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
