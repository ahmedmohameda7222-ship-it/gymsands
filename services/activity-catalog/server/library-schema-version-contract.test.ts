import { describe, expect, it, vi } from "vitest";
import { HttpLibraryActivityProvider } from "./library-http-provider";

const catalogKey = "catalog-key-must-remain-server-only";
const libraryRelease = {
  id: "d985375c-a97e-592b-832c-ccf6226e1ae9",
  version: "p10e-library-v1",
  checksum: "6524498fd6a888ee3f4495516c38e7ad27332a5d04dcbbb3bc86b8469165e31e",
  publishedAt: "2026-08-11T00:00:00.000Z",
  strengthSemanticFingerprint: "73092422c4ef3bb6f386b7081fdeaaacb65778a29d449ba42fa2dda8fd9d142a"
};
const catalogRelease = {
  id: "fc92eca8-c2ab-5366-ba83-5c64c904aaca",
  version: "p10e-library-v1",
  checksum: "a3f4707871d41efa50de8e56d7760dc06c45765aa35ac4c42f179186176c5271"
};

function response(data: unknown) {
  return new Response(JSON.stringify({
    data,
    meta: { apiVersion: "v2", locale: "en", libraryRelease, catalogRelease }
  }), { status: 200, headers: { "content-type": "application/json" } });
}

function productionShapeActivity() {
  return {
    id: "62e3f5c9-ee7a-5d68-8884-da23256a6f8c",
    domain: "strength",
    revisionId: "a595ad1a-0e18-5431-b162-c06ad8fa28b5",
    revisionNumber: 2,
    revisionLifecycle: "in_review",
    slug: "45_degree_back_extension",
    name: "45-Degree Back Extension",
    shortDescription: "Canonical strength detail",
    instructions: [{ order: 1, text: "Perform the movement under control." }],
    difficulty: "intermediate",
    movementPattern: "hip_hinge",
    mechanics: null,
    forceType: null,
    activityType: { slug: "strength_exercise", name: "Strength Exercise" },
    membership: { kind: "shared_reference", visibility: "default", domainPriority: 10, primaryDomain: true },
    aliases: [],
    equipment: [],
    coverage: [],
    executionProfiles: [],
    bodyEffects: [],
    prescriptionSchema: {
      id: "8ac0bc36-3f28-5f66-9cf9-61292fafb2e6",
      key: "strength_repetition",
      fields: [],
      version: "v1",
      checksum: "96cd949c874821bc761fd32f6baaaad4ccb7f7275fba0ada139c4306b2ec82e0"
    },
    performedMetricSchema: {
      id: "90248e38-415b-5685-9479-243743d1cab5",
      key: "strength_repetition",
      fields: [],
      version: "v1",
      checksum: "0b64100d32ed23727340d75140487a09fcdc3e88e3e7af29f76d0af4c9a64790",
      contextDimensions: ["resistance_mode", "side", "set_type"]
    },
    recordDefinitions: [],
    heatMap: null,
    publicationPolicy: null,
    capabilityContract: null
  };
}

describe("Activity Catalog V2 schema version contract", () => {
  it("accepts canonical string schema versions from immutable release payloads", async () => {
    const http = new HttpLibraryActivityProvider({
      baseUrl: "https://catalog-api.plaivra.com",
      apiKey: catalogKey,
      fetchImpl: vi.fn(async () => response(productionShapeActivity())) as unknown as typeof fetch
    });

    const result = await http.getActivityByIdentifier("62e3f5c9-ee7a-5d68-8884-da23256a6f8c");

    expect(result.data.prescriptionSchema?.version).toBe("v1");
    expect(result.data.performedMetricSchema?.version).toBe("v1");
  });
});
