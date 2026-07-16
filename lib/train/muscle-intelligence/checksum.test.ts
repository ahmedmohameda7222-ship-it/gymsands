import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateMuscleMappingChecksum, canonicalizeMuscleMapping } from "./server";

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

  it("keeps the root entry client-safe and exposes checksums only through the server entry", () => {
    const rootEntryPath = resolve(process.cwd(), "lib/train/muscle-intelligence/index.ts");
    const rootEntry = readFileSync(rootEntryPath, "utf8");
    const serverEntry = readFileSync(resolve(process.cwd(), "lib/train/muscle-intelligence/server.ts"), "utf8");
    const visited = new Set<string>();

    function expectClientSafeModule(modulePath: string): void {
      if (visited.has(modulePath)) return;
      visited.add(modulePath);
      const source = readFileSync(modulePath, "utf8");
      expect(source, modulePath).not.toMatch(/from ["']node:/);
      for (const match of source.matchAll(/from ["'](\.\/[^"']+)["']/g)) {
        expectClientSafeModule(resolve(dirname(modulePath), `${match[1]}.ts`));
      }
    }

    expect(rootEntry).not.toContain("./checksum");
    expect(rootEntry).not.toContain("./server");
    expect(serverEntry).toContain('from "./checksum"');
    expectClientSafeModule(rootEntryPath);
  });
});
