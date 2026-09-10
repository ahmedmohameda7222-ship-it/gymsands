import { sha256Hex } from "./canonicalize";
import {
  computeSnapshotBoundarySha256,
  PORTABLE_CANONICAL_REGISTRY_AUTHORITY,
  type PortableExportManifestV1,
  validatePortableManifestV1,
} from "./export-contract";
import {
  canonicalRulesForProfile,
  validateCanonicalProfileManifest,
} from "./profile-certification";

export type PortableArtifactMaterial = string | Uint8Array;

export type PortableArtifactValidationInput = Readonly<{
  manifest: PortableExportManifestV1;
  materials: Readonly<Record<string, PortableArtifactMaterial | undefined>>;
  /** Diagnostic-only override. Canonical artifacts always derive their required set from the registry. */
  requiredSegments?: readonly string[];
}>;

export type PortableArtifactValidationResult = Readonly<{
  valid: true;
  profile: PortableExportManifestV1["profile"];
  segmentCount: number;
  rowCount: number;
  semanticRootSha256: string;
  canonicalProfileVerified: boolean;
  certificationEligible: boolean;
}>;

function materialBytes(material: PortableArtifactMaterial): Uint8Array {
  return typeof material === "string" ? new TextEncoder().encode(material) : material;
}

function semanticDigest(material: PortableArtifactMaterial): string {
  return sha256Hex(materialBytes(material));
}

function countCanonicalRows(material: PortableArtifactMaterial): number {
  const text = typeof material === "string" ? material : new TextDecoder("utf-8", { fatal: true }).decode(material);
  if (text.length === 0) return 0;
  if (!text.endsWith("\n")) throw new Error("Portable segment canonical bytes must end with a newline.");
  const rows = text.slice(0, -1).split("\n");
  if (rows.some((row) => row.length === 0)) throw new Error("Portable segment contains an empty canonical row.");
  return rows.length;
}

export function validatePortableArtifact({
  manifest,
  materials,
  requiredSegments,
}: PortableArtifactValidationInput): PortableArtifactValidationResult {
  const canonical = manifest.registryAuthority === PORTABLE_CANONICAL_REGISTRY_AUTHORITY;
  const effectiveRequiredSegments = canonical
    ? canonicalRulesForProfile(manifest.profile).map((rule) => rule.segment)
    : [...(requiredSegments ?? [])];

  if (canonical) validateCanonicalProfileManifest(manifest);
  validatePortableManifestV1(manifest, { requiredSegments: effectiveRequiredSegments });

  const { sha256: _declaredBoundarySha, ...boundaryWithoutSha } = manifest.snapshotBoundary;
  const expectedBoundarySha = computeSnapshotBoundarySha256(boundaryWithoutSha);
  if (manifest.snapshotBoundary.sha256 !== expectedBoundarySha) {
    throw new Error("Snapshot boundary digest mismatch; artifact is corrupt or inconsistently bound.");
  }

  let totalRows = 0;
  for (const segment of manifest.segments) {
    if (segment.loadMode === "DERIVED_REBUILD") continue;
    const material = materials[segment.name];
    if (material === undefined) {
      if (segment.required) throw new Error(`Missing required portable segment material: ${segment.name}.`);
      continue;
    }
    const digest = semanticDigest(material);
    if (digest !== segment.plaintextSemanticSha256) {
      throw new Error(`Semantic digest mismatch for ${segment.name}; artifact material is corrupt.`);
    }
    const rows = countCanonicalRows(material);
    if (rows !== segment.rowCount) {
      throw new Error(`Row count mismatch for ${segment.name}: expected ${segment.rowCount}, got ${rows}.`);
    }
    totalRows += rows;
  }

  return Object.freeze({
    valid: true,
    profile: manifest.profile,
    segmentCount: manifest.segments.length,
    rowCount: totalRows,
    semanticRootSha256: manifest.semanticRootSha256,
    canonicalProfileVerified: canonical,
    certificationEligible: canonical,
  });
}