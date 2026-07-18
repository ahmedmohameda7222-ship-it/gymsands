import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import sourceAssignments from "@/data/muscle-intelligence/advanced-visible-v1/source-path-assignments.json";
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
      const sourcePaths = sourceAssignments.views[targetView.view].paths.filter((path) => path.classification === "target" && path.canonicalId === targetView.canonicalId);
      expect(targetView.bindings.map((binding) => binding.side).sort()).toEqual([...new Set(sourcePaths.map((path) => path.side))].sort());
      expect(targetView.hitAreaIds).toEqual(sourceAssignments.hitAreas
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

  it("preserves approved source bytes and records every source path exactly once", () => {
    const approved = JSON.parse(readFileSync(resolve(sourceRoot, "asset-manifest.json"), "utf8")) as {
      files: Array<{ name: string; sha256: string; bytes: number }>;
    };
    for (const asset of approved.files) {
      expect(sha256(asset.name)).toBe(asset.sha256);
      expect(readFileSync(resolve(sourceRoot, asset.name))).toHaveLength(asset.bytes);
    }
    const allPaths = [...sourceAssignments.views.front.paths, ...sourceAssignments.views.back.paths];
    expect(allPaths).toHaveLength(220);
    expect(new Set(allPaths.map((path) => path.sourcePathId)).size).toBe(220);
    expect(allPaths.every((path) => path.classification === "target" || path.classification === "excluded")).toBe(true);
    expect(allPaths.filter((path) => path.classification === "target")).toHaveLength(183);
    expect(allPaths.filter((path) => path.classification === "excluded")).toHaveLength(37);
    expect([...new Set(allPaths.flatMap((path) => path.classification === "target" && path.canonicalId ? [path.canonicalId] : []))].sort())
      .toEqual(ADVANCED_MUSCLE_TARGETS.map((target) => target.id).sort());
    expect(sourceAssignments.logicalCanvas.viewBox).toBe("0 0 1024 1536");
    expect(sourceAssignments.hitAreas).toHaveLength(6);
  });
});
