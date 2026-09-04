import { createHash } from "node:crypto";
import type {
  FoodCatalogCanonicalDecision,
  FoodCatalogNormalizedCandidate
} from "./contracts";
import type { FoodCatalogProcessingDisposition } from "./quarantine";

export type FoodCatalogReleaseDiffClassification =
  | "unchanged"
  | "source_record_added"
  | "source_record_removed"
  | "source_record_changed"
  | "nutrition_changed"
  | "serving_changed"
  | "naming_changed"
  | "barcode_changed"
  | "taxonomy_changed"
  | "market_evidence_changed"
  | "canonical_match_changed"
  | "newly_quarantined"
  | "quarantine_resolved"
  | "suspicious_material_change";

export type FoodCatalogReleaseRecord = {
  sourceRecordId: string;
  candidate: FoodCatalogNormalizedCandidate;
  decision: FoodCatalogCanonicalDecision;
  disposition: FoodCatalogProcessingDisposition;
};

export type FoodCatalogReleaseDiffEntry = {
  sourceRecordId: string;
  classifications: FoodCatalogReleaseDiffClassification[];
};

export type FoodCatalogReleaseDiffReport = {
  previousBatchIdentity: string;
  nextBatchIdentity: string;
  entries: FoodCatalogReleaseDiffEntry[];
  checksumSha256: string;
};

export type DiffFoodCatalogReleasesInput = {
  previousBatchIdentity: string;
  nextBatchIdentity: string;
  previousRecords: readonly FoodCatalogReleaseRecord[];
  nextRecords: readonly FoodCatalogReleaseRecord[];
};

const CLASSIFICATION_ORDER: readonly FoodCatalogReleaseDiffClassification[] = [
  "source_record_changed",
  "nutrition_changed",
  "serving_changed",
  "naming_changed",
  "barcode_changed",
  "taxonomy_changed",
  "market_evidence_changed",
  "canonical_match_changed",
  "newly_quarantined",
  "quarantine_resolved",
  "suspicious_material_change"
];

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

function changed(left: unknown, right: unknown): boolean {
  return stableJson(left) !== stableJson(right);
}

function addClassification(
  classifications: Set<FoodCatalogReleaseDiffClassification>,
  condition: boolean,
  classification: FoodCatalogReleaseDiffClassification
): void {
  if (condition) classifications.add(classification);
}

