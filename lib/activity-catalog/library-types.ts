import type { CatalogLocale } from "@/lib/activity-catalog/catalog-locale";

export type LibraryReleaseMetadata = {
  id: string;
  version: string;
  checksum: string;
  publishedAt: string;
  strengthSemanticFingerprint: string;
};

export type LibraryCatalogReleaseMetadata = {
  id: string;
  version: string;
  checksum: string;
};

export type LibraryResponseMeta = {
  apiVersion: "v2" | "v1-compat";
  locale: string;
  libraryRelease: LibraryReleaseMetadata | null;
  catalogRelease: LibraryCatalogReleaseMetadata | null;
};

export type LibraryProviderSource = "library_v2" | "legacy" | "external";
export type LibraryFallbackReason =
  | "catalog_timeout"
  | "catalog_network_error"
  | "catalog_rate_limited"
  | "catalog_upstream_error"
  | "catalog_not_found";
export type LibraryProviderMeta = LibraryResponseMeta & {
  source: LibraryProviderSource;
  degraded: boolean;
  primarySource?: LibraryProviderSource;
  fallbackUsed?: boolean;
  fallbackReason?: LibraryFallbackReason | null;
};

export type LibraryDomain = {
  key: string;
  displayName: string;
  coverageCount: number;
  ownedMovementCanonicalCount: number;
  archetypeCount: number;
  membershipCount: number;
  authorityKind: string;
  checksum: string;
  tabs: unknown[];
};

export type LibraryJsonValue =
  | string
  | number
  | boolean
  | null
  | LibraryJsonValue[]
  | { [key: string]: LibraryJsonValue };

export type LibraryDomainFilterDefinition = {
  slug: string;
  kind: "enum" | "multi_enum" | "range" | "capability";
  options: LibraryJsonValue[];
  displayOrder: number;
};

export type LibraryEnvironmentCapabilityDefinition = {
  key: string;
  valueKind: "enum" | "boolean" | "equipment_set";
  allowedValues: LibraryJsonValue[];
  temporaryOverrideAllowed: boolean;
  precedence: "available_today_over_saved_setup" | "saved_setup_only" | "context_only";
};

/** Canonical object returned by the Activity Catalog V2 domain filter endpoint. */
export type LibraryDomainFilters = {
  domain: string;
  filters: LibraryDomainFilterDefinition[];
  environmentCapabilities: LibraryEnvironmentCapabilityDefinition[];
  availableTodayPrimaryControl: boolean;
};

export type LibraryInstruction = { order: number; text: string };
export type LibraryEquipmentRequirement = "required" | "optional" | string;
export type LibraryEquipment = {
  slug: string | null;
  name: string | null;
  requirement: LibraryEquipmentRequirement | null;
};

export type LibraryCoverageRole = "primary" | "secondary" | "stabilizer" | "focus" | string;
export type LibraryCoverage = {
  slug?: string | null;
  name?: string | null;
  muscleName?: string | null;
  label?: string | null;
  role?: LibraryCoverageRole | null;
  bodyRegion?: string | null;
  targetId?: string | null;
  atlasTargetId?: string | null;
  side?: string | null;
  [key: string]: unknown;
};

export type LibraryExecutionProfile = {
  key?: string | null;
  slug?: string | null;
  version?: number | null;
  executionContract?: string | null;
  metrics?: string[];
  [key: string]: unknown;
};

export type LibraryActivity = {
  id: string;
  revisionId: string;
  revisionNumber: number;
  revisionLifecycle: string;
  revisionChecksum?: string | null;
  slug: string;
  name: string;
  shortDescription: string | null;
  instructions: LibraryInstruction[];
  difficulty: string | null;
  movementPattern: string | null;
  mechanics?: string | null;
  forceType?: string | null;
  activityType?: { slug: string; name: string } | null;
  membership: { kind: string; visibility: string; domainPriority: number; primaryDomain: boolean; checksum?: string };
  aliases: Array<Record<string, unknown>>;
  equipment: LibraryEquipment[];
  coverage: LibraryCoverage[];
  executionProfiles: LibraryExecutionProfile[];
  bodyEffects: Array<Record<string, unknown>>;
};

