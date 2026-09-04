export type FoodCatalogSourceDescriptor = {
  provider: string;
  dataset: string;
  sourceVersion: string;
  sourceReleaseDate: string | null;
  licenseName: string;
  licenseReference: string | null;
  sourceReference: string | null;
  sourceChecksumSha256: string;
  importerVersion: string;
  configChecksumSha256: string;
};

export type FoodCatalogNutrition = {
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  saturated_fat_g: number | null;
  fiber_g: number | null;
  sugars_g: number | null;
  sodium_mg: number | null;
  basis_amount: number | null;
  basis_unit: "g" | "ml" | null;
};

export type FoodCatalogMarketScope = {
  type: "country" | "region";
  code: string;
  relevanceLevel: "primary" | "secondary";
};

export type FoodCatalogAlias = {
  locale: string;
  value: string;
  normalizedValue: string;
};

export type FoodCatalogAliasInput = Omit<FoodCatalogAlias, "normalizedValue">;

export type FoodCatalogNameEvidenceRole =
  | "source"
  | "normalized"
  | "alias"
  | "transliteration";

export type FoodCatalogNameEvidenceInput = {
  locale: string;
  script: string | null;
  role: FoodCatalogNameEvidenceRole;
  value: string;
};

export type FoodCatalogNameEvidence = FoodCatalogNameEvidenceInput & {
  normalizedValue: string;
};

export type FoodCatalogIdentityEvidence = {
  semanticSignature: string | null;
  preparation: string | null;
  state: string | null;
  form: string | null;
  structuredEvidenceKey?: string | null;
};

export type FoodCatalogServingEvidence = {
  servingKey: string;
  amount: number | null;
  unit: string;
  gramWeight: number | null;
  milliliterVolume: number | null;
  label: string | null;
  sourceEvidence: unknown;
};

export type FoodCatalogTaxonomyEvidence = {
  taxonomy: string;
  sourceCode: string | null;
  mappedTaxonomyId: string | null;
};

export type FoodCatalogCandidateInput = {
  sourceRecordId: string;
  sourceReference: string | null;
  sourceRecordChecksumSha256: string | null;
  canonicalName: string;
  brandName: string | null;
  servingLabel: string | null;
  category: string | null;
  cuisine: string | null;
  nutrition: FoodCatalogNutrition;
  aliases: FoodCatalogAliasInput[];
  names?: FoodCatalogNameEvidenceInput[];
  identityEvidence?: FoodCatalogIdentityEvidence;
  servings?: FoodCatalogServingEvidence[];
  taxonomyEvidence?: FoodCatalogTaxonomyEvidence[];
  gtins: string[];
  marketScopes: FoodCatalogMarketScope[];
  globallyRelevant: boolean;
  sourceNutrition: unknown;
  sourceServing: unknown;
};

export type FoodCatalogNormalizedCandidate = Omit<
  FoodCatalogCandidateInput,
  "aliases" | "names" | "identityEvidence" | "servings" | "taxonomyEvidence"
> & {
  aliases: FoodCatalogAlias[];
  names: FoodCatalogNameEvidence[];
  identityEvidence: FoodCatalogIdentityEvidence;
  servings: FoodCatalogServingEvidence[];
  taxonomyEvidence: FoodCatalogTaxonomyEvidence[];
};

export type FoodCatalogValidationIssueCode =
  | "missing_name"
  | "missing_source_id"
  | "invalid_source_checksum"
  | "invalid_nutrition"
  | "invalid_basis"
  | "invalid_alias"
  | "invalid_gtin"
  | "invalid_gtin_check_digit"
  | "invalid_market_scope"
  | "duplicate_gtin_in_candidate"
  | "suspicious_calorie_macro_delta";

export type FoodCatalogValidationIssue = {
  code: FoodCatalogValidationIssueCode;
  severity: "error" | "warning";
  field: string | null;
};

export type FoodCatalogCanonicalDecision =
  | { kind: "match"; foodId: string }
  | { kind: "create" }
  | { kind: "possible_duplicate"; candidateFoodIds: string[] }
  | { kind: "reject"; issueCodes: FoodCatalogValidationIssueCode[] };

export type FoodCatalogProcessingDisposition =
  | { kind: "accept"; reasonCodes: string[] }
  | { kind: "quarantine"; reasonCodes: string[] }
  | { kind: "reject"; reasonCodes: string[] };

export type FoodCatalogDryRunManifestCandidate = {
  candidate: FoodCatalogNormalizedCandidate;
  issues: FoodCatalogValidationIssue[];
  decision: FoodCatalogCanonicalDecision;
  disposition: FoodCatalogProcessingDisposition;
};

export type FoodCatalogExpectedMutationCounts = {
  input: number;
  accepted: number;
  rejected: number;
  matched: number;
  created: number;
  possibleDuplicate: number;
  quarantined: number;
};

export type FoodCatalogDryRunManifestContent = {
  source: FoodCatalogSourceDescriptor;
  candidates: FoodCatalogDryRunManifestCandidate[];
  expectedMutations: FoodCatalogExpectedMutationCounts;
};

export type FoodCatalogDryRunManifestEnvelope = {
  content: FoodCatalogDryRunManifestContent;
  manifestContentChecksumSha256: string;
  generatedAt: string;
  runId: string | null;
  diagnosticsLocation: string | null;
};
