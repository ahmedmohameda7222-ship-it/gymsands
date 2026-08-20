import { describe, expect, it } from "vitest";

import type { ExerciseDetailViewModel } from "./contracts";
import { projectAuthoritativeExercisePreview } from "./anatomy";
import { catalogProviderIdentity } from "./identity";

function exercise(overrides: Partial<ExerciseDetailViewModel> = {}): ExerciseDetailViewModel {
  return {
    identity: {
      activityId: "activity",
      revisionId: "revision",
      revisionNumber: 1,
      slug: "activity",
      domain: "strength",
      source: "catalog_v2",
      performance: catalogProviderIdentity("activity"),
    },
    name: "Exercise",
    shortDescription: null,
    activityType: "Strength",
    difficulty: null,
    movementPattern: null,
    mechanics: null,
    forceType: null,
    equipment: [],
    instructions: [],
    instructionProse: null,
    guideUrl: null,
    sourceVideoUrl: null,
    target: { kind: "muscle", primary: ["Chest"], secondary: ["Triceps"], stabilizer: ["Serratus"], focus: [], anatomyAvailable: true },
    anatomyAuthority: {
      source: "catalog_v2",
      coverage: [
        { name: "Chest", role: "primary", atlasTargetId: "pectoralis.middle" },
        { name: "Triceps", role: "secondary", atlasTargetId: "triceps.lateral_head" },
        { name: "Serratus", role: "stabilizer", atlasTargetId: "serratus.anterior" },
      ],
      heatMap: null,
    },
    formAuthority: { setup: [], techniqueCues: [], commonMistakes: [], safety: [] },
    prescription: null,
    performedMetricSchema: null,
    recordDefinitions: [],
    catalogAuthoritySnapshot: null,
    execution: { executable: false, contract: null, reason: "unsupported_execution_contract", startHref: null },
    ...overrides,
  };
}

describe("authoritative exercise anatomy preview", () => {
  it("uses only explicit V2 atlas targets and preserves role emphasis", () => {
    expect(projectAuthoritativeExercisePreview(exercise())?.targets).toEqual([
      { targetId: "pectoralis.middle", role: "primary", heatLevel: "high" },
      { targetId: "triceps.lateral_head", role: "secondary", heatLevel: "moderate" },
      { targetId: "serratus.anterior", role: "stabilizer", heatLevel: "light" },
    ]);
  });

  it("does not fuzzy-map a muscle name when geometry identity is unknown", () => {
    const model = exercise({
      anatomyAuthority: { source: "catalog_v2", coverage: [{ name: "Chest", role: "primary", atlasTargetId: "unknown.chest.shape" }], heatMap: null },
    });
    expect(projectAuthoritativeExercisePreview(model)).toBeNull();
    expect(model.target.primary).toEqual(["Chest"]);
  });

  it("never consults V2 geometry for legacy source identities", () => {
    const model = exercise({ identity: { ...exercise().identity, source: "catalog_legacy" } });
    expect(projectAuthoritativeExercisePreview(model)).toBeNull();
  });
});
