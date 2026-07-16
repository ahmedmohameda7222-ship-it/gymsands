import { describe, expect, it } from "vitest";
import { calculateMuscleMappingChecksum, canonicalizeMuscleMapping } from "./checksum";

const entries = [
  { muscleId: "triceps_brachii" as const, role: "secondary" as const, contribution: 0.5 as const, sideScope: "bilateral" as const, sortOrder: 2 },
  { muscleId: "pectoralis_major" as const, role: "primary" as const, contribution: 1 as const, sideScope: "bilateral" as const, sortOrder: 1 }
];

describe("muscle mapping checksum", () => {
  it("is SHA-256 hex and independent of input order", () => {
    const checksum = calculateMuscleMappingChecksum(entries);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(checksum).toBe("ab7bbfdf8a3dcbd45acd9fd8b028d1bec0a7973b1ca75504c4e6f5a66b45afe1");
    expect(calculateMuscleMappingChecksum([...entries].reverse())).toBe(checksum);
  });

  it("contains semantic content but no database or presentation fields", () => {
    const canonical = canonicalizeMuscleMapping(entries);
    expect(canonical).toContain("exercise_muscle_mapping_v1");
    expect(canonical).toContain("pectoralis_major");
    expect(canonical).not.toContain("created_at");
    expect(canonical).not.toContain("Chest");
    expect(canonical).not.toContain("color");
  });
});
