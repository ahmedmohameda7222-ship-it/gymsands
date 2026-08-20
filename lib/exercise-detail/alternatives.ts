import type { LibraryAlternative } from "@/lib/activity-catalog/library-types";

export const REPLACEMENT_RANKING_VERSION_V2 = "replacement-ranking-v2" as const;

export const EXERCISE_ALTERNATIVE_REASONS = [
  "machine_taken",
  "no_equipment",
  "too_hard",
  "want_harder",
  "pain_discomfort",
  "no_spotter",
  "technique_confidence",
  "variation"
] as const;

export type ExerciseAlternativeReasonV2 = typeof EXERCISE_ALTERNATIVE_REASONS[number];

export type RankedExerciseAlternative = LibraryAlternative & {
  rank: number;
  identity: string;
  rankingVersion: typeof REPLACEMENT_RANKING_VERSION_V2;
};

const exactRelationshipRank: Record<ExerciseAlternativeReasonV2, Partial<Record<string, number>>> = {
  machine_taken: {
    equipment_substitution: 100,
    same_training_purpose: 70,
    same_movement_pattern: 60,
    same_primary_muscle: 50
  },
  no_equipment: { equipment_substitution: 100 },
  too_hard: { easier_variation: 100 },
  want_harder: { harder_variation: 100 },
  pain_discomfort: { lower_impact: 100 },
  no_spotter: {},
  technique_confidence: {},
  variation: {
    same_training_purpose: 100,
    same_movement_pattern: 90,
    similar_skill: 80,
    same_primary_muscle: 70,
    equipment_substitution: 60
  }
};

/**
 * V2 intentionally fails closed when the Catalog does not provide the semantic
 * authority needed for a reason. In particular, no-spotter and lower technical
 * complexity are not inferred from names, equipment, or generic difficulty.
 */
export function rankExerciseAlternativesV2(
  reason: ExerciseAlternativeReasonV2,
  alternatives: readonly LibraryAlternative[],
  options: { usedIdentities?: ReadonlySet<string> } = {}
): RankedExerciseAlternative[] {
  const relationRank = exactRelationshipRank[reason];
  return alternatives.flatMap((alternative) => {
    const baseRank = relationRank[alternative.relationshipType];
    if (!baseRank) return [];
    const identity = `provider:plaivra_activity_catalog:${alternative.activity.id}`;
    const usedPenalty = options.usedIdentities?.has(identity) ? 5 : 0;
    return [{ ...alternative, identity, rank: baseRank - usedPenalty, rankingVersion: REPLACEMENT_RANKING_VERSION_V2 }];
  }).sort((left, right) => right.rank - left.rank || left.activity.name.localeCompare(right.activity.name) || left.activity.id.localeCompare(right.activity.id));
}

export function isAlternativeReasonSupportedForRelationships(
  reason: ExerciseAlternativeReasonV2,
  alternatives: readonly LibraryAlternative[]
) {
  return alternatives.some((alternative) => Boolean(exactRelationshipRank[reason][alternative.relationshipType]));
}