function candidateClassifications(
  previous: FoodCatalogReleaseRecord,
  next: FoodCatalogReleaseRecord
): FoodCatalogReleaseDiffClassification[] {
  const classifications = new Set<FoodCatalogReleaseDiffClassification>();

  addClassification(
    classifications,
    changed(
      {
        sourceReference: previous.candidate.sourceReference,
        sourceRecordChecksumSha256: previous.candidate.sourceRecordChecksumSha256,
        identityEvidence: previous.candidate.identityEvidence
      },
      {
        sourceReference: next.candidate.sourceReference,
        sourceRecordChecksumSha256: next.candidate.sourceRecordChecksumSha256,
        identityEvidence: next.candidate.identityEvidence
      }
    ),
    "source_record_changed"
  );
  addClassification(
    classifications,
    changed(previous.candidate.nutrition, next.candidate.nutrition),
    "nutrition_changed"
  );
  addClassification(
    classifications,
    changed(
      {
        servingLabel: previous.candidate.servingLabel,
        servings: previous.candidate.servings,
        sourceServing: previous.candidate.sourceServing
      },
      {
        servingLabel: next.candidate.servingLabel,
        servings: next.candidate.servings,
        sourceServing: next.candidate.sourceServing
      }
    ),
    "serving_changed"
  );
  addClassification(
    classifications,
    changed(
      {
        canonicalName: previous.candidate.canonicalName,
        brandName: previous.candidate.brandName,
        aliases: previous.candidate.aliases,
        names: previous.candidate.names
      },
      {
        canonicalName: next.candidate.canonicalName,
        brandName: next.candidate.brandName,
        aliases: next.candidate.aliases,
        names: next.candidate.names
      }
    ),
    "naming_changed"
  );
  addClassification(
    classifications,
    changed(previous.candidate.gtins, next.candidate.gtins),
    "barcode_changed"
  );
  addClassification(
    classifications,
    changed(
      {
        category: previous.candidate.category,
        cuisine: previous.candidate.cuisine,
        taxonomyEvidence: previous.candidate.taxonomyEvidence
      },
      {
        category: next.candidate.category,
        cuisine: next.candidate.cuisine,
        taxonomyEvidence: next.candidate.taxonomyEvidence
      }
    ),
    "taxonomy_changed"
  );
  addClassification(
    classifications,
    changed(
      {
        marketScopes: previous.candidate.marketScopes,
        globallyRelevant: previous.candidate.globallyRelevant
      },
      {
        marketScopes: next.candidate.marketScopes,
        globallyRelevant: next.candidate.globallyRelevant
      }
    ),
    "market_evidence_changed"
  );
  addClassification(
    classifications,
    changed(previous.decision, next.decision),
    "canonical_match_changed"
  );

  const wasQuarantined = previous.disposition.kind === "quarantine";
  const isQuarantined = next.disposition.kind === "quarantine";
  addClassification(classifications, !wasQuarantined && isQuarantined, "newly_quarantined");
  addClassification(classifications, wasQuarantined && !isQuarantined, "quarantine_resolved");

  const materialDimensionCount = [
    "source_record_changed",
    "nutrition_changed",
    "serving_changed",
    "naming_changed",
    "barcode_changed",
    "taxonomy_changed",
    "market_evidence_changed",
    "canonical_match_changed"
  ].filter((classification) =>
    classifications.has(classification as FoodCatalogReleaseDiffClassification)
  ).length;
  if (materialDimensionCount >= 3) classifications.add("suspicious_material_change");

  if (classifications.size === 0) return ["unchanged"];
  return CLASSIFICATION_ORDER.filter((classification) => classifications.has(classification));
}

function toUniqueRecordMap(
  records: readonly FoodCatalogReleaseRecord[]
): Map<string, FoodCatalogReleaseRecord> {
  const result = new Map<string, FoodCatalogReleaseRecord>();
  for (const record of records) {
    const existing = result.get(record.sourceRecordId);
    if (existing !== undefined && stableJson(existing) !== stableJson(record)) {
      throw new Error(`Conflicting release records for sourceRecordId ${record.sourceRecordId}.`);
    }
    result.set(record.sourceRecordId, record);
  }
  return result;
}

export function diffFoodCatalogReleases({
  previousBatchIdentity,
  nextBatchIdentity,
  previousRecords,
  nextRecords
}: DiffFoodCatalogReleasesInput): FoodCatalogReleaseDiffReport {
  const previousById = toUniqueRecordMap(previousRecords);
  const nextById = toUniqueRecordMap(nextRecords);
  const sourceRecordIds = [...new Set([...previousById.keys(), ...nextById.keys()])]
    .sort((left, right) => left.localeCompare(right));

  const entries = sourceRecordIds.map((sourceRecordId): FoodCatalogReleaseDiffEntry => {
    const previous = previousById.get(sourceRecordId);
    const next = nextById.get(sourceRecordId);
    if (previous === undefined) return { sourceRecordId, classifications: ["source_record_added"] };
    if (next === undefined) return { sourceRecordId, classifications: ["source_record_removed"] };
    return { sourceRecordId, classifications: candidateClassifications(previous, next) };
  });

  const checksumSha256 = createHash("sha256")
    .update(stableJson({ previousBatchIdentity, nextBatchIdentity, entries }))
    .digest("hex");

  return { previousBatchIdentity, nextBatchIdentity, entries, checksumSha256 };
}
