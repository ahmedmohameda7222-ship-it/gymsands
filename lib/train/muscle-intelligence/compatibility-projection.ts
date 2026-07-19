import type { MuscleLoadAnalysisResult } from "./calculate-muscle-load";
import type { CanonicalMuscleId } from "./taxonomy";
import type { AdvancedHeatLevel } from "./advanced-exposure";
import type { AdvancedMuscleTargetId } from "./advanced-atlas";
import { MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION } from "./versions";

export const BROAD_COMPATIBILITY_COVERAGE = {
  pectoralis_major: ["pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer"],
  anterior_deltoid: ["deltoid.anterior"], lateral_deltoid: ["deltoid.lateral"], posterior_deltoid: ["deltoid.posterior"],
  trapezius: ["trapezius.upper", "trapezius.middle", "trapezius.lower"],
  latissimus_dorsi: ["latissimus.upper", "latissimus.middle", "latissimus.lower", "latissimus.outer"],
  upper_back: ["trapezius.middle", "trapezius.lower", "infraspinatus", "teres_minor", "teres_major"],
  biceps_brachii: ["biceps.long_head", "biceps.short_head"],
  triceps_brachii: ["triceps.long_head", "triceps.lateral_head", "triceps.medial_head"],
  forearms: ["brachioradialis", "forearm.pronator_teres", "forearm.flexor_mass", "forearm.extensor_mass"],
  rotator_cuff: ["infraspinatus", "teres_minor"], serratus_anterior: ["serratus.anterior"],
  rectus_abdominis: ["rectus_abdominis.upper", "rectus_abdominis.middle", "rectus_abdominis.lower"],
  obliques: ["oblique.external_upper", "oblique.external_lower"],
  erector_spinae: ["spinal_erectors.upper", "spinal_erectors.lower"],
  gluteus_maximus: ["gluteus_maximus.upper", "gluteus_maximus.middle", "gluteus_maximus.lower"],
  gluteus_medius: ["gluteus.medius"],
  quadriceps: ["quadriceps.rectus_femoris", "quadriceps.vastus_lateralis", "quadriceps.vastus_medialis"],
  hamstrings: ["hamstrings.biceps_femoris_long_head", "hamstrings.biceps_femoris_short_head", "hamstrings.semitendinosus", "hamstrings.semimembranosus"],
  adductors: ["adductors.anterior_region", "adductors.posterior_region"], hip_flexors: ["hip_flexors.anterior"],
  gastrocnemius: ["calf.gastrocnemius_medial", "calf.gastrocnemius_lateral"], soleus: ["calf.soleus"],
  tibialis_anterior: ["lower_leg.tibialis_anterior"]
} as const satisfies Record<CanonicalMuscleId, readonly AdvancedMuscleTargetId[]>;

export type BroadCompatibilityTargetId = `broad:${CanonicalMuscleId}`;
export type BroadCompatibilityTarget = {
  targetId: BroadCompatibilityTargetId;
  broadMuscleId: CanonicalMuscleId;
  heatLevel: AdvancedHeatLevel;
  visualCoverage: readonly AdvancedMuscleTargetId[];
  detailAvailability: "broad_only";
};
export type BroadCompatibilityResult = {
  kind: "broad_compatibility";
  sourceSchemaVersion: typeof MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION;
  detailMessageKey: "train.muscleAtlas.compatibility.detailUnavailable";
  targets: BroadCompatibilityTarget[];
};

function v1LevelToHeat(level: MuscleLoadAnalysisResult["muscles"][number]["level"]): AdvancedHeatLevel {
  if (level === "inactive") return "none";
  if (level === "low") return "light";
  if (level === "medium") return "moderate";
  return "high";
}

export function projectBroadMuscleCompatibility(result: MuscleLoadAnalysisResult): BroadCompatibilityResult {
  if (result.schemaVersion !== MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION) throw new Error("Unsupported broad analysis schema.");
  return {
    kind: "broad_compatibility",
    sourceSchemaVersion: MUSCLE_ANALYSIS_RESULT_SCHEMA_VERSION,
    detailMessageKey: "train.muscleAtlas.compatibility.detailUnavailable",
    targets: result.muscles.map((muscle) => ({
      targetId: `broad:${muscle.muscleId}`,
      broadMuscleId: muscle.muscleId,
      heatLevel: v1LevelToHeat(muscle.level),
      visualCoverage: BROAD_COMPATIBILITY_COVERAGE[muscle.muscleId],
      detailAvailability: "broad_only"
    }))
  };
}

export function isBroadCompatibilityTargetId(value: unknown): value is BroadCompatibilityTargetId {
  return typeof value === "string" && value.startsWith("broad:") && value.slice(6) in BROAD_COMPATIBILITY_COVERAGE;
}
