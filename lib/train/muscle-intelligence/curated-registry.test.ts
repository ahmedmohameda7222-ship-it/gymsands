import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { calculateMuscleLoad } from "./calculate-muscle-load";
import type { MuscleMappingEntry } from "./contracts";
import {
  CuratedRegistryValidationError,
  goldenPlanExerciseSlugs,
  uuidV5,
  validateCuratedExerciseRegistry,
  validateGoldenPlanFixtures,
  type CuratedExerciseRegistry
} from "./curated-registry";
import { MUSCLE_MAPPING_SCHEMA_VERSION } from "./versions";

const registryPath = "data/muscle-intelligence/v1/registry.json";
const goldenPlansPath = "data/muscle-intelligence/v1/golden-plans.json";
const registryValue = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
const registry = validateCuratedExerciseRegistry(registryValue);
const goldenPlans = validateGoldenPlanFixtures(JSON.parse(readFileSync(goldenPlansPath, "utf8")), registry);

function cloneRegistry(): CuratedExerciseRegistry {
  return structuredClone(registry);
}

describe("Phase 2 curated exercise registry", () => {
  it("validates every authoritative count, identity, checksum, provider decision, and coverage rule", () => {
    expect(registry.exercises).toHaveLength(60);
    expect(registry.relationships).toHaveLength(32);
    expect(registry.exercises.flatMap((exercise) => Object.keys(exercise.localizations))).toHaveLength(180);
    expect(registry.exercises.flatMap((exercise) => exercise.aliases)).toHaveLength(180);
    expect(registry.exercises.flatMap((exercise) => exercise.entries)).toHaveLength(180);
    expect(registry.exercises.filter((exercise) => exercise.provider_decision.status === "verified_exact_match")).toHaveLength(9);
    expect(registry.exercises.filter((exercise) => exercise.provider_decision.status === "no_verified_match_current_catalog")).toHaveLength(51);
  });

  it("rejects checksum drift instead of repairing the authority input", () => {
    const invalid = cloneRegistry();
    invalid.exercises[0].mapping_checksum = "0".repeat(64);
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/checksum mismatch/i);
  });

  it("rejects normalized alias collisions", () => {
    const invalid = cloneRegistry();
    invalid.exercises[1].aliases[0].alias = `  ${invalid.exercises[0].aliases[0].alias.toUpperCase()}  `;
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/alias collision/i);
  });

  it("rejects unapproved provider identity links and name-only fallback", () => {
    const invalid = cloneRegistry();
    invalid.exercises.find((exercise) => exercise.provider_decision.status === "no_verified_match_current_catalog")!.provider_decision = {
      status: "verified_by_similar_name",
      provider: "plaivra_activity_catalog",
      provider_activity_id: "name-fallback"
    };
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/provider decision/i);
  });

  it("rejects progression/regression cycles", () => {
    const invalid = cloneRegistry();
    invalid.relationships[0] = {
      ...invalid.relationships[0],
      source_slug: invalid.relationships[18].target_slug,
      target_slug: invalid.relationships[18].source_slug,
      relationship_type: "regression"
    };
    invalid.relationships[18] = { ...invalid.relationships[18], relationship_type: "progression" };
    for (const relation of [invalid.relationships[0], invalid.relationships[18]]) {
      relation.relationship_id = uuidV5(`https://plaivra.com/exercise-relationships/v1/${relation.source_slug}/${relation.relationship_type}/${relation.target_slug}`);
    }
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/cycle/i);
  });

  it("keeps unilateral execution outside generic canonical side scope", () => {
    expect(registry.exercises.flatMap((exercise) => exercise.entries).every((entry) => entry.side_scope === "bilateral")).toBe(true);
    expect(registry.side_scope_rule).toBe("Generic canonical definitions are bilateral; performed side is captured later.");
  });

  it("validates the five golden plans and exact 60-exercise coverage", () => {
    expect(goldenPlans.map((plan) => plan.kind)).toEqual([
      "beginner_full_body_week",
      "upper_lower_split",
      "push_pull_legs_split",
      "bodyweight_focused",
      "machine_cable_focused"
    ]);
    expect(new Set(goldenPlans.flatMap(goldenPlanExerciseSlugs))).toEqual(new Set(registry.exercises.map((exercise) => exercise.slug)));
    expect(goldenPlans.find((plan) => plan.kind === "beginner_full_body_week")?.sessions.map((session) => session.focus)).toEqual(["full_body", "full_body", "full_body"]);
    expect(goldenPlans.find((plan) => plan.kind === "upper_lower_split")?.sessions.map((session) => session.focus)).toEqual(["upper", "lower", "upper", "lower"]);
    expect(goldenPlans.find((plan) => plan.kind === "push_pull_legs_split")?.sessions.map((session) => session.focus)).toEqual(["push", "pull", "legs", "push", "pull", "legs"]);
  });

  it("rejects exercises assigned outside a golden-plan session focus", () => {
    const invalid = structuredClone(goldenPlans);
    const pushSession = invalid[2].sessions[0];
    const pullSession = invalid[2].sessions[1];
    [pushSession.exerciseSlugs[0], pullSession.exerciseSlugs[0]] = [pullSession.exerciseSlugs[0], pushSession.exerciseSlugs[0]];
    expect(() => validateGoldenPlanFixtures(invalid, registry)).toThrow(/violates its push focus/i);
  });

  it("produces stable golden-plan serialization independent of input order", () => {
    const exercisesBySlug = new Map(registry.exercises.map((exercise) => [exercise.slug, exercise]));
    for (const plan of goldenPlans) {
      const items = goldenPlanExerciseSlugs(plan).map((slug) => {
        const exercise = exercisesBySlug.get(slug)!;
        return {
          itemId: `${plan.id}:${slug}`,
          mapping: {
            mappingSetId: exercise.mapping_set_id,
            targetId: exercise.exercise_id,
            targetType: "global_exercise" as const,
            mappingVersion: 1,
            schemaVersion: MUSCLE_MAPPING_SCHEMA_VERSION,
            checksum: exercise.mapping_checksum,
            entries: exercise.entries.map((entry) => ({
              muscleId: entry.muscle_id as MuscleMappingEntry["muscleId"],
              role: entry.role as MuscleMappingEntry["role"],
              contribution: entry.contribution as MuscleMappingEntry["contribution"],
              sideScope: entry.side_scope as MuscleMappingEntry["sideScope"],
              sortOrder: entry.sort_order
            }))
          },
          workload: { model: "resistance_sets_v1" as const, qualifyingSets: 1 }
        };
      });
      const original = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items });
      const reordered = calculateMuscleLoad({ mode: "planned", period: { kind: "week" }, items: [...items].reverse().map((item) => ({ ...item, mapping: { ...item.mapping, entries: [...item.mapping.entries].reverse() } })) });
      expect(JSON.stringify(original)).toBe(JSON.stringify(reordered));
    }
  });

  it("rejects golden-plan name or provider fallback identities", () => {
    const invalid = structuredClone(goldenPlans);
    invalid[0].sessions[0].exerciseSlugs[0] = registry.exercises[0].name;
    expect(() => validateGoldenPlanFixtures(invalid, registry)).toThrow(CuratedRegistryValidationError);
    expect(() => validateGoldenPlanFixtures(invalid, registry)).toThrow(/identity fallback is forbidden/i);
  });
});
