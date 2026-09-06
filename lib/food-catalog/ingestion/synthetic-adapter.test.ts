import { describe, expect, it } from "vitest";
import { createSyntheticFoodCatalogAdapter } from "./synthetic-adapter";

const artifact = {
  source: {
    provider: "synthetic",
    dataset: "reference",
    sourceVersion: "1",
    sourceReleaseDate: "2026-09-01",
    licenseName: "Reference",
    licenseReference: null,
    sourceReference: null,
    sourceChecksumSha256: "a".repeat(64),
    importerVersion: "1",
    configChecksumSha256: "b".repeat(64)
  },
  candidates: []
};

describe("synthetic Food Catalog adapter", () => {
  it("returns defensive deterministic copies and exposes no mutation authority", () => {
    const adapter = createSyntheticFoodCatalogAdapter<typeof artifact>();
    const source = adapter.describeSource(artifact);
    const candidates = adapter.toCandidates(artifact);

    expect(source).toEqual(artifact.source);
    expect(source).not.toBe(artifact.source);
    expect(candidates).toEqual([]);
    expect(Object.keys(adapter).sort()).toEqual([
      "adapterId",
      "adapterVersion",
      "describeSource",
      "toCandidates"
    ]);
  });
});
