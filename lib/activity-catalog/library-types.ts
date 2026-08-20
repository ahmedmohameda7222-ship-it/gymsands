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

export type LibraryDomainFilters = {
  domain: string;
  filters: LibraryDomainFilterDefinition[];
  environmentCapabilities: LibraryEnvironmentCapabilityDefinition[];
  availableTodayPrimaryControl: boolean;
};

export type LibraryInstruction = { order: number; text: string };
export type LibraryEquipment = { slug: string | null; name: string | null; requirement: string | null };

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
  activityType?: { slug: string; name: string } | null;
  membership: { kind: string; visibility: string; domainPriority: number; primaryDomain: boolean; checksum?: string };
  aliases: Array<Record<string, unknown>>;
  equipment: LibraryEquipment[];
  coverage: Array<Record<string, unknown>>;
  executionProfiles: Array<Record<string, unknown>>;
  bodyEffects: Array<Record<string, unknown>>;
};

export type CatalogSchemaAuthority = {
  id?: string | null;
  key: string;
  version: number;
  checksum?: string | null;
};

export type LibrarySemanticAuthority = {
  prescriptionSchema?: CatalogSchemaAuthority & { fields?: unknown[] } | null;
  performedMetricSchema?: CatalogSchemaAuthority & { fields?: unknown[]; contextDimensions?: unknown[] } | null;
  recordDefinitions?: Array<Record<string, unknown>>;
  heatMap?: Record<string, unknown> | null;
  publicationPolicy?: { id?: string | null; key: string; version: number; checksum: string } | null;
  capabilityContract?: { id?: string | null; version: string; compatibleCatalogApiVersion: string; checksum: string } | null;
  authority?: {
    libraryRelease: Pick<LibraryReleaseMetadata, "id" | "version" | "checksum">;
    catalogRelease: Pick<LibraryCatalogReleaseMetadata, "id" | "version" | "checksum">;
    activityId: string;
    revisionId: string;
    revisionNumber: number;
  };
};

export type LibraryActivityDetail = LibraryActivity & LibrarySemanticAuthority;
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
  recordDefinitions: Array<Record<string, unknown>>;
  mappingAuthority: Record<string, unknown> | null;
  publicationPolicy: Record<string, unknown> | null;
  capabilityContract: Record<string, unknown> | null;
};