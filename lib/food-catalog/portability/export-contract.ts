import { canonicalizePostgresScalar, sha256Hex } from "./canonicalize";

export const PORTABLE_EXPORT_FORMAT = "plaivra-food-catalog-portable-export" as const;
export const PORTABLE_EXPORT_FORMAT_VERSION = 1 as const;
export const PORTABLE_CANONICALIZATION_VERSION = 1 as const;

export type PortableExportProfile = "CORE_PORTABLE" | "FULL_DR";
export type PortableRelationClassification =
  | "PORTABLE_AUTHORITY"
  | "PORTABLE_AUDIT_HISTORY"
  | "TRANSITIONAL_PORTABLE_COMPATIBILITY"
  | "PROTECTED_PORTABLE_AUTHORITY"
  | "PROTECTED_PORTABLE_AUDIT_HISTORY"
  | "DERIVED_REBUILD"
  | "REFERENCE_ONLY";
export type PortableLoadMode =
  | "VALIDATE_PRESEEDED"
  | "RESTORE_EXACT"
  | "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION"
  | "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY"
  | "DERIVED_REBUILD";

export type PortableSegmentEncryptionV1 = Readonly<{
  algorithm: "AES-256-GCM";
  keyId: string;
  nonceBase64: string;
  authTagBase64: string;
}>;

export type PortableSegmentDescriptorV1 = Readonly<{
  name: string;
  relation: string;
  classification: PortableRelationClassification;
  loadMode: PortableLoadMode;
  stableKey: readonly string[];
  rowCount: number;
  plaintextSemanticSha256: string;
  snapshotBoundarySha256: string;
  required: boolean;
  protected: boolean;
  ciphertextTransportSha256?: string;
  encryption?: PortableSegmentEncryptionV1;
}>;

export type PortableSnapshotBoundaryV1 = Readonly<{
  environment: string;
  postgresSnapshot: string;
  capturedAt: string;
  migrationCount: string;
  latestMigration: string;
  migrationLedgerIdentity: string;
  currentGenerationId: string | null;
  pointerRevision: string;
  compatibilityVersion: string;
  compatibilityMarker: string;
  sha256: string;
}>;

export type PortableExportManifestV1 = {
  format: typeof PORTABLE_EXPORT_FORMAT;
  formatVersion: typeof PORTABLE_EXPORT_FORMAT_VERSION;
  canonicalizationVersion: typeof PORTABLE_CANONICALIZATION_VERSION;
  profile: PortableExportProfile;
  sourceRepositoryCommit: string;
  sourceSchemaFingerprintSha256: string;
  capturedAt: string;
  snapshotBoundary: PortableSnapshotBoundaryV1;
  segments: PortableSegmentDescriptorV1[];
  semanticRootSha256: string;
  certification?: Readonly<{
    artifactValid: boolean;
    restoreVerified: boolean;
    drReady: boolean;
  }>;
};

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const LOAD_MODES = new Set<PortableLoadMode>([
  "VALIDATE_PRESEEDED",
  "RESTORE_EXACT",
  "RESTORE_EXACT_WITH_TRANSIENT_NEUTRALIZATION",
  "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY",
  "DERIVED_REBUILD",
]);
const CLASSIFICATIONS = new Set<PortableRelationClassification>([
  "PORTABLE_AUTHORITY",
  "PORTABLE_AUDIT_HISTORY",
  "TRANSITIONAL_PORTABLE_COMPATIBILITY",
  "PROTECTED_PORTABLE_AUTHORITY",
  "PROTECTED_PORTABLE_AUDIT_HISTORY",
  "DERIVED_REBUILD",
  "REFERENCE_ONLY",
]);
const SECRET_KEY = /(password|passwd|secret|credential|private[_-]?key|access[_-]?token|refresh[_-]?token|service[_-]?role[_-]?key)/i;

export function createPortableSegmentDescriptor(input: PortableSegmentDescriptorV1): PortableSegmentDescriptorV1 {
  return Object.freeze({
    ...input,
    stableKey: Object.freeze([...input.stableKey]),
    encryption: input.encryption ? Object.freeze({ ...input.encryption }) : undefined,
  });
}

