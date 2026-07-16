import { describe, expect, it } from "vitest";
import {
  CANONICAL_MUSCLES,
  CANONICAL_MUSCLE_IDS,
  MUSCLE_VIEWS,
  getCanonicalMuscle,
  isCanonicalMuscleId
} from "./taxonomy";

const expectedIds = [
  "pectoralis_major", "anterior_deltoid", "lateral_deltoid", "posterior_deltoid", "trapezius",
  "latissimus_dorsi", "upper_back", "biceps_brachii", "triceps_brachii", "forearms", "rotator_cuff",
  "serratus_anterior", "rectus_abdominis", "obliques", "erector_spinae", "gluteus_maximus",
  "gluteus_medius", "quadriceps", "hamstrings", "adductors", "hip_flexors", "gastrocnemius",
  "soleus", "tibialis_anterior"
];

describe("canonical muscle taxonomy", () => {
  it("contains the exact 24 IDs once in stable display order", () => {
    expect(CANONICAL_MUSCLES).toHaveLength(24);
    expect(CANONICAL_MUSCLE_IDS).toEqual(expectedIds);
    expect(new Set(CANONICAL_MUSCLE_IDS).size).toBe(24);
    expect(CANONICAL_MUSCLES.map((muscle) => muscle.displayOrder)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });

  it("has all translations and only approved views", () => {
    for (const muscle of CANONICAL_MUSCLES) {
      expect(muscle.labels.en.trim()).not.toBe("");
      expect(muscle.labels.ar.trim()).not.toBe("");
      expect(muscle.labels.de.trim()).not.toBe("");
      expect(muscle.supportedViews.length).toBeGreaterThan(0);
      expect(muscle.supportedViews.every((view) => MUSCLE_VIEWS.includes(view))).toBe(true);
    }
  });

  it("provides safe lookup and type guarding", () => {
    expect(isCanonicalMuscleId("quadriceps")).toBe(true);
    expect(isCanonicalMuscleId("not_a_muscle")).toBe(false);
    expect(getCanonicalMuscle("quadriceps")?.labels.de).toBe("Vordere Oberschenkel");
    expect(getCanonicalMuscle("not_a_muscle")).toBeUndefined();
  });
});
