export const MAIN_ACTIVITY_CATALOG_V2_CAPABILITY = Object.freeze({
  contractVersion: "main-activity-catalog-v2-capability-v1",
  sourceMainSha: "6ec12497612446a9a9dd6cc1d91709cc8f045b22",
  compatibleCatalogApiVersion: "v2" as const,
  supportedWorkloadModels: [
    {
      modelKey: "resistance_sets",
      modelVersion: "v1",
      mainRuntimeConstant: "resistance_sets_v1",
      engineVersion: "muscle_load_resistance_sets_v2"
    }
  ] as const,
  supportedPrFormulas: [] as const
});

export type CatalogV2RecordDefinition = {
  id: string;
  recordKey: string;
  version: string;
  sourceMetricKeys: string[];
  calculationKind: string;
  formulaKey: string;
  formulaVersion: string;
  comparisonDirection: "higher_better" | "lower_better" | "not_comparable";
  canonicalUnit: string | null;
  contextDimensions: string[];
  fixedContext: Record<string, unknown>;
  invalidConditions: unknown[];
};

export type CatalogV2MetricSchema = {
  key: string;
  version: string;
  fields: unknown[];
};

export type CatalogV2PerformedSchema = CatalogV2MetricSchema & {
  contextDimensions: unknown[];
};

export type CatalogV2HeatMap =
  | { policy: "not_applicable" }
  | {
      policy: "required";
      mappingProfileId: string;
      mappingSchemaVersion: string;
      mappingProfileVersion: number;
      mappingChecksum: string;
      taxonomy: { key: string; version: string };
      workloadModel: { key: string; version: string };
      mapping: Array<{
        muscleId: string;
        role: "primary" | "secondary" | "stabilizer";
        contribution: number;
        sideScope: "bilateral" | "left" | "right";
        sortOrder: number;
      }>;
    };

export type CatalogV2Activity = {
  id: string;
  slug: string;
  revisionId: string;
  revisionNumber: number;
  name: string;
  shortDescription: string | null;
  instructions: unknown[];
  prescriptionSchema: CatalogV2MetricSchema;
  performedMetricSchema: CatalogV2PerformedSchema;
  recordDefinitions: CatalogV2RecordDefinition[];
  heatMap: CatalogV2HeatMap;
  publicationPolicyVersion: string;
  capabilityContractVersion: string;
  releaseId: string;
  releaseVersion: string;
  releaseChecksum: string;
};

export type CatalogV2Envelope<T> = {
  data: T;
  meta: {
    apiVersion: "v2";
    locale: "en" | "de" | "ar" | "tr";
    release?: {
      id: string;
      version: string;
      checksum: string;
      taxonomy: { key: string; version: string };
      capabilityContractVersion: string;
      publicationPolicy: { key: string; version: string };
    };
  };
};

export type DormantV2SnapshotAuthority = {
  catalogReleaseId: string;
  catalogReleaseChecksum: string;
  catalogActivityId: string;
  catalogActivityRevisionId: string;
  catalogActivityRevisionNumber: number;
  prescriptionSchema: { key: string; version: string };
  performedMetricSchema: { key: string; version: string };
  recordDefinitionIds: string[];
  mappingProfileId: string | null;
  taxonomy: { key: string; version: string } | null;
  workloadModel: { key: string; version: string } | null;
  publicationPolicyVersion: string;
  capabilityContractVersion: string;
};

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid Catalog V2 ${label}.`);
  return value as Record<string, unknown>;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.length) throw new Error(`Invalid Catalog V2 ${label}.`);
  return value;
}
function uuid(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed)) throw new Error(`Invalid Catalog V2 ${label}.`);
  return parsed;
}
function checksum(value: unknown, label: string): string {
  const parsed = string(value, label);
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new Error(`Invalid Catalog V2 ${label}.`);
  return parsed;
}
function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid Catalog V2 ${label}.`);
  return value;
}

function parseRecordDefinition(value: unknown): CatalogV2RecordDefinition {
  const input = object(value, "record definition");
  const comparison = string(input.comparisonDirection, "record comparison direction");
  if (!["higher_better", "lower_better", "not_comparable"].includes(comparison)) throw new Error("Invalid Catalog V2 record comparison direction.");
  return {
    id: uuid(input.id, "record definition id"),
    recordKey: string(input.recordKey, "record key"),
    version: string(input.version, "record definition version"),
    sourceMetricKeys: array(input.sourceMetricKeys, "record source metrics").map((item) => string(item, "record source metric")),
    calculationKind: string(input.calculationKind, "record calculation kind"),
    formulaKey: string(input.formulaKey, "record formula key"),
    formulaVersion: string(input.formulaVersion, "record formula version"),
    comparisonDirection: comparison as CatalogV2RecordDefinition["comparisonDirection"],
    canonicalUnit: input.canonicalUnit === null ? null : string(input.canonicalUnit, "record canonical unit"),
    contextDimensions: array(input.contextDimensions, "record context dimensions").map((item) => string(item, "record context dimension")),
    fixedContext: object(input.fixedContext, "record fixed context"),
    invalidConditions: array(input.invalidConditions, "record invalid conditions")
  };
}