function semanticSnapshotBoundary(boundary: PortableSnapshotBoundaryV1) {
  return {
    environment: boundary.environment,
    postgresSnapshot: boundary.postgresSnapshot,
    capturedAt: boundary.capturedAt,
    migrationCount: boundary.migrationCount,
    latestMigration: boundary.latestMigration,
    migrationLedgerIdentity: boundary.migrationLedgerIdentity,
    currentGenerationId: boundary.currentGenerationId,
    pointerRevision: boundary.pointerRevision,
    compatibilityVersion: boundary.compatibilityVersion,
    compatibilityMarker: boundary.compatibilityMarker,
    sha256: boundary.sha256,
  };
}

export function computeSnapshotBoundarySha256(
  boundary: Omit<PortableSnapshotBoundaryV1, "sha256">,
): string {
  const canonical = JSON.stringify({
    environment: boundary.environment,
    postgresSnapshot: boundary.postgresSnapshot,
    capturedAt: boundary.capturedAt,
    migrationCount: boundary.migrationCount,
    latestMigration: boundary.latestMigration,
    migrationLedgerIdentity: boundary.migrationLedgerIdentity,
    currentGenerationId: boundary.currentGenerationId,
    pointerRevision: boundary.pointerRevision,
    compatibilityVersion: boundary.compatibilityVersion,
    compatibilityMarker: boundary.compatibilityMarker,
  });
  return sha256Hex(canonical);
}

export function computeManifestSemanticRoot(manifest: PortableExportManifestV1): string {
  const canonical = JSON.stringify({
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    canonicalizationVersion: manifest.canonicalizationVersion,
    profile: manifest.profile,
    sourceRepositoryCommit: manifest.sourceRepositoryCommit,
    sourceSchemaFingerprintSha256: manifest.sourceSchemaFingerprintSha256,
    snapshotBoundary: semanticSnapshotBoundary(manifest.snapshotBoundary),
    segments: [...manifest.segments]
      .map((segment) => ({
        name: segment.name,
        relation: segment.relation,
        classification: segment.classification,
        loadMode: segment.loadMode,
        stableKey: [...segment.stableKey],
        rowCount: segment.rowCount,
        plaintextSemanticSha256: segment.plaintextSemanticSha256,
        snapshotBoundarySha256: segment.snapshotBoundarySha256,
        required: segment.required,
        protected: segment.protected,
      }))
      .sort((left, right) => left.name.localeCompare(right.name)),
  });
  return sha256Hex(canonical);
}

function scanForSecretMetadata(value: unknown, path = "manifest") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanForSecretMetadata(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY.test(key)) throw new Error(`Secret-bearing manifest metadata is forbidden at ${path}.${key}.`);
    scanForSecretMetadata(child, `${path}.${key}`);
  }
}

