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

  it("preserves approved source bytes and records final-visible semantic regions", () => {
    const approved = JSON.parse(readFileSync(resolve(sourceRoot, "asset-manifest.json"), "utf8")) as {
      files: Array<{ name: string; sha256: string; bytes: number }>;
    };
    for (const asset of approved.files) {
      expect(sha256(asset.name)).toBe(asset.sha256);
      expect(readFileSync(resolve(sourceRoot, asset.name))).toHaveLength(asset.bytes);
    }
    expect(finalRegionManifest.views.front.sourcePathCount + finalRegionManifest.views.back.sourcePathCount).toBe(220);
    const allRegions = [...finalRegionManifest.views.front.regions, ...finalRegionManifest.views.back.regions];
    expect(new Set(allRegions.map((region) => region.sourceComponentFingerprint)).size).toBe(allRegions.length);
    expect(allRegions.every((region) => region.classification === "target" || region.classification === "excluded")).toBe(true);
    expect([...new Set(allRegions.flatMap((region) => region.classification === "target" && region.canonicalId ? [region.canonicalId] : []))].sort())
      .toEqual(ADVANCED_MUSCLE_TARGETS.map((target) => target.id).sort());
    expect(finalRegionManifest.runtimePaths).toHaveLength(118);
    expect(finalRegionManifest.logicalCanvas.viewBox).toBe("0 0 1024 1536");
    expect(finalRegionManifest.hitAreas).toHaveLength(6);
  });

  it("proves exact final-region coverage without overlap or neutral leakage", () => {
    expect(finalRegionManifest.validation).toMatchObject({
      antialiasTolerancePixels: 0,
      crossTargetInteriorOverlapPixels: 0,
      neutralLeakagePixels: 0,
      unclassifiedClassifiedSourcePixels: 0,
      unclassifiedPercent: 0,
      minimumTargetViewIoU: 1,
      views: {
        front: { aggregateIoU: 1 },
        back: { aggregateIoU: 1 }
      }
    });
    expect(finalRegionManifest.validation.perTargetView).toHaveLength(58);
    expect(finalRegionManifest.validation.perTargetView.every((entry) => entry.iou >= 0.99)).toBe(true);
    expect(finalRegionManifest.runtimePaths.every((entry) => entry.pathData.startsWith("M") && entry.pathSha256.length === 64)).toBe(true);
  });
});
