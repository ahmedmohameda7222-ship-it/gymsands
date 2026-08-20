import type { LibraryAlternative } from "@/lib/activity-catalog/library-types";
import {
  EXERCISE_ALTERNATIVE_REASONS,
  type ExerciseAlternativeReasonV2,
} from "@/types/exercise-alternative";

export { EXERCISE_ALTERNATIVE_REASONS };
export type { ExerciseAlternativeReasonV2 };

export const REPLACEMENT_RANKING_VERSION_V2 = "replacement-ranking-v2" as const;

export type RankedExerciseAlternative = LibraryAlternative & {
  rank: number;
  identity: string;
  rankingVersion: typeof REPLACEMENT_RANKING_VERSION_V2;
  /** All Catalog relationship evidence observed for this canonical candidate. */
  evidenceRelationshipTypes: string[];
};

const qualifyingRelationshipRank: Record<ExerciseAlternativeReasonV2, Partial<Record<string, number>>> = {
  machine_taken: { equipment_substitution: 100 },
  no_equipment: { equipment_substitution: 100 },
  too_hard: { easier_variation: 100 },
  want_harder: { harder_variation: 100 },
  pain_discomfort: { lower_impact: 100 },
  no_spotter: {},
  technique_confidence: {},
  variation: {
    variation: 100,
    movement_variation: 95,
    skill_variation: 90,
    equipment_substitution: 85,
  },
};

const relationshipEvidenceOrder = [
  "equipment_substitution",
  "easier_variation",
  "harder_variation",
  "lower_impact",
  "variation",
  "movement_variation",
  "skill_variation",
  "same_training_purpose",
  "same_movement_pattern",
  "similar_skill",
  "same_primary_muscle",
] as const;

function evidenceOrder(value: string) {
  const index = relationshipEvidenceOrder.indexOf(value as (typeof relationshipEvidenceOrder)[number]);
  return index === -1 ? relationshipEvidenceOrder.length : index;
}

function canonicalCandidateIdentity(alternative: LibraryAlternative) {
  return `provider:plaivra_activity_catalog:${alternative.activity.id}`;
}

function aggregateCandidateEvidence(alternatives: readonly LibraryAlternative[]) {
  const grouped = new Map<string, LibraryAlternative[]>();
  for (const alternative of alternatives) {
    const identity = canonicalCandidateIdentity(alternative);
    grouped.set(identity, [...(grouped.get(identity) ?? []), alternative]);
  }
  return grouped;
}

/**
 * V2 fails closed unless the Catalog relationship itself proves the semantic
 * requirement for the selected reason. Generic overlap is never enough.
 *
 * Machine Taken therefore requires equipment_substitution authority. Other
 * same-purpose/movement/muscle edges are retained as evidence only after that
 * setup difference has been proven. Want Variation likewise requires an
 * explicit variation relationship or equipment substitution; same-purpose,
 * same-movement and same-primary edges cannot qualify a candidate alone.
 */
export function rankExerciseAlternativesV2(
  reason: ExerciseAlternativeReasonV2,
  alternatives: readonly LibraryAlternative[],
  options: { usedIdentities?: ReadonlySet<string> } = {}
): RankedExerciseAlternative[] {
  const relationRank = qualifyingRelationshipRank[reason];
  const ranked: RankedExerciseAlternative[] = [];

  for (const [identity, edges] of aggregateCandidateEvidence(alternatives)) {
    const qualifying = edges
      .map((edge) => ({ edge, rank: relationRank[edge.relationshipType] ?? 0 }))
      .filter((entry) => entry.rank > 0)
      .sort((left, right) => right.rank - left.rank
        || evidenceOrder(left.edge.relationshipType) - evidenceOrder(right.edge.relationshipType)
        || left.edge.relationshipType.localeCompare(right.edge.relationshipType));
    const strongest = qualifying[0];
    if (!strongest) continue;

    const evidenceRelationshipTypes = [...new Set(edges.map((edge) => edge.relationshipType))]
      .sort((left, right) => evidenceOrder(left) - evidenceOrder(right) || left.localeCompare(right));
    const usedPenalty = options.usedIdentities?.has(identity) ? 5 : 0;
    ranked.push({
      ...strongest.edge,
      identity,
      rank: strongest.rank - usedPenalty,
      rankingVersion: REPLACEMENT_RANKING_VERSION_V2,
      evidenceRelationshipTypes,
    });
  }

  return ranked.sort((left, right) => right.rank - left.rank
    || left.activity.name.localeCompare(right.activity.name)
    || left.activity.id.localeCompare(right.activity.id));
}

export function isAlternativeReasonSupportedForRelationships(
  reason: ExerciseAlternativeReasonV2,
  alternatives: readonly LibraryAlternative[]
) {
  return rankExerciseAlternativesV2(reason, alternatives).length > 0;
}
