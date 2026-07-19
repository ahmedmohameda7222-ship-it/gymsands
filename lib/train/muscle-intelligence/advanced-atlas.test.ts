import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import finalRegionManifest from "@/data/muscle-intelligence/advanced-visible-v1/final-region-manifest.json";
import {
  ADVANCED_ATLAS_METADATA,
  ADVANCED_MUSCLE_TARGETS,
  ADVANCED_MUSCLE_TARGET_VIEWS,
  getAdvancedMuscleTarget,
  sanitizeAdvancedMuscleTargetId,
  validateAdvancedMuscleAtlasRegistry
} from "./advanced-atlas";

const sourceRoot = resolve("assets/muscle-intelligence/advanced-visible-v1/source");
const semanticRoot = resolve("assets/muscle-intelligence/advanced-visible-v1/semantic");

function sha256(filename: string) {
  return createHash("sha256").update(readFileSync(resolve(sourceRoot, filename))).digest("hex");
}

describe("advanced visible muscle atlas registry", () => {
  it("contains the exact stable logical and target-view cardinality", () => {
    expect(ADVANCED_MUSCLE_TARGETS).toHaveLength(56);
    expect(ADVANCED_MUSCLE_TARGET_VIEWS).toHaveLength(58);
    expect(ADVANCED_ATLAS_METADATA).toMatchObject({
      atlasVersion: "advanced_visible_v1",
      logicalTargetCount: 56,
      targetViewCount: 58,
      logicalCanvas: { width: 1024, height: 1536, aspectRatio: "2 / 3" }
    });
    expect(validateAdvancedMuscleAtlasRegistry()).toEqual([]);
    expect(getAdvancedMuscleTarget("trapezius.upper").supportedViews).toEqual(["front", "back"]);
    expect(getAdvancedMuscleTarget("brachioradialis").supportedViews).toEqual(["front", "back"]);
    expect(ADVANCED_MUSCLE_TARGETS.map((target) => target.displayOrder)).toEqual(Array.from({ length: 56 }, (_, index) => index + 1));
    for (const targetView of ADVANCED_MUSCLE_TARGET_VIEWS) {
      const semanticPaths = finalRegionManifest.runtimePaths.filter((path) => path.view === targetView.view && path.canonicalId === targetView.canonicalId);
      expect(targetView.bindings.map((binding) => binding.side).sort()).toEqual([...new Set(semanticPaths.map((path) => path.side))].sort());
      expect(targetView.hitAreaIds).toEqual(finalRegionManifest.hitAreas
        .filter((area) => area.view === targetView.view && area.canonicalId === targetView.canonicalId)
        .map((area) => area.id).sort());
    }
  });

  it("uses stable semantic IDs without view, side, locale, or display text", () => {
    for (const target of ADVANCED_MUSCLE_TARGETS) {
      expect(target.id).not.toMatch(/front|back|left|right|locale|\s/);
      expect(target.nameKey).toBe(`train.muscleAtlas.targets.${target.id}.name`);
      expect(sanitizeAdvancedMuscleTargetId(target.id)).not.toContain(".");
    }
  });

  it("classifies every target according to the approved surface-anatomy contract", () => {
    const trainingRegions = new Set([
      "pectoralis.upper", "pectoralis.middle", "pectoralis.lower", "pectoralis.outer",
      "latissimus.upper", "latissimus.middle", "latissimus.lower", "latissimus.outer",
      "rectus_abdominis.upper", "rectus_abdominis.middle", "rectus_abdominis.lower",
      "oblique.external_upper", "oblique.external_lower", "spinal_erectors.upper", "spinal_erectors.lower",
      "hip_flexors.anterior", "gluteus_maximus.upper", "gluteus_maximus.middle", "gluteus_maximus.lower",
      "adductors.anterior_region", "adductors.posterior_region"
    ]);
    const anatomicalTargets = new Set([
      "neck.sternocleidomastoid", "infraspinatus", "teres_minor", "teres_major", "serratus.anterior",
      "brachialis", "brachioradialis", "forearm.pronator_teres", "forearm.flexor_mass", "forearm.extensor_mass",
      "tensor_fasciae_latae", "gluteus.medius",
      "quadriceps.rectus_femoris", "quadriceps.vastus_lateralis", "quadriceps.vastus_medialis",
      "hamstrings.biceps_femoris_long_head", "hamstrings.biceps_femoris_short_head",
      "hamstrings.semitendinosus", "hamstrings.semimembranosus",
      "lower_leg.tibialis_anterior", "lower_leg.fibularis", "calf.soleus"
    ]);

    for (const target of ADVANCED_MUSCLE_TARGETS) {
      const expected = trainingRegions.has(target.id)
        ? "training_region"
        : anatomicalTargets.has(target.id)
          ? "anatomical"
          : "anatomical_subdivision";
      expect(target.regionType, target.id).toBe(expected);
    }
  });

  it("preserves approved source bytes and records grayscale-registered semantic regions", () => {
    const approved = JSON.parse(readFileSync(resolve(sourceRoot, "asset-manifest.json"), "utf8")) as {
      files: Array<{ name: string; sha256: string; bytes: number; role: string; used_for_generation?: boolean; used_at_runtime?: boolean }>;
      semantic_geometry_files: Array<{ name: string; sha256: string; bytes: number; role: string }>;
    };
    for (const asset of approved.files) {
      expect(sha256(asset.name)).toBe(asset.sha256);
      expect(readFileSync(resolve(sourceRoot, asset.name))).toHaveLength(asset.bytes);
    }
    expect(approved.files.filter((asset) => asset.name.startsWith("muscle-mask-"))).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "rejected_painter_provenance_only", used_for_generation: false, used_at_runtime: false })
    ]));
    for (const asset of approved.semantic_geometry_files) {
      const bytes = readFileSync(resolve(sourceRoot, asset.name));
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(asset.sha256);
      expect(bytes).toHaveLength(asset.bytes);
      expect(asset.role).toBe("grayscale_registered_semantic_geometry_authority");
    }
    expect(finalRegionManifest.schemaVersion).toBe("advanced_visible_v1_semantic_regions_v2");
    expect(finalRegionManifest.views.front).toMatchObject({
      semanticSourceFile: "semantic/muscle-semantic-front.svg",
      semanticGroupCount: 56,
      grayscaleAuthoritySha256: "7d9107aeb109d13bbf6622d849bba6640c02d2e1e8640cf91bfe7fecc612196c"
    });
    expect(finalRegionManifest.views.back).toMatchObject({
      semanticSourceFile: "semantic/muscle-semantic-back.svg",
      semanticGroupCount: 60,
      grayscaleAuthoritySha256: "f7f59e9f4f843a43f9d02743160092967321a324f1cfd6079015c26100584d67"
    });
    for (const view of ["front", "back"] as const) {
      const source = readFileSync(resolve(semanticRoot, `muscle-semantic-${view}.svg`), "utf8");
      expect(createHash("sha256").update(source).digest("hex")).toBe(finalRegionManifest.views[view].semanticSourceSha256);
      expect(Buffer.byteLength(source)).toBe(finalRegionManifest.views[view].semanticSourceBytes);
      expect(source).toContain('viewBox="0 0 1024 1536"');
      expect(source).not.toMatch(/<(?:image|text|foreignObject|rect)\b|\btransform=|#[0-9a-f]{3,8}\b|\brgb\(|\bhsl\(/i);
    }
    expect(finalRegionManifest.runtimePaths).toHaveLength(116);
    expect(new Set(finalRegionManifest.runtimePaths.map((entry) => `${entry.view}:${entry.canonicalId}`)).size).toBe(58);
    expect(new Set(finalRegionManifest.runtimePaths.map((entry) => entry.side))).toEqual(new Set(["left", "right"]));
    expect(finalRegionManifest.logicalCanvas.viewBox).toBe("0 0 1024 1536");
    expect(finalRegionManifest.hitAreas).toHaveLength(6);
  });

  it("proves exact final-region coverage without overlap or neutral leakage", () => {
    expect(finalRegionManifest.validation).toMatchObject({
      bodySilhouetteBoundaryTolerancePixels: 2,
      crossTargetInteriorOverlapPixels: 0,
      bodySilhouetteLeakagePixels: 0,
      protectedNeutralCoveragePixels: 0,
      maximumSourceToRuntimeBoundaryDisplacementPixels: 0,
      isolatedMaximumBoundaryDisplacementPixels: 0,
      nonEmptyTargetViewCount: 58,
      views: {
        front: { semanticGroupCount: 56, targetViewCount: 28, crossTargetInteriorOverlapPixels: 0 },
        back: { semanticGroupCount: 60, targetViewCount: 30, crossTargetInteriorOverlapPixels: 0 }
      }
    });
    expect(finalRegionManifest.validation.perTargetView).toHaveLength(58);
    expect(finalRegionManifest.validation.perTargetView.every((entry) => entry.sideCount === 2
      && entry.pixelArea > 0 && entry.sourceToRuntimeBoundaryDisplacementPixels === 0)).toBe(true);
    expect(finalRegionManifest.validation.overlapMatrixPairCount).toBe(3310);
    expect(finalRegionManifest.validation.overlapMatrixSha256).toHaveLength(64);
    expect(finalRegionManifest.runtimePaths.every((entry) => entry.pathData.startsWith("M") && entry.pathSha256.length === 64)).toBe(true);
  });
});
