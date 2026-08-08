import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAIN_ACTIVITY_CATALOG_V2_CAPABILITY,
  parseCatalogV2ActivityEnvelope,
  toDormantV2SnapshotAuthority
} from "./v2-contract";

const fixturePath = path.join(process.cwd(), "services/activity-catalog/v2/fixtures/catalog-v2-activity.fixture.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

describe("dormant Activity Catalog V2 contract", () => {
  it("strictly parses the frozen Catalog V2 fixture", () => {
    const parsed = parseCatalogV2ActivityEnvelope(fixture);
    expect(parsed.meta.apiVersion).toBe("v2");
    expect(parsed.data.revisionId).toBe("22222222-2222-4222-8222-222222222222");
    expect(parsed.data.prescriptionSchema).toMatchObject({ key: "strength_sets_reps", version: "v1" });
    expect(parsed.data.performedMetricSchema).toMatchObject({ key: "strength_sets_reps_load", version: "v1" });
    expect(parsed.data.heatMap).toMatchObject({
      policy: "required",
      mappingProfileId: "33333333-3333-4333-8333-333333333333",
      taxonomy: { key: "main_muscle_intelligence", version: "advanced_visible_v1" },
      workloadModel: { key: "resistance_sets", version: "v1" }
    });
    expect(parsed.data.publicationPolicyVersion).toBe("p10b-publication-policy-v1");
    expect(parsed.data.capabilityContractVersion).toBe("main-activity-catalog-v2-capability-v1");
  });

  it("rejects missing or malformed semantic identities", () => {
    const badRevision = structuredClone(fixture);
    badRevision.data.revisionId = "not-a-uuid";
    expect(() => parseCatalogV2ActivityEnvelope(badRevision)).toThrow(/revision id/i);

    const badChecksum = structuredClone(fixture);
    badChecksum.data.releaseChecksum = "short";
    expect(() => parseCatalogV2ActivityEnvelope(badChecksum)).toThrow(/release checksum/i);

    const badHeatMap = structuredClone(fixture);
    delete badHeatMap.data.heatMap.workloadModel;
    expect(() => parseCatalogV2ActivityEnvelope(badHeatMap)).toThrow(/workload model/i);

    const badPerformed = structuredClone(fixture);
    delete badPerformed.data.performedMetricSchema.contextDimensions;
    expect(() => parseCatalogV2ActivityEnvelope(badPerformed)).toThrow(/performed context dimensions/i);
  });

  it("can freeze every future snapshot semantic identity without changing current snapshots", () => {
    const parsed = parseCatalogV2ActivityEnvelope(fixture);
    expect(toDormantV2SnapshotAuthority(parsed.data)).toEqual({
      catalogReleaseId: "44444444-4444-4444-8444-444444444444",
      catalogReleaseChecksum: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      catalogActivityId: "11111111-1111-4111-8111-111111111111",
      catalogActivityRevisionId: "22222222-2222-4222-8222-222222222222",
      catalogActivityRevisionNumber: 3,
      prescriptionSchema: { key: "strength_sets_reps", version: "v1" },
      performedMetricSchema: { key: "strength_sets_reps_load", version: "v1" },
      recordDefinitionIds: [],
      mappingProfileId: "33333333-3333-4333-8333-333333333333",
      taxonomy: { key: "main_muscle_intelligence", version: "advanced_visible_v1" },
      workloadModel: { key: "resistance_sets", version: "v1" },
      publicationPolicyVersion: "p10b-publication-policy-v1",
      capabilityContractVersion: "main-activity-catalog-v2-capability-v1"
    });
  });

  it("declares only Main runtime capabilities that already exist", () => {
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY.contractVersion).toBe("main-activity-catalog-v2-capability-v1");
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY.sourceMainSha).toBe("6ec12497612446a9a9dd6cc1d91709cc8f045b22");
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY.supportedWorkloadModels).toEqual([
      {
        modelKey: "resistance_sets",
        modelVersion: "v1",
        mainRuntimeConstant: "resistance_sets_v1",
        engineVersion: "muscle_load_resistance_sets_v2"
      }
    ]);
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY.supportedPrFormulas).toEqual([]);
  });
});