function exactDigest(value: unknown, label: string) {
  if (typeof value !== "string" || !SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
}

function canonicalBase64Bytes(value: unknown, expectedBytes: number, label: string): void {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} is required.`);
  const decoded = Buffer.from(value, "base64");
  if (decoded.byteLength !== expectedBytes || decoded.toString("base64").replace(/=+$/u, "") !== value.replace(/=+$/u, "")) {
    throw new Error(`${label} must be canonical base64 for exactly ${expectedBytes} bytes.`);
  }
}

function validateProtectedTransport(manifest: PortableExportManifestV1, segment: PortableSegmentDescriptorV1): void {
  if (!segment.protected) {
    if (segment.ciphertextTransportSha256 !== undefined || segment.encryption !== undefined) {
      throw new Error(`Unprotected segment ${segment.name} cannot carry encrypted transport metadata.`);
    }
    return;
  }

  if (manifest.profile !== "FULL_DR") {
    throw new Error(`Protected segment ${segment.name} is allowed only in FULL_DR artifacts.`);
  }
  if (segment.classification !== "PROTECTED_PORTABLE_AUTHORITY" && segment.classification !== "PROTECTED_PORTABLE_AUDIT_HISTORY") {
    throw new Error(`Protected segment ${segment.name} must use a protected portability classification.`);
  }
  exactDigest(segment.ciphertextTransportSha256, `${segment.name} ciphertext transport SHA-256`);
  const encryption = segment.encryption;
  if (!encryption || encryption.algorithm !== "AES-256-GCM") {
    throw new Error(`Protected segment ${segment.name} requires AES-256-GCM encryption metadata.`);
  }
  if (!/^[A-Za-z0-9._:/-]{1,128}$/u.test(encryption.keyId)) {
    throw new Error(`Protected segment ${segment.name} requires a valid external key ID.`);
  }
  canonicalBase64Bytes(encryption.nonceBase64, 12, `${segment.name} AES-256-GCM nonce`);
  canonicalBase64Bytes(encryption.authTagBase64, 16, `${segment.name} AES-256-GCM authentication tag`);
}

export function validatePortableManifestV1(
  manifest: PortableExportManifestV1,
  { requiredSegments = [] }: { requiredSegments?: readonly string[] } = {},
): PortableExportManifestV1 {
  if (!manifest || typeof manifest !== "object") throw new Error("Portable manifest is required.");
  scanForSecretMetadata(manifest);
  if (manifest.format !== PORTABLE_EXPORT_FORMAT) throw new Error("Unknown portable export format.");
  if (manifest.formatVersion !== PORTABLE_EXPORT_FORMAT_VERSION) throw new Error("Unknown portable export format version.");
  if (manifest.canonicalizationVersion !== PORTABLE_CANONICALIZATION_VERSION) throw new Error("Unknown canonicalization version.");
  if (!new Set<PortableExportProfile>(["CORE_PORTABLE", "FULL_DR"]).has(manifest.profile)) throw new Error("Unknown portable export profile.");
  if (!COMMIT.test(manifest.sourceRepositoryCommit)) throw new Error("Source repository commit must be an exact SHA.");
  exactDigest(manifest.sourceSchemaFingerprintSha256, "Source schema fingerprint");
  exactDigest(manifest.snapshotBoundary.sha256, "Snapshot boundary");
  canonicalizePostgresScalar({ pgType: "timestamptz", text: manifest.capturedAt });
  canonicalizePostgresScalar({ pgType: "timestamptz", text: manifest.snapshotBoundary.capturedAt });
  if (manifest.capturedAt !== manifest.snapshotBoundary.capturedAt) {
    throw new Error("Manifest capturedAt must equal the snapshot-boundary capture time.");
  }
  if (!/^\d+$/.test(manifest.snapshotBoundary.migrationCount)) throw new Error("Migration count must use lossless integer text.");
  if (!/^\d+$/.test(manifest.snapshotBoundary.pointerRevision)) throw new Error("Pointer revision must use lossless integer text.");

  const names = new Set<string>();
  for (const segment of manifest.segments) {
    if (!segment.name || !segment.relation) throw new Error("Portable segment identity is required.");
    if (names.has(segment.name)) throw new Error(`Duplicate portable segment ${segment.name}.`);
    names.add(segment.name);
    if (!CLASSIFICATIONS.has(segment.classification)) throw new Error(`Unsupported relation classification for ${segment.name}.`);
    if (!LOAD_MODES.has(segment.loadMode)) throw new Error(`Unsupported load mode for ${segment.name}.`);
    if (!Number.isSafeInteger(segment.rowCount) || segment.rowCount < 0) throw new Error(`Invalid row count for ${segment.name}.`);
    if (!segment.stableKey.length) throw new Error(`Stable key is required for ${segment.name}.`);
    exactDigest(segment.plaintextSemanticSha256, `${segment.name} semantic SHA-256`);
    exactDigest(segment.snapshotBoundarySha256, `${segment.name} snapshot SHA-256`);
    if (segment.snapshotBoundarySha256 !== manifest.snapshotBoundary.sha256) throw new Error(`Segment ${segment.name} belongs to a different snapshot boundary.`);
    validateProtectedTransport(manifest, segment);
  }
  const missing = requiredSegments.filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Missing mandatory portable segments: ${missing.join(", ")}.`);
  if (manifest.profile === "CORE_PORTABLE" && manifest.certification?.drReady) {
    throw new Error("CORE_PORTABLE cannot declare final disaster-recovery readiness.");
  }
  exactDigest(manifest.semanticRootSha256, "Manifest semantic root");
  const expectedRoot = computeManifestSemanticRoot(manifest);
  if (manifest.semanticRootSha256 !== expectedRoot) throw new Error("Manifest semantic root mismatch.");
  return manifest;
}
