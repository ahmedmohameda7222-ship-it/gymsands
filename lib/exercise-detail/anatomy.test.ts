import { describe, expect, it } from "vitest";

import type { ExerciseDetailViewModel } from "./contracts";
import type { LibraryRequiredHeatMap } from "@/lib/activity-catalog/library-types";
import { projectAuthoritativeExercisePreview } from "./anatomy";
import { catalogProviderIdentity } from "./identity";

function requiredHeatMap(): LibraryRequiredHeatMap {
  return {
    policy: "required",
    mappingProfileId: "33333333-3333-4333-8333-333333333333",
    mappingSchemaVersion: "exercise_muscle_mapping_v2",
    mappingProfileVersion: 1,
    mappingChecksum: "a".repeat(64),
    taxonomy: { key: "main_muscle_intelligence", version: "advanced_visible_v1" },
    workloadModel: { key: "resistance_sets", version: "v1" },
    mapping: [
      { muscleId: "pectoralis.middle", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 },
      { muscleId: "triceps.lateral_head", role: "secondary", contribution: 0.5, sideScope: "bilateral", sortOrder: 2 },
      { muscleId: "serratus.anterior", role: "stabilizer", contribution: 0.25, sideScope: "bilateral", sortOrder: 3 },
    ],
  };
}

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
      coverage: [],
      heatMap: requiredHeatMap(),
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
  it("projects a production-shaped V2 muscleId mapping and preserves role emphasis", () => {
    expect(projectAuthoritativeExercisePreview(exercise())?.targets).toEqual([
      { targetId: "pectoralis.middle", role: "primary", heatLevel: "high" },
      { targetId: "triceps.lateral_head", role: "secondary", heatLevel: "moderate" },
      { targetId: "serratus.anterior", role: "stabilizer", heatLevel: "light" },
    ]);
  });

  it("fails closed when the taxonomy version is unsupported", () => {
    const model = exercise({
      anatomyAuthority: {
        ...exercise().anatomyAuthority,
        heatMap: {
          ...requiredHeatMap(),
          taxonomy: { key: "main_muscle_intelligence", version: "future_atlas_v9" },
        },
      },
    });
    expect(projectAuthoritativeExercisePreview(model)).toBeNull();
  });

  it("ignores invalid muscle IDs without fabricating geometry from names", () => {
    const heatMap = requiredHeatMap();
    const model = exercise({
      anatomyAuthority: {
        source: "catalog_v2",
        coverage: [{ name: "Chest", role: "primary", atlasTargetId: "unknown.chest.shape" }],
        heatMap: { ...heatMap, mapping: [{ ...heatMap.mapping[0]!, muscleId: "unknown.chest.shape" }] },
      },
    });
    expect(projectAuthoritativeExercisePreview(model)).toBeNull();
    expect(model.target.primary).toEqual(["Chest"]);
  });

  it("deduplicates exact targets and preserves the strongest role", () => {
    const heatMap = requiredHeatMap();
    const model = exercise({
      anatomyAuthority: {
        source: "catalog_v2",
        coverage: [],
        heatMap: {
          ...heatMap,
          mapping: [
            { ...heatMap.mapping[0]!, role: "secondary", sortOrder: 1 },
            { ...heatMap.mapping[0]!, role: "primary", sortOrder: 2 },
            { ...heatMap.mapping[0]!, role: "stabilizer", sortOrder: 3 },
          ],
        },
      },
    });
    expect(projectAuthoritativeExercisePreview(model)?.targets).toEqual([
      { targetId: "pectoralis.middle", role: "primary", heatLevel: "high" },
    ]);
  });

  it("never consults V2 geometry for legacy source identities", () => {
    const model = exercise({ identity: { ...exercise().identity, source: "catalog_legacy" } });
    expect(projectAuthoritativeExercisePreview(model)).toBeNull();
  });
});
