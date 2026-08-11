import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DERIVED_METRICS_FORMULA_VERSION } from "@/lib/workouts/derived-metrics/contracts";
import { MAIN_ACTIVITY_CATALOG_V2_CAPABILITY } from "./v2-contract";
import { MAIN_ACTIVITY_CATALOG_V2_CAPABILITY_V2 } from "./v2-capability-manifest";

const ENGINE_AUTHORITY_SHA = "0a4c902a560542812de72cbc08dc90fe3fb7d147";
const BATCH2_BASE_SHA = "1dc4081a485a6871de04552192bc5eb2121a3270";
const BATCH2_AUTHORITY_SHA = "ede8d8c4eb89246ba237c714f9f262efa7c23007";

describe("P10 Batch 2 Main capability manifest v2", () => {
  it("preserves capability v1 unchanged", () => {
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY).toEqual({
      contractVersion: "main-activity-catalog-v2-capability-v1",
      sourceMainSha: "6ec12497612446a9a9dd6cc1d91709cc8f045b22",
      compatibleCatalogApiVersion: "v2",
      supportedWorkloadModels: [{
        modelKey: "resistance_sets",
        modelVersion: "v1",
        mainRuntimeConstant: "resistance_sets_v1",
        engineVersion: "muscle_load_resistance_sets_v2"
      }],
      supportedPrFormulas: []
    });
  });

  it("advertises exactly the proven v2 workload and PR capabilities", () => {
    expect(DERIVED_METRICS_FORMULA_VERSION).toBe("wh6-v1");
    expect(MAIN_ACTIVITY_CATALOG_V2_CAPABILITY_V2).toEqual({
      contractVersion: "main-activity-catalog-v2-capability-v2",
      sourceMainSha: ENGINE_AUTHORITY_SHA,
      compatibleCatalogApiVersion: "v2",
      supportedWorkloadModels: [
        { modelKey: "resistance_sets", modelVersion: "v1", mainRuntimeConstant: "resistance_sets_v1", engineVersion: "muscle_load_resistance_sets_v2" },
        { modelKey: "duration_exposure", modelVersion: "v1", mainRuntimeConstant: "duration_exposure_v1", engineVersion: "muscle_exposure_duration_v1" }
      ],
      supportedPrFormulas: [
        { formulaKey: "highest_load", formulaVersion: "wh6-v1" },
        { formulaKey: "estimated_one_rep_max", formulaVersion: "wh6-v1" },
        { formulaKey: "exercise_session_volume", formulaVersion: "wh6-v1" },
        { formulaKey: "same_load_max_repetitions", formulaVersion: "wh6-v1" },
        { formulaKey: "longest_duration", formulaVersion: "v1" },
        { formulaKey: "longest_distance", formulaVersion: "v1" }
      ]
    });
  });

  it("proves engine and closed Batch 2 authority are ancestors of the exact checked-out head", () => {
    const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    expect(() => execFileSync("git", ["merge-base", "--is-ancestor", ENGINE_AUTHORITY_SHA, head])).not.toThrow();
    expect(() => execFileSync("git", ["merge-base", "--is-ancestor", BATCH2_AUTHORITY_SHA, head])).not.toThrow();
  });

  it("keeps the closed Batch 2 diff free of Main database migrations and provider/environment edits", () => {
    const changed = execFileSync("git", ["diff", "--name-only", `${BATCH2_BASE_SHA}...${BATCH2_AUTHORITY_SHA}`], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
    expect(changed.some((file) => file.startsWith("supabase/migrations/"))).toBe(false);
    expect(changed.some((file) => /activity-catalog\/server\/.*provider|\.env|environment/i.test(file))).toBe(false);
  });

  it("keeps the dormant duration engine outside current Heat Map and PR runtime imports", () => {
    const needle = "dormant-runtime-capabilities";
    const roots = ["lib/train/muscle-intelligence", "lib/workouts/derived-metrics", "services/activity-catalog/server"];
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
    });
    expect(roots.flatMap(walk).filter((file) => fs.readFileSync(file, "utf8").includes(needle))).toEqual([]);
  });
});