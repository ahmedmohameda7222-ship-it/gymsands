import { describe, expect, it } from "vitest";
import {
  AdvancedExposureInputError,
  calculateAdvancedExposure,
  getAdvancedExercisePreview,
  getAdvancedHeatLevel,
  type AdvancedMuscleMappingReference
} from "./advanced-exposure";

const mapping: AdvancedMuscleMappingReference = {
  mappingSetId: "advanced-map-1",
  targetId: "exercise-1",
  targetType: "global_exercise",
  mappingVersion: 2,
  schemaVersion: "exercise_muscle_mapping_v2",
  checksum: "a".repeat(64),
  entries: [
    { muscleId: "pectoralis.upper", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 1 },
    { muscleId: "pectoralis.middle", role: "primary", contribution: 0.75, sideScope: "bilateral", sortOrder: 2 },
    { muscleId: "triceps.long_head", role: "secondary", contribution: 0.5, sideScope: "bilateral", sortOrder: 3 },
    { muscleId: "serratus.anterior", role: "stabilizer", contribution: 0, sideScope: "bilateral", sortOrder: 4 }
  ]
};

describe("advanced muscle exposure", () => {
  it("uses absolute single-session and plan-cycle boundaries", () => {
    expect([0, 1.999999, 2, 4.999999, 5].map((score) => getAdvancedHeatLevel(score, "single_session")))
      .toEqual(["none", "light", "moderate", "moderate", "high"]);
    expect([0, 3.999999, 4, 8.999999, 9].map((score) => getAdvancedHeatLevel(score, "plan_cycle")))
      .toEqual(["none", "light", "moderate", "moderate", "high"]);
  });

  it("is deterministic, input-order independent, bounded, and leaves inputs unchanged", () => {
    const items = [
      { itemId: "b", mapping, qualifyingSets: 2 },
      { itemId: "a", mapping: { ...mapping, mappingSetId: "advanced-map-2", targetId: "exercise-2" }, qualifyingSets: 3 }
    ] as const;
    const before = JSON.stringify(items);
    const forward = calculateAdvancedExposure({ scope: "single_session", items });
    const reverse = calculateAdvancedExposure({ scope: "single_session", items: [...items].reverse() });
    expect(forward).toEqual(reverse);
    expect(JSON.stringify(items)).toBe(before);
    expect(forward.targets.find((target) => target.targetId === "pectoralis.upper")).toMatchObject({ rawExposure: 5, heatLevel: "high" });
    expect(forward.targets.find((target) => target.targetId === "pectoralis.middle")).toMatchObject({ rawExposure: 3.75, heatLevel: "moderate" });
    expect(forward.mappingVersionsUsed.map((used) => used.mappingSetId)).toEqual(["advanced-map-1", "advanced-map-2"]);
  });

  it("derives exercise preview roles without adding a database role", () => {
    const preview = getAdvancedExercisePreview(mapping);
    expect(preview.targets.find((target) => target.targetId === "pectoralis.upper")).toMatchObject({ previewRole: "primary", heatLevel: "high" });
    expect(preview.targets.find((target) => target.targetId === "pectoralis.middle")).toMatchObject({ previewRole: "co_primary", heatLevel: "moderate" });
    expect(preview.targets.find((target) => target.targetId === "triceps.long_head")).toMatchObject({ previewRole: "secondary", heatLevel: "moderate" });
    expect(preview.targets.find((target) => target.targetId === "serratus.anterior")).toMatchObject({ previewRole: "stabilizer", heatLevel: "light" });
    const tiedPreview = getAdvancedExercisePreview({
      ...mapping,
      entries: [...mapping.entries, {
        muscleId: "pectoralis.outer", role: "primary", contribution: 1, sideScope: "bilateral", sortOrder: 5
      }]
    });
    expect(tiedPreview.targets.filter((target) => target.previewRole === "primary").map((target) => target.targetId))
      .toEqual(["pectoralis.upper", "pectoralis.outer"]);
  });

  it("records unmapped coverage without inventing exposure", () => {
    const result = calculateAdvancedExposure({
      scope: "plan_cycle",
      items: [{ itemId: "mapped", mapping, qualifyingSets: 3 }, { itemId: "unmapped", mapping: null, qualifyingSets: 3 }]
    });
    expect(result.completeness).toBe("partial");
    expect(result.coverage).toEqual({ totalItemCount: 2, includedItemCount: 1, unmappedItemCount: 1 });
    expect(result.warnings).toEqual(["unmapped_items"]);
  });

  it("fails closed on duplicate items, unknown targets, and invalid set counts", () => {
    expect(() => calculateAdvancedExposure({ scope: "single_session", items: [
      { itemId: "duplicate", mapping, qualifyingSets: 1 },
      { itemId: "duplicate", mapping, qualifyingSets: 1 }
    ] })).toThrow(AdvancedExposureInputError);
    expect(() => calculateAdvancedExposure({ scope: "single_session", items: [{ itemId: "negative", mapping, qualifyingSets: -1 }] }))
      .toThrow(AdvancedExposureInputError);
    for (const qualifyingSets of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => calculateAdvancedExposure({ scope: "single_session", items: [{ itemId: "non-finite", mapping, qualifyingSets }] }))
        .toThrow(AdvancedExposureInputError);
    }
    expect(() => calculateAdvancedExposure({ scope: "single_session", items: [{
      itemId: "unknown",
      mapping: { ...mapping, entries: [{ ...mapping.entries[0], muscleId: "invented.region" as never }] },
      qualifyingSets: 1
    }] })).toThrow(AdvancedExposureInputError);
  });
});
