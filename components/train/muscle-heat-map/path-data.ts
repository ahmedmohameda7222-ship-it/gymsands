import sourcePathAssignments from "@/data/muscle-intelligence/advanced-visible-v1/source-path-assignments.json";
import type { AdvancedMuscleSide, AdvancedMuscleTargetId, AdvancedMuscleView } from "@/lib/train/muscle-intelligence/advanced-atlas";

export type RuntimeTargetPath = {
  sourcePathId: string;
  view: AdvancedMuscleView;
  classification: "target";
  canonicalId: AdvancedMuscleTargetId;
  side: AdvancedMuscleSide;
  normalizedPathData: string;
};

export type RuntimeHitArea = {
  id: string;
  view: AdvancedMuscleView;
  canonicalId: AdvancedMuscleTargetId;
  side: AdvancedMuscleSide;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
};

export const ADVANCED_ATLAS_PATHS = {
  front: sourcePathAssignments.views.front.paths.filter((path) => path.classification === "target") as RuntimeTargetPath[],
  back: sourcePathAssignments.views.back.paths.filter((path) => path.classification === "target") as RuntimeTargetPath[]
} as const;

export const ADVANCED_ATLAS_HIT_AREAS = sourcePathAssignments.hitAreas as RuntimeHitArea[];
