import { describe, expect, it } from "vitest";
import {
  computeManifestSemanticRoot,
  createPortableSegmentDescriptor,
  validatePortableManifestV1,
  type PortableExportManifestV1,
} from "./export-contract";

const H = "a".repeat(64);
const SNAPSHOT = "b".repeat(64);

function manifest(overrides: Partial<PortableExportManifestV1> = {}): PortableExportManifestV1 {
  const segments = [
    createPortableSegmentDescriptor({
      name: "food_items",
      relation: "food_items",
      classification: "PORTABLE_AUTHORITY",
      loadMode: "RECONSTRUCT_TRANSITIONAL_COMPATIBILITY",
      stableKey: ["id"],
      rowCount: 0,
      plaintextSemanticSha256: H,
      snapshotBoundarySha256: SNAPSHOT,
      required: true,
      protected: false,
    }),
  ];
  const base = {
    format: "plaivra-food-catalog-portable-export" as const,
    formatVersion: 1 as const,
    canonicalizationVersion: 1 as const,
    profile: "CORE_PORTABLE" as const,
    sourceRepositoryCommit: "c".repeat(40),
    sourceSchemaFingerprintSha256: "d".repeat(64),
    capturedAt: "2026-09-10T18:19:20.123456Z",
    snapshotBoundary: {
      environment: "fixture",
      postgresSnapshot: "100:100:",
      capturedAt: "2026-09-10T18:19:20.123456Z",
      migrationCount: "123",
      latestMigration: "20260910071241",
      migrationLedgerIdentity: "fixture-ledger",
      currentGenerationId: null,
      pointerRevision: "0",
      compatibilityVersion: "2",
      compatibilityMarker: "20260724232734",
      sha256: SNAPSHOT,
    },
    segments,
    semanticRootSha256: "0".repeat(64),
  } satisfies PortableExportManifestV1;
  const merged = { ...base, ...overrides } as PortableExportManifestV1;
  merged.semanticRootSha256 = computeManifestSemanticRoot(merged);
  return merged;
}