function parseHeatMap(value: unknown): CatalogV2HeatMap {
  const input = object(value, "Heat Map authority");
  const policy = string(input.policy, "Heat Map policy");
  if (policy === "not_applicable") return { policy };
  if (policy !== "required") throw new Error("Invalid Catalog V2 Heat Map policy.");
  const taxonomy = object(input.taxonomy, "taxonomy");
  const model = object(input.workloadModel, "workload model");
  return {
    policy,
    mappingProfileId: uuid(input.mappingProfileId, "mapping profile id"),
    mappingSchemaVersion: string(input.mappingSchemaVersion, "mapping schema version"),
    mappingProfileVersion: Number(input.mappingProfileVersion),
    mappingChecksum: checksum(input.mappingChecksum, "mapping checksum"),
    taxonomy: { key: string(taxonomy.key, "taxonomy key"), version: string(taxonomy.version, "taxonomy version") },
    workloadModel: { key: string(model.key, "workload model key"), version: string(model.version, "workload model version") },
    mapping: array(input.mapping, "mapping entries").map((entry) => {
      const row = object(entry, "mapping entry");
      const role = string(row.role, "mapping role");
      const sideScope = string(row.sideScope, "mapping side scope");
      if (!["primary", "secondary", "stabilizer"].includes(role)) throw new Error("Invalid Catalog V2 mapping role.");
      if (!["bilateral", "left", "right"].includes(sideScope)) throw new Error("Invalid Catalog V2 side scope.");
      return {
        muscleId: string(row.muscleId, "mapping muscle id"),
        role: role as "primary" | "secondary" | "stabilizer",
        contribution: Number(row.contribution),
        sideScope: sideScope as "bilateral" | "left" | "right",
        sortOrder: Number(row.sortOrder)
      };
    })
  };
}

export function parseCatalogV2ActivityEnvelope(value: unknown): CatalogV2Envelope<CatalogV2Activity> {
  const root = object(value, "envelope");
  const data = object(root.data, "activity");
  const meta = object(root.meta, "meta");
  if (meta.apiVersion !== "v2") throw new Error("Invalid Catalog V2 apiVersion.");
  const locale = string(meta.locale, "locale");
  if (!["en", "de", "ar", "tr"].includes(locale)) throw new Error("Invalid Catalog V2 locale.");
  const prescription = object(data.prescriptionSchema, "prescription schema");
  const performed = object(data.performedMetricSchema, "performed metric schema");
  const activity: CatalogV2Activity = {
    id: uuid(data.id, "activity id"),
    slug: string(data.slug, "activity slug"),
    revisionId: uuid(data.revisionId, "activity revision id"),
    revisionNumber: Number(data.revisionNumber),
    name: string(data.name, "activity name"),
    shortDescription: data.shortDescription === null ? null : string(data.shortDescription, "short description"),
    instructions: array(data.instructions, "instructions"),
    prescriptionSchema: {
      key: string(prescription.key, "prescription schema key"),
      version: string(prescription.version, "prescription schema version"),
      fields: array(prescription.fields, "prescription fields")
    },
    performedMetricSchema: {
      key: string(performed.key, "performed schema key"),
      version: string(performed.version, "performed schema version"),
      fields: array(performed.fields, "performed fields"),
      contextDimensions: array(performed.contextDimensions, "performed context dimensions")
    },
    recordDefinitions: array(data.recordDefinitions, "record definitions").map(parseRecordDefinition),
    heatMap: parseHeatMap(data.heatMap),
    publicationPolicyVersion: string(data.publicationPolicyVersion, "publication policy version"),
    capabilityContractVersion: string(data.capabilityContractVersion, "capability contract version"),
    releaseId: uuid(data.releaseId, "release id"),
    releaseVersion: string(data.releaseVersion, "release version"),
    releaseChecksum: checksum(data.releaseChecksum, "release checksum")
  };
  if (!Number.isInteger(activity.revisionNumber) || activity.revisionNumber < 1) throw new Error("Invalid Catalog V2 revision number.");
  return { data: activity, meta: { apiVersion: "v2", locale: locale as CatalogV2Envelope<unknown>["meta"]["locale"] } };
}

export function toDormantV2SnapshotAuthority(activity: CatalogV2Activity): DormantV2SnapshotAuthority {
  const requiredHeatMap = activity.heatMap.policy === "required" ? activity.heatMap : null;
  return {
    catalogReleaseId: activity.releaseId,
    catalogReleaseChecksum: activity.releaseChecksum,
    catalogActivityId: activity.id,
    catalogActivityRevisionId: activity.revisionId,
    catalogActivityRevisionNumber: activity.revisionNumber,
    prescriptionSchema: { key: activity.prescriptionSchema.key, version: activity.prescriptionSchema.version },
    performedMetricSchema: { key: activity.performedMetricSchema.key, version: activity.performedMetricSchema.version },
    recordDefinitionIds: activity.recordDefinitions.map((definition) => definition.id),
    mappingProfileId: requiredHeatMap?.mappingProfileId ?? null,
    taxonomy: requiredHeatMap?.taxonomy ?? null,
    workloadModel: requiredHeatMap?.workloadModel ?? null,
    publicationPolicyVersion: activity.publicationPolicyVersion,
    capabilityContractVersion: activity.capabilityContractVersion
  };
}
