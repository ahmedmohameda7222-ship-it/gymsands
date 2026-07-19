import { ADVANCED_MUSCLE_ATLAS_VERSION } from "./versions";
import targetViewRegistry from "@/data/muscle-intelligence/advanced-visible-v1/target-view-registry.json";

export const ADVANCED_MUSCLE_TARGET_IDS = [
  "neck.sternocleidomastoid",
  "trapezius.upper",
  "trapezius.middle",
  "trapezius.lower",
  "deltoid.anterior",
  "deltoid.lateral",
  "deltoid.posterior",
  "pectoralis.upper",
  "pectoralis.middle",
  "pectoralis.lower",
  "pectoralis.outer",
  "infraspinatus",
  "teres_minor",
  "teres_major",
  "latissimus.upper",
  "latissimus.middle",
  "latissimus.lower",
  "latissimus.outer",
  "serratus.anterior",
  "biceps.long_head",
  "biceps.short_head",
  "brachialis",
  "triceps.long_head",
  "triceps.lateral_head",
  "triceps.medial_head",
  "brachioradialis",
  "forearm.pronator_teres",
  "forearm.flexor_mass",
  "forearm.extensor_mass",
  "rectus_abdominis.upper",
  "rectus_abdominis.middle",
  "rectus_abdominis.lower",
  "oblique.external_upper",
  "oblique.external_lower",
  "spinal_erectors.upper",
  "spinal_erectors.lower",
  "hip_flexors.anterior",
  "tensor_fasciae_latae",
  "gluteus.medius",
  "gluteus_maximus.upper",
  "gluteus_maximus.middle",
  "gluteus_maximus.lower",
  "quadriceps.rectus_femoris",
  "quadriceps.vastus_lateralis",
  "quadriceps.vastus_medialis",
  "adductors.anterior_region",
  "adductors.posterior_region",
  "hamstrings.biceps_femoris_long_head",
  "hamstrings.biceps_femoris_short_head",
  "hamstrings.semitendinosus",
  "hamstrings.semimembranosus",
  "lower_leg.tibialis_anterior",
  "lower_leg.fibularis",
  "calf.gastrocnemius_medial",
  "calf.gastrocnemius_lateral",
  "calf.soleus"
] as const;

export type AdvancedMuscleTargetId = (typeof ADVANCED_MUSCLE_TARGET_IDS)[number];
export type AdvancedMuscleView = "front" | "back";
export type AdvancedMuscleSide = "left" | "right" | "center";
export type AdvancedMuscleParentGroup =
  | "neck"
  | "trapezius"
  | "shoulders"
  | "chest"
  | "upper_back"
  | "lats"
  | "serratus"
  | "upper_arms"
  | "forearms"
  | "abdominals"
  | "obliques"
  | "spinal_erectors"
  | "hips"
  | "glutes"
  | "quadriceps"
  | "adductors"
  | "hamstrings"
  | "lower_legs";

export type AdvancedMuscleTargetDefinition = {
  id: AdvancedMuscleTargetId;
  parentGroup: AdvancedMuscleParentGroup;
  displayOrder: number;
  supportedViews: readonly AdvancedMuscleView[];
  regionType: "anatomical" | "anatomical_subdivision" | "training_region";
  nameKey: string;
  subtitleKey: string | null;
};

export type MuscleVisualBinding = {
  view: AdvancedMuscleView;
  side: AdvancedMuscleSide;
  svgGroupId: string;
};

export type MuscleTargetViewDefinition = {
  canonicalId: AdvancedMuscleTargetId;
  view: AdvancedMuscleView;
  bindings: readonly MuscleVisualBinding[];
  hitAreaIds: readonly string[];
};

const FRONT_TARGETS = new Set<AdvancedMuscleTargetId>([
  "neck.sternocleidomastoid", "trapezius.upper", "deltoid.anterior", "deltoid.lateral",
  "pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer", "serratus.anterior",
  "rectus_abdominis.upper", "rectus_abdominis.middle", "rectus_abdominis.lower", "oblique.external_upper",
  "oblique.external_lower", "biceps.long_head", "biceps.short_head", "brachialis", "brachioradialis",
  "forearm.pronator_teres", "forearm.flexor_mass", "hip_flexors.anterior", "tensor_fasciae_latae",
  "quadriceps.rectus_femoris", "quadriceps.vastus_lateralis", "quadriceps.vastus_medialis",
  "adductors.anterior_region", "lower_leg.tibialis_anterior", "lower_leg.fibularis"
]);

