import finalRegionManifestJson from "@/data/muscle-intelligence/advanced-visible-v1/final-region-manifest.json";
import type { AdvancedMuscleSide, AdvancedMuscleTargetId, AdvancedMuscleView } from "@/lib/train/muscle-intelligence/advanced-atlas";

export type RuntimeTargetPath = {
  pathId: string;
  view: AdvancedMuscleView;
  canonicalId: AdvancedMuscleTargetId;
  side: AdvancedMuscleSide;
  pathData: string;
  pixelArea: number;
  contourCount: number;
  pathSha256: string;
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

const finalRegionManifest = finalRegionManifestJson as unknown as {
  runtimePaths: Array<Omit<RuntimeTargetPath, "pathId">>;
  hitAreas: RuntimeHitArea[];
};

const runtimePaths = finalRegionManifest.runtimePaths.map((entry) => ({
  ...entry,
  pathId: `semantic-${entry.view}-${entry.canonicalId.replaceAll(".", "-").replaceAll("_", "-")}-${entry.side}`
}));

export const ADVANCED_ATLAS_PATHS = {
  front: runtimePaths.filter((path) => path.view === "front"),
  back: runtimePaths.filter((path) => path.view === "back")
} as const;

export const ADVANCED_ATLAS_HIT_AREAS = finalRegionManifest.hitAreas;
