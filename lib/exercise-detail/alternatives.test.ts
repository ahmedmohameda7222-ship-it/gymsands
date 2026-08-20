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

describe("replacement ranking v2", () => {
  it("publishes exactly the eight approved product reasons and no legacy other alias", () => {
    expect(EXERCISE_ALTERNATIVE_REASONS).toEqual([
      "machine_taken", "no_equipment", "too_hard", "want_harder",
      "pain_discomfort", "no_spotter", "technique_confidence", "variation",
    ]);
    expect(EXERCISE_ALTERNATIVE_REASONS).not.toContain("other");
  });

  it("requires equipment/setup authority for machine taken", () => {
    expect(rankExerciseAlternativesV2("machine_taken", [
      alternative("same-purpose", "same_training_purpose"),
      alternative("same-movement", "same_movement_pattern"),
      alternative("same-primary", "same_primary_muscle"),
    ])).toEqual([]);

    const result = rankExerciseAlternativesV2("machine_taken", [
      alternative("usable", "same_training_purpose"),
      alternative("usable", "equipment_substitution"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.relationshipType).toBe("equipment_substitution");
    expect(result[0]?.evidenceRelationshipTypes).toEqual(["equipment_substitution", "same_training_purpose"]);
  });

  it("requires explicit equipment substitution for equipment unavailable", () => {
    expect(rankExerciseAlternativesV2("no_equipment", [alternative("same", "same_primary_muscle")])).toEqual([]);
    expect(rankExerciseAlternativesV2("no_equipment", [alternative("equipment", "equipment_substitution")]).map((item) => item.activity.id)).toEqual(["equipment"]);
  });

  it("uses only explicit easier authority for too hard", () => {
    expect(rankExerciseAlternativesV2("too_hard", [alternative("same", "same_training_purpose")])).toEqual([]);
    expect(rankExerciseAlternativesV2("too_hard", [alternative("easier", "easier_variation")]).map((item) => item.activity.id)).toEqual(["easier"]);
  });

  it("uses only explicit harder authority for want harder", () => {
    expect(rankExerciseAlternativesV2("want_harder", [alternative("same", "same_training_purpose")])).toEqual([]);
    expect(rankExerciseAlternativesV2("want_harder", [alternative("harder", "harder_variation")]).map((item) => item.activity.id)).toEqual(["harder"]);
  });

  it("fails pain/discomfort closed without lower-impact authority", () => {
    expect(rankExerciseAlternativesV2("pain_discomfort", [alternative("same", "same_primary_muscle")])).toEqual([]);
    expect(rankExerciseAlternativesV2("pain_discomfort", [alternative("impact", "lower_impact")]).map((item) => item.activity.id)).toEqual(["impact"]);
  });

  it("fails closed for missing spotter/support authority", () => {
    expect(rankExerciseAlternativesV2("no_spotter", [
      alternative("easier", "easier_variation"),
      alternative("equipment", "equipment_substitution"),
    ])).toEqual([]);
  });

  it("fails closed for missing technical-complexity/regression authority", () => {
    expect(rankExerciseAlternativesV2("technique_confidence", [
      alternative("easy", "easier_variation"),
      alternative("skill", "similar_skill"),
    ])).toEqual([]);
  });

  it("requires meaningful authority-backed difference for variation", () => {
    expect(rankExerciseAlternativesV2("variation", [
      alternative("purpose", "same_training_purpose"),
      alternative("movement", "same_movement_pattern"),
      alternative("skill", "similar_skill"),
      alternative("primary", "same_primary_muscle"),
    ])).toEqual([]);

    expect(rankExerciseAlternativesV2("variation", [
      alternative("explicit", "variation"),
      alternative("movement-change", "movement_variation"),
      alternative("skill-change", "skill_variation"),
      alternative("equipment-change", "equipment_substitution"),
    ]).map((item) => item.activity.id)).toEqual([
      "explicit", "movement-change", "skill-change", "equipment-change",
    ]);
  });

  it("deduplicates multi-edge candidates by stable provider identity and aggregates evidence", () => {
    const result = rankExerciseAlternativesV2("variation", [
      alternative("same-candidate", "same_training_purpose"),
      alternative("same-candidate", "equipment_substitution"),
      alternative("same-candidate", "same_primary_muscle"),
      alternative("same-candidate", "equipment_substitution"),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]?.identity).toBe("provider:plaivra_activity_catalog:same-candidate");
    expect(result[0]?.relationshipType).toBe("equipment_substitution");
    expect(result[0]?.evidenceRelationshipTypes).toEqual([
      "equipment_substitution", "same_training_purpose", "same_primary_muscle",
    ]);
  });

  it("keeps deterministic strongest authority and stable used-before ranking", () => {
    const used = new Set(["provider:plaivra_activity_catalog:explicit"]);
    const result = rankExerciseAlternativesV2("variation", [
      alternative("explicit", "equipment_substitution"),
      alternative("explicit", "variation"),
    ], { usedIdentities: used });
    expect(result).toHaveLength(1);
    expect(result[0]?.relationshipType).toBe("variation");
    expect(result[0]?.rankingVersion).toBe(REPLACEMENT_RANKING_VERSION_V2);
    expect(result[0]?.rank).toBe(95);
  });
});