export type CatalogSchemaField = {
  key?: string;
  slug?: string;
  label?: string;
  type?: string;
  unit?: string | null;
  required?: boolean;
  minimum?: number | null;
  maximum?: number | null;
  min?: number | null;
  max?: number | null;
  options?: unknown[];
  [key: string]: unknown;
};

export type CatalogSchemaAuthority = {
  id?: string | null;
  key: string;
  version: number;
  checksum?: string | null;
};

export type LibraryRecordDefinition = {
  id?: string | null;
  recordKey?: string | null;
  key?: string | null;
  version?: number | null;
  comparisonDirection?: string | null;
  canonicalUnit?: string | null;
  [key: string]: unknown;
};

export type LibraryHeatMapMapping = {
  role?: LibraryCoverageRole | null;
  targetId?: string | null;
  atlasTargetId?: string | null;
  muscleName?: string | null;
  name?: string | null;
  side?: string | null;
  [key: string]: unknown;
};

export type LibraryHeatMap = {
  mapping?: LibraryHeatMapMapping[];
  [key: string]: unknown;
};

export type LibrarySemanticAuthority = {
  prescriptionSchema?: CatalogSchemaAuthority & { fields?: CatalogSchemaField[] } | null;
  performedMetricSchema?: CatalogSchemaAuthority & { fields?: CatalogSchemaField[]; contextDimensions?: unknown[] } | null;
  recordDefinitions?: LibraryRecordDefinition[];
  heatMap?: LibraryHeatMap | null;
  publicationPolicy?: { id?: string | null; key: string; version: number; checksum: string } | null;
  capabilityContract?: { id?: string | null; version: string; compatibleCatalogApiVersion: string; checksum: string } | null;
  authority?: {
    libraryRelease: Pick<LibraryReleaseMetadata, "id" | "version" | "checksum">;
    catalogRelease: Pick<LibraryCatalogReleaseMetadata, "id" | "version" | "checksum">;
    activityId: string;
    revisionId: string;
    revisionNumber: number;
    releaseItemChecksum?: string;
  };
};

/** Full semantic Library authority. `domain` is supplied by domain and global detail routes. */
export type LibraryActivityDetail = LibraryActivity & LibrarySemanticAuthority & { domain?: string };
export type LibraryCursorPage = { limit: number; returned: number; nextCursor: string | null };
export type LibrarySearchParams = {
  domain: string;
  locale?: CatalogLocale;
  query?: string;
  visibility?: "default" | "searchable" | "advanced" | "hidden";
  limit?: number;
  cursor?: string;
};
export type LibraryAlternative = {
  relationshipType: string;
  rationale: string | null;
  prescriptionTransfer: unknown;
  relationshipChecksum?: string | null;
  activity: LibraryActivityDetail;
};
export type LibraryResult<T> = { data: T; meta: LibraryProviderMeta };
export type LibrarySearchResult = LibraryResult<LibraryActivity[]> & { pagination: LibraryCursorPage; restarted?: boolean };

export type CatalogAuthoritySnapshot = {
  libraryRelease: Pick<LibraryReleaseMetadata, "id" | "version" | "checksum">;
  catalogRelease: Pick<LibraryCatalogReleaseMetadata, "id" | "version" | "checksum">;
  activityId: string;
  revisionId: string;
  revisionNumber: number;
  prescriptionSchema: CatalogSchemaAuthority | null;
  performedMetricSchema: CatalogSchemaAuthority | null;
  recordDefinitions: LibraryRecordDefinition[];
  mappingAuthority: Record<string, unknown> | null;
  publicationPolicy: Record<string, unknown> | null;
  capabilityContract: Record<string, unknown> | null;
};