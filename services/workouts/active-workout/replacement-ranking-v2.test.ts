import { describe, expect, it } from "vitest";

import type { RankedExerciseAlternative } from "@/lib/exercise-detail/alternatives";
import type { ReplacementEligibility } from "@/services/database/workout-replacement-eligibility";
import type { UserExerciseAlternative, Workout } from "@/types";
import {
  ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION_V2,
  rankAuthorityBackedActiveWorkoutReplacementsV2,
} from "./replacement-ranking";

function workout(id: string): Workout {
  return {
    id,
    name: id,
    category: "strength",
    target_muscle: "quadriceps",
    equipment: "dumbbell",
    difficulty: "intermediate",
    sets: null,
    reps: null,
    rest_seconds: null,
    instructions: "",
    notes: null,
    is_global: true,
    catalog_source: "external",
  };
}

function ranked(id: string, relationshipType = "equipment_substitution"): RankedExerciseAlternative {
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
    identity: `provider:plaivra_activity_catalog:${id}`,
    rank: 100,
    rankingVersion: "replacement-ranking-v2",
    evidenceRelationshipTypes: [relationshipType],
  };
}

function eligibility(ids: string[], denied: string[] = []) {
  return new Map(ids.map((id) => [id, {
    eligible: !denied.includes(id),
    reason: denied.includes(id) ? "missing_mapping" : null,
  } satisfies ReplacementEligibility]));
}

describe("Active Workout shared V2 replacement adapter", () => {
  it("preserves shared V2 ranking instead of applying v1 semantic heuristics", () => {
    const first = workout("first");
    const second = workout("second");
    const result = rankAuthorityBackedActiveWorkoutReplacementsV2({
      ranked: [ranked("first"), { ...ranked("second"), rank: 85 }],
      workoutsById: new Map([[first.id, first], [second.id, second]]),
      eligibility: eligibility([first.id, second.id]),
    });
    expect(result.map((item) => item.workout.id)).toEqual(["first", "second"]);
    expect(result.every((item) => item.rankingVersion === ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION_V2)).toBe(true);
  });

  it("adds execution-context eligibility and session duplicate exclusion after shared ranking", () => {
    const denied = workout("denied");
    const duplicate = workout("duplicate");
    const usable = workout("usable");
    const result = rankAuthorityBackedActiveWorkoutReplacementsV2({
      ranked: [ranked("denied"), ranked("duplicate"), ranked("usable")],
      workoutsById: new Map([[denied.id, denied], [duplicate.id, duplicate], [usable.id, usable]]),
      eligibility: eligibility([denied.id, duplicate.id, usable.id], [denied.id]),
      sessionExerciseIds: new Set([duplicate.id]),
    });
    expect(result.map((item) => item.workout.id)).toEqual(["usable"]);
  });

  it("reads historical saved names only as a bounded used-before hint", () => {
    const candidate = workout("candidate");
    const saved = [{
      id: "saved",
      user_id: "user",
      plan_exercise_id: "plan-exercise",
      original_exercise_name: "Original",
      alternative_exercise_name: "candidate",
      reason: "other",
      created_at: "2026-08-01T00:00:00.000Z",
      updated_at: "2026-08-01T00:00:00.000Z",
    }] as UserExerciseAlternative[];
    const result = rankAuthorityBackedActiveWorkoutReplacementsV2({
      ranked: [ranked(candidate.id)],
      workoutsById: new Map([[candidate.id, candidate]]),
      eligibility: eligibility([candidate.id]),
      savedAlternatives: saved,
    });
    expect(result[0]?.reasons).toContain("used_before");
    expect(result[0]?.score).toBe(101);
  });
});