const BACK_TARGETS = new Set<AdvancedMuscleTargetId>([
  "trapezius.upper", "trapezius.middle", "trapezius.lower", "deltoid.posterior", "infraspinatus",
  "teres_minor", "teres_major", "latissimus.upper", "latissimus.middle", "latissimus.lower",
  "latissimus.outer", "spinal_erectors.upper", "spinal_erectors.lower", "triceps.long_head",
  "triceps.lateral_head", "triceps.medial_head", "forearm.extensor_mass", "brachioradialis",
  "gluteus.medius", "gluteus_maximus.upper", "gluteus_maximus.middle", "gluteus_maximus.lower",
  "hamstrings.biceps_femoris_long_head", "hamstrings.biceps_femoris_short_head", "hamstrings.semitendinosus",
  "hamstrings.semimembranosus", "adductors.posterior_region", "calf.gastrocnemius_medial",
  "calf.gastrocnemius_lateral", "calf.soleus"
]);

const TRAINING_REGIONS = new Set<AdvancedMuscleTargetId>([
  "pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer",
  "latissimus.upper", "latissimus.middle", "latissimus.lower", "latissimus.outer",
  "rectus_abdominis.upper", "rectus_abdominis.middle", "rectus_abdominis.lower",
  "oblique.external_upper", "oblique.external_lower",
  "spinal_erectors.upper", "spinal_erectors.lower",
  "hip_flexors.anterior",
  "gluteus_maximus.upper", "gluteus_maximus.middle", "gluteus_maximus.lower",
  "adductors.anterior_region", "adductors.posterior_region"
]);

const ANATOMICAL_TARGETS = new Set<AdvancedMuscleTargetId>([
  "neck.sternocleidomastoid",
  "infraspinatus", "teres_minor", "teres_major", "serratus.anterior",
  "brachialis", "brachioradialis", "forearm.pronator_teres", "forearm.flexor_mass", "forearm.extensor_mass",
  "tensor_fasciae_latae", "gluteus.medius",
  "quadriceps.rectus_femoris", "quadriceps.vastus_lateralis", "quadriceps.vastus_medialis",
  "hamstrings.biceps_femoris_long_head", "hamstrings.biceps_femoris_short_head",
  "hamstrings.semitendinosus", "hamstrings.semimembranosus",
  "lower_leg.tibialis_anterior", "lower_leg.fibularis", "calf.soleus"
]);

function parentGroupFor(id: AdvancedMuscleTargetId): AdvancedMuscleParentGroup {
  if (id.startsWith("neck.")) return "neck";
  if (id.startsWith("trapezius.")) return "trapezius";
  if (id.startsWith("deltoid.")) return "shoulders";
  if (id.startsWith("pectoralis.")) return "chest";
  if (["infraspinatus", "teres_minor", "teres_major"].includes(id)) return "upper_back";
  if (id.startsWith("latissimus.")) return "lats";
  if (id === "serratus.anterior") return "serratus";
  if (id.startsWith("biceps.") || id === "brachialis" || id.startsWith("triceps.")) return "upper_arms";
  if (id === "brachioradialis" || id.startsWith("forearm.")) return "forearms";
  if (id.startsWith("rectus_abdominis.")) return "abdominals";
  if (id.startsWith("oblique.")) return "obliques";
  if (id.startsWith("spinal_erectors.")) return "spinal_erectors";
  if (id === "hip_flexors.anterior" || id === "tensor_fasciae_latae") return "hips";
  if (id.startsWith("gluteus")) return "glutes";
  if (id.startsWith("quadriceps.")) return "quadriceps";
  if (id.startsWith("adductors.")) return "adductors";
  if (id.startsWith("hamstrings.")) return "hamstrings";
  return "lower_legs";
}

export function sanitizeAdvancedMuscleTargetId(id: AdvancedMuscleTargetId): string {
  return id.replaceAll(".", "-").replaceAll("_", "-");
}

export const ADVANCED_MUSCLE_TARGETS: readonly AdvancedMuscleTargetDefinition[] = ADVANCED_MUSCLE_TARGET_IDS.map(
  (id, index) => ({
    id,
    parentGroup: parentGroupFor(id),
    displayOrder: index + 1,
    supportedViews: [
      ...(FRONT_TARGETS.has(id) ? ["front" as const] : []),
      ...(BACK_TARGETS.has(id) ? ["back" as const] : [])
    ],
    regionType: TRAINING_REGIONS.has(id)
      ? "training_region"
      : ANATOMICAL_TARGETS.has(id)
        ? "anatomical"
        : "anatomical_subdivision",
    nameKey: `train.muscleAtlas.targets.${id}.name`,
    subtitleKey: `train.muscleAtlas.targets.${id}.subtitle`
  })
);

