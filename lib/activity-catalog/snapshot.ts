import type { CatalogAuthoritySnapshot, CatalogSchemaAuthority, LibraryActivityDetail } from "./library-types";

function schemaAuthority(value: LibraryActivityDetail["prescriptionSchema"] | LibraryActivityDetail["performedMetricSchema"]): CatalogSchemaAuthority | null {
  if (!value) return null;
  return {
    ...(value.id ? { id: value.id } : {}),
    key: value.key,
    version: value.version,
    checksum: value.checksum ?? null
  };
}

function cloneRecord(value: Record<string, unknown> | null | undefined) {
  return value ? structuredClone(value) : null;
}

export function buildCatalogAuthoritySnapshot(detail: LibraryActivityDetail): CatalogAuthoritySnapshot {
  if (!detail.authority) {
    throw new Error("Native Catalog detail is missing immutable release/revision authority.");
  }
  return {
    libraryRelease: { ...detail.authority.libraryRelease },
    catalogRelease: { ...detail.authority.catalogRelease },
    activityId: detail.authority.activityId,
    revisionId: detail.authority.revisionId,
    revisionNumber: detail.authority.revisionNumber,
    prescriptionSchema: schemaAuthority(detail.prescriptionSchema),
    performedMetricSchema: schemaAuthority(detail.performedMetricSchema),
    recordDefinitions: structuredClone(detail.recordDefinitions ?? []),
    mappingAuthority: cloneRecord(detail.heatMap),
    publicationPolicy: cloneRecord(detail.publicationPolicy ?? null),
    capabilityContract: cloneRecord(detail.capabilityContract ?? null)
  };
}
