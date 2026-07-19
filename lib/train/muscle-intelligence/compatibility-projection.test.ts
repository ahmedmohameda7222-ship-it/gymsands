import { describe, expect, it } from "vitest";
import { calculateMuscleLoad } from "./calculate-muscle-load";
import { BROAD_COMPATIBILITY_COVERAGE, projectBroadMuscleCompatibility } from "./compatibility-projection";

describe("broad V1 compatibility projection", () => {
  it("projects exact visual coverage without creating leaf scores", () => {
    const broad = calculateMuscleLoad({
      mode: "planned",
      period: { kind: "session" },
      items: [{
        itemId: "chest",
        mapping: {
          mappingSetId: "v1-map", targetId: "exercise", targetType: "global_exercise", mappingVersion: 1,
          schemaVersion: "exercise_muscle_mapping_v1", checksum: "a".repeat(64),
          entries: [{ muscleId: "pectoralis_major", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 }]
        },
        workload: { model: "resistance_sets_v1", qualifyingSets: 5 }
      }]
    });
    const projection = projectBroadMuscleCompatibility(broad);
    const chest = projection.targets.find((target) => target.broadMuscleId === "pectoralis_major");
    expect(chest).toEqual({
      targetId: "broad:pectoralis_major",
      broadMuscleId: "pectoralis_major",
      heatLevel: "moderate",
      visualCoverage: ["pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer"],
      detailAvailability: "broad_only"
    });
    expect(projection).not.toHaveProperty("leafScores");
    expect(JSON.stringify(projection)).not.toContain("rawScore");
  });

  it("contains the approved coverage for all 24 broad targets", () => {
    expect(Object.keys(BROAD_COMPATIBILITY_COVERAGE)).toHaveLength(24);
    expect(BROAD_COMPATIBILITY_COVERAGE.upper_back).toEqual([
      "trapezius.middle", "trapezius.lower", "infraspinatus", "teres_minor", "teres_major"
    ]);
    expect(BROAD_COMPATIBILITY_COVERAGE.forearms).toEqual([
      "brachioradialis", "forearm.pronator_teres", "forearm.flexor_mass", "forearm.extensor_mass"
    ]);
  });
});