const TARGET_BY_ID = new Map(ADVANCED_MUSCLE_TARGETS.map((target) => [target.id, target]));

export function isAdvancedMuscleTargetId(value: unknown): value is AdvancedMuscleTargetId {
  return typeof value === "string" && TARGET_BY_ID.has(value as AdvancedMuscleTargetId);
}

export function getAdvancedMuscleTarget(id: AdvancedMuscleTargetId): AdvancedMuscleTargetDefinition {
  const target = TARGET_BY_ID.get(id);
  if (!target) throw new Error(`Unknown advanced muscle target: ${id}.`);
  return target;
}

export function compareAdvancedMuscleTargets(left: AdvancedMuscleTargetId, right: AdvancedMuscleTargetId): number {
  return getAdvancedMuscleTarget(left).displayOrder - getAdvancedMuscleTarget(right).displayOrder || left.localeCompare(right);
}

const TARGET_VIEW_REGISTRY_BY_KEY = new Map(targetViewRegistry.targetViews.map((entry) => [`${entry.canonicalId}:${entry.view}`, entry]));

export const ADVANCED_MUSCLE_TARGET_VIEWS: readonly MuscleTargetViewDefinition[] = ADVANCED_MUSCLE_TARGETS.flatMap((target) =>
  target.supportedViews.map((view) => {
    const entry = TARGET_VIEW_REGISTRY_BY_KEY.get(`${target.id}:${view}`);
    if (!entry) throw new Error(`Missing visual registry entry for ${target.id}:${view}.`);
    const sanitized = sanitizeAdvancedMuscleTargetId(target.id);
    return {
      canonicalId: target.id,
      view,
      bindings: entry.sides.map((side) => ({ view, side: side as AdvancedMuscleSide, svgGroupId: `muscle-${view}-${sanitized}-${side}` })),
      hitAreaIds: entry.hitAreaIds
    };
  })
);

export function validateAdvancedMuscleAtlasRegistry(): readonly string[] {
  const errors: string[] = [];
  if (ADVANCED_MUSCLE_TARGETS.length !== 56) errors.push("Registry must contain exactly 56 logical targets.");
  if (ADVANCED_MUSCLE_TARGET_VIEWS.length !== 58) errors.push("Registry must contain exactly 58 target-view definitions.");
  if (new Set(ADVANCED_MUSCLE_TARGET_IDS).size !== ADVANCED_MUSCLE_TARGET_IDS.length) errors.push("Target IDs must be unique.");
  if (new Set(ADVANCED_MUSCLE_TARGETS.map((target) => target.displayOrder)).size !== 56) errors.push("Display order must be unique.");
  if (ADVANCED_MUSCLE_TARGETS.some((target) => target.supportedViews.length === 0)) errors.push("Every target needs a supported view.");
  const expectedViews = new Set(ADVANCED_MUSCLE_TARGETS.flatMap((target) => target.supportedViews.map((view) => `${target.id}:${view}`)));
  const actualViews = new Set(ADVANCED_MUSCLE_TARGET_VIEWS.map((targetView) => `${targetView.canonicalId}:${targetView.view}`));
  if (targetViewRegistry.targetViews.length !== ADVANCED_MUSCLE_TARGET_VIEWS.length
    || actualViews.size !== ADVANCED_MUSCLE_TARGET_VIEWS.length || expectedViews.size !== actualViews.size
    || [...expectedViews].some((targetView) => !actualViews.has(targetView))) errors.push("Target-view registry does not match supported logical views.");
  if (ADVANCED_MUSCLE_TARGET_VIEWS.some((targetView) => targetView.bindings.length === 0
    || targetView.bindings.some((binding) => !["left", "right", "center"].includes(binding.side)))) {
    errors.push("Every target-view requires valid side-aware bindings.");
  }
  return errors;
}

export const ADVANCED_ATLAS_METADATA = Object.freeze({
  atlasVersion: ADVANCED_MUSCLE_ATLAS_VERSION,
  logicalTargetCount: 56,
  targetViewCount: 58,
  logicalCanvas: Object.freeze({ width: 1024, height: 1536, aspectRatio: "2 / 3" })
});
