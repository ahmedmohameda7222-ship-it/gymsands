import { describe, expect, it } from "vitest";

import type { LibraryAlternative } from "@/lib/activity-catalog/library-types";
import {
  EXERCISE_ALTERNATIVE_REASONS,
  REPLACEMENT_RANKING_VERSION_V2,
  rankExerciseAlternativesV2,
} from "./alternatives";

function alternative(id: string, relationshipType: string): LibraryAlternative {
  return {
    relationshipType,
    rationale: null,
    prescriptionTransfer: null,
    activity: {
      id,
      domain: "strength",
      revisionId: `${id}-revision`,
      revisionNumber: 1,
      revisionLifecycle: "published",
      slug: id,
      name: id,
      shortDescription: null,
      instructions: [],
      difficulty: null,
      movementPattern: null,
      activityType: null,
      membership: { kind: "owned", visibility: "default", domainPriority: 1, primaryDomain: true },
      aliases: [],
      equipment: [],
      coverage: [],
      executionProfiles: [],
      bodyEffects: [],
      prescriptionSchema: null,
      performedMetricSchema: null,
      recordDefinitions: [],
      heatMap: null,
      publicationPolicy: null,
      capabilityContract: null,
    },
  };
}

const candidates = [
  alternative("equipment", "equipment_substitution"),
  alternative("easier", "easier_variation"),
  alternative("harder", "harder_variation"),
  alternative("impact", "lower_impact"),
  alternative("purpose", "same_training_purpose"),
  alternative("movement", "same_movement_pattern"),
  alternative("primary", "same_primary_muscle"),
  alternative("skill", "similar_skill"),
];

describe("replacement ranking v2", () => {
  it("publishes all eight approved product reasons", () => {
    expect(EXERCISE_ALTERNATIVE_REASONS).toEqual([
      "machine_taken", "no_equipment", "too_hard", "want_harder",
      "pain_discomfort", "no_spotter", "technique_confidence", "variation",
    ]);
  });

  it("uses exact harder/easier/equipment/lower-impact authority", () => {
    expect(rankExerciseAlternativesV2("no_equipment", candidates).map((item) => item.activity.id)).toEqual(["equipment"]);
    expect(rankExerciseAlternativesV2("too_hard", candidates).map((item) => item.activity.id)).toEqual(["easier"]);
    expect(rankExerciseAlternativesV2("want_harder", candidates).map((item) => item.activity.id)).toEqual(["harder"]);
    expect(rankExerciseAlternativesV2("pain_discomfort", candidates).map((item) => item.activity.id)).toEqual(["impact"]);
  });

  it("fails closed for missing spotter and technical-complexity authority", () => {
    expect(rankExerciseAlternativesV2("no_spotter", candidates)).toEqual([]);
    expect(rankExerciseAlternativesV2("technique_confidence", candidates)).toEqual([]);
  });

  it("does not map variation to generic other and preserves intent relationships", () => {
    expect(rankExerciseAlternativesV2("variation", candidates).map((item) => item.activity.id)).toEqual([
      "purpose", "movement", "skill", "primary", "equipment",
    ]);
  });

  it("uses stable candidate identity for used-before ranking", () => {
    const used = new Set(["provider:plaivra_activity_catalog:purpose"]);
    const result = rankExerciseAlternativesV2("variation", candidates, { usedIdentities: used });
    const purpose = result.find((item) => item.activity.id === "purpose");
    expect(purpose?.identity).toBe("provider:plaivra_activity_catalog:purpose");
    expect(purpose?.rankingVersion).toBe(REPLACEMENT_RANKING_VERSION_V2);
    expect(purpose?.rank).toBe(95);
  });
});