describe("Plan 7 portable export contract", () => {
  it("accepts the frozen v1 CORE_PORTABLE contract and explicit zero-row segments", () => {
    const value = manifest();
    expect(validatePortableManifestV1(value, { requiredSegments: ["food_items"] })).toBe(value);
    expect(value.segments[0]).toMatchObject({ rowCount: 0, plaintextSemanticSha256: H });
  });

  it("keeps volatile capture metadata and ciphertext transport outside the semantic root", () => {
    const first = manifest();
    const second = manifest({ capturedAt: "2030-01-01T00:00:00.000000Z" });
    expect(computeManifestSemanticRoot(first)).toBe(computeManifestSemanticRoot(second));
  });

  it.each([
    ["unknown profile", { profile: "PORTABLE" }],
    ["unknown format", { format: "pg-dump" }],
    ["unknown format version", { formatVersion: 2 }],
    ["unknown canonicalization", { canonicalizationVersion: 2 }],
  ])("rejects %s", (_label, patch) => {
    expect(() => validatePortableManifestV1(manifest(patch as never), { requiredSegments: ["food_items"] })).toThrow();
  });

  it("rejects missing mandatory segments, duplicate segment names, malformed digests and snapshot mismatches", () => {
    expect(() => validatePortableManifestV1(manifest(), { requiredSegments: ["food_items", "food_names"] })).toThrow(/mandatory/i);

    const duplicate = manifest();
    duplicate.segments = [duplicate.segments[0], { ...duplicate.segments[0] }];
    duplicate.semanticRootSha256 = computeManifestSemanticRoot(duplicate);
    expect(() => validatePortableManifestV1(duplicate, { requiredSegments: ["food_items"] })).toThrow(/duplicate/i);

    const malformed = manifest();
    malformed.segments[0] = { ...malformed.segments[0], plaintextSemanticSha256: "ABC" };
    expect(() => validatePortableManifestV1(malformed, { requiredSegments: ["food_items"] })).toThrow(/sha-256/i);

    const torn = manifest();
    torn.segments[0] = { ...torn.segments[0], snapshotBoundarySha256: "e".repeat(64) };
    torn.semanticRootSha256 = computeManifestSemanticRoot(torn);
    expect(() => validatePortableManifestV1(torn, { requiredSegments: ["food_items"] })).toThrow(/snapshot/i);
  });

  it("rejects secret-bearing manifest metadata and unsupported load modes", () => {
    const secret = { ...manifest(), databasePassword: "nope" } as unknown as PortableExportManifestV1;
    expect(() => validatePortableManifestV1(secret, { requiredSegments: ["food_items"] })).toThrow(/secret|password/i);

    const badMode = manifest();
    badMode.segments[0] = { ...badMode.segments[0], loadMode: "UPSERT" as never };
    badMode.semanticRootSha256 = computeManifestSemanticRoot(badMode);
    expect(() => validatePortableManifestV1(badMode, { requiredSegments: ["food_items"] })).toThrow(/load mode/i);
  });

  it("requires protected authority to use FULL_DR with complete AES-256-GCM transport metadata", () => {
    const full = manifest({ profile: "FULL_DR" });
    const missingTransport = {
      ...full.segments[0],
      name: "food_personal_overrides",
      relation: "food_personal_overrides",
      classification: "PROTECTED_PORTABLE_AUTHORITY" as const,
      loadMode: "RESTORE_EXACT" as const,
      stableKey: ["user_id", "food_id"],
      protected: true,
    };
    full.segments = [missingTransport];
    full.semanticRootSha256 = computeManifestSemanticRoot(full);
    expect(() => validatePortableManifestV1(full, { requiredSegments: ["food_personal_overrides"] })).toThrow(/encrypt|transport|AES-256-GCM/i);

    const core = manifest();
    core.segments = [missingTransport];
    core.semanticRootSha256 = computeManifestSemanticRoot(core);
    expect(() => validatePortableManifestV1(core, { requiredSegments: ["food_personal_overrides"] })).toThrow(/FULL_DR|protected/i);
  });

  it("keeps randomized protected transport metadata outside the deterministic semantic root", () => {
    const first = manifest({ profile: "FULL_DR" });
    const baseProtected = {
      ...first.segments[0],
      name: "food_personal_overrides",
      relation: "food_personal_overrides",
      classification: "PROTECTED_PORTABLE_AUTHORITY" as const,
      loadMode: "RESTORE_EXACT" as const,
      stableKey: ["user_id", "food_id"],
      protected: true,
      ciphertextTransportSha256: "e".repeat(64),
      encryption: {
        algorithm: "AES-256-GCM",
        keyId: "ephemeral-ci",
        nonceBase64: Buffer.alloc(12, 1).toString("base64"),
        authTagBase64: Buffer.alloc(16, 2).toString("base64"),
      },
    } as unknown as PortableExportManifestV1["segments"][number];
    first.segments = [baseProtected];
    first.semanticRootSha256 = computeManifestSemanticRoot(first);
    expect(validatePortableManifestV1(first, { requiredSegments: ["food_personal_overrides"] })).toBe(first);

    const second = structuredClone(first);
    second.segments = [{
      ...baseProtected,
      ciphertextTransportSha256: "f".repeat(64),
      encryption: {
        algorithm: "AES-256-GCM",
        keyId: "ephemeral-ci",
        nonceBase64: Buffer.alloc(12, 3).toString("base64"),
        authTagBase64: Buffer.alloc(16, 4).toString("base64"),
      },
    } as unknown as PortableExportManifestV1["segments"][number]];
    second.semanticRootSha256 = computeManifestSemanticRoot(second);
    expect(second.semanticRootSha256).toBe(first.semanticRootSha256);
    expect(validatePortableManifestV1(second, { requiredSegments: ["food_personal_overrides"] })).toBe(second);
  });
});
