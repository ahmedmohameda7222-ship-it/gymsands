import { describe, expect, it } from "vitest";
import type { LibraryActivityDetail } from "./library-types";
import { buildCatalogAuthoritySnapshot } from "./snapshot";

const detail: LibraryActivityDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  revisionNumber: 3,
  revisionLifecycle: "published",
  revisionChecksum: "a".repeat(64),
  slug: "fixture_press",
  name: "Fixture Press",
  shortDescription: "fixture",
  instructions: [{ order: 1, text: "Press." }],
  difficulty: "intermediate",
  movementPattern: "press",
  activityType: { slug: "strength", name: "Strength" },
  membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true, checksum: "b".repeat(64) },
  aliases: [],
  equipment: [],
  coverage: [],
  executionProfiles: [],
  bodyEffects: [],
  prescriptionSchema: { id: "33333333-3333-4333-8333-333333333333", key: "strength_repetition", version: "v1", fields: [], checksum: "c".repeat(64) },
  performedMetricSchema: { id: "44444444-4444-4444-8444-444444444444", key: "strength_repetition", version: "v1", fields: [], contextDimensions: [], checksum: "d".repeat(64) },
  recordDefinitions: [{ id: "55555555-5555-4555-8555-555555555555", record_key: "load" }],
  heatMap: { policy: "required", taxonomy: { id: "66666666-6666-4666-8666-666666666666" }, workloadModel: { key: "strength", version: 1 } },
  publicationPolicy: { id: "77777777-7777-4777-8777-777777777777", key: "default", version: 1, checksum: "e".repeat(64) },
  capabilityContract: { id: "88888888-8888-4888-8888-888888888888", version: "v2", compatibleCatalogApiVersion: "v2", checksum: "f".repeat(64) },
  authority: {
    libraryRelease: { id: "99999999-9999-4999-8999-999999999999", version: "p10e-library-v1", checksum: "1".repeat(64) },
    catalogRelease: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", version: "p10e-library-v1", checksum: "2".repeat(64) },
    activityId: "11111111-1111-4111-8111-111111111111",
    revisionId: "22222222-2222-4222-8222-222222222222",
    revisionNumber: 3
  }
};

describe("P10F Catalog authority materialization", () => {
  it("freezes release, revision, schema, records, mapping, policy, and capability authority", () => {
    const snapshot = buildCatalogAuthoritySnapshot(detail);
    expect(snapshot).toMatchObject({
      libraryRelease: detail.authority!.libraryRelease,
      catalogRelease: detail.authority!.catalogRelease,
      activityId: detail.id,
      revisionId: detail.revisionId,
      revisionNumber: 3,
      prescriptionSchema: { id: detail.prescriptionSchema!.id, key: "strength_repetition", version: "v1", checksum: "c".repeat(64) },
      performedMetricSchema: { id: detail.performedMetricSchema!.id, key: "strength_repetition", version: "v1", checksum: "d".repeat(64) },
      recordDefinitions: detail.recordDefinitions,
      mappingAuthority: detail.heatMap,
      publicationPolicy: detail.publicationPolicy,
      capabilityContract: detail.capabilityContract
    });
  });

  it("does not retain mutable references to semantic arrays/objects", () => {
    const snapshot = buildCatalogAuthoritySnapshot(detail);
    (detail.recordDefinitions![0] as Record<string, unknown>).record_key = "mutated";
    (detail.heatMap as Record<string, unknown>).policy = "mutated";
    expect(snapshot.recordDefinitions[0].record_key).toBe("load");
    expect(snapshot.mappingAuthority?.policy).toBe("required");
  });

  it("fails closed when a supposed native detail lacks immutable authority", () => {
    expect(() => buildCatalogAuthoritySnapshot({ ...detail, authority: undefined })).toThrow(/missing immutable release\/revision authority/i);
  });
});