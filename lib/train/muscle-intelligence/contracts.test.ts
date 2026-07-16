import { describe, expect, it } from "vitest";
import {
  MUSCLE_CONTRIBUTIONS,
  isMuscleContribution,
  isValidRoleContribution,
  validateMuscleMappingEntries
} from "./contracts";

const entry = {
  muscleId: "pectoralis_major" as const,
  role: "primary" as const,
  contribution: 1 as const,
  sideScope: "bilateral" as const,
  sortOrder: 1
};

describe("muscle mapping contracts", () => {
  it("allows only approved discrete contribution values and role pairs", () => {
    expect(MUSCLE_CONTRIBUTIONS).toEqual([1, 0.75, 0.5, 0.25, 0]);
    expect(isMuscleContribution(0.75)).toBe(true);
    expect(isMuscleContribution(0.3)).toBe(false);
    expect(isValidRoleContribution("primary", 1)).toBe(true);
    expect(isValidRoleContribution("secondary", 0.5)).toBe(true);
    expect(isValidRoleContribution("stabilizer", 0)).toBe(true);
    expect(isValidRoleContribution("primary", 0.5)).toBe(false);
  });

  it("rejects unknown muscles, arbitrary values, invalid sides, and duplicate muscles", () => {
    expect(() => validateMuscleMappingEntries([{ ...entry, muscleId: "unknown" }])).toThrow(/unknown canonical/i);
    expect(() => validateMuscleMappingEntries([{ ...entry, contribution: -1 }])).toThrow(/approved discrete/i);
    expect(() => validateMuscleMappingEntries([{ ...entry, contribution: 0.3 }])).toThrow(/approved discrete/i);
    expect(() => validateMuscleMappingEntries([{ ...entry, sideScope: "center" }])).toThrow(/side scope/i);
    expect(() => validateMuscleMappingEntries([entry, { ...entry, role: "secondary", contribution: 0.5, sortOrder: 2 }])).toThrow(/duplicate muscle/i);
  });

  it("requires a primary for published mappings and keeps stabilizers at zero", () => {
    expect(() => validateMuscleMappingEntries([{ ...entry, role: "secondary", contribution: 0.5 }], { requirePrimary: true })).toThrow(/requires at least one primary/i);
    expect(() => validateMuscleMappingEntries([{ ...entry, role: "stabilizer", contribution: 0.25 }])).toThrow(/incompatible/i);
    expect(validateMuscleMappingEntries([{ ...entry, role: "stabilizer", contribution: 0 }])[0]).toMatchObject({ role: "stabilizer", contribution: 0 });
  });
});
