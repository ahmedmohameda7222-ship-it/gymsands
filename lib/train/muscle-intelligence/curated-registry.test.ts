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

describe("curated exercise registry integrity", () => {
  it("validates the current registry without coupling validity to cohort counts", () => {
    expect(registry.exercises.length).toBeGreaterThan(0);
    expect(new Set(registry.exercises.map((exercise) => exercise.exercise_id)).size).toBe(registry.exercises.length);
    expect(new Set(registry.exercises.map((exercise) => exercise.slug)).size).toBe(registry.exercises.length);
  });

  it("accepts a valid future exercise without changing hard-coded count contracts", () => {
    const expanded = cloneRegistry();
    const base = expanded.exercises[0];
    const slug = "future-curated-exercise";
    const mappingVersion = 1;

    expanded.exercises.push({
      ...structuredClone(base),
      ordinal: Math.max(...expanded.exercises.map((exercise) => exercise.ordinal)) + 1,
      exercise_id: uuidV5(`https://plaivra.com/exercises/v1/${slug}`),
      mapping_set_id: uuidV5(`https://plaivra.com/exercises/v1/${slug}/mapping/${mappingVersion}`),
      mapping_version: mappingVersion,
      source_id: `plaivra_curated:v1:${slug}`,
      name: "Future Curated Exercise",
      slug,
      localizations: {
        en: { name: "Future Curated Exercise" },
        de: { name: "Künftige kuratierte Übung" },
        ar: { name: "تمرين منسق مستقبلي" }
      },
      aliases: [
        { locale: "en", alias: "Future Curated Movement", alias_type: "common_name", searchable: true }
      ],
      evidence_codes: [],
      instructions: [{ order: 1, text: "Perform the movement with controlled technique." }],
      short_description: "A future curated exercise used to prove scalable validation.",
      provider_decision: { status: "no_verified_match_current_catalog" }
    });

    expect(() => validateCuratedExerciseRegistry(expanded)).not.toThrow();
  });

  it("allows additional valid aliases without requiring a fixed alias total", () => {
    const expanded = cloneRegistry();
    expanded.exercises[0].aliases.push({
      locale: "en",
      alias: "Additional Bench Alias",
      alias_type: "common_name",
      searchable: true
    });
    expect(() => validateCuratedExerciseRegistry(expanded)).not.toThrow();
  });

  it("rejects checksum drift instead of repairing mapping authority", () => {
    const invalid = cloneRegistry();
    invalid.exercises[0].mapping_checksum = "0".repeat(64);
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/checksum mismatch/i);
  });

  it("rejects normalized alias collisions", () => {
    const invalid = cloneRegistry();
    invalid.exercises[1].aliases[0].alias = `  ${invalid.exercises[0].aliases[0].alias.toUpperCase()}  `;
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/alias collision/i);
  });

  it("rejects unverified provider identity inference", () => {
    const invalid = cloneRegistry();
    invalid.exercises.find((exercise) => exercise.provider_decision.status === "no_verified_match_current_catalog")!.provider_decision = {
      status: "verified_by_similar_name",
      provider: "plaivra_activity_catalog",
      provider_activity_id: "name-fallback"
    };
    expect(() => validateCuratedExerciseRegistry(invalid)).toThrow(/provider decision/i);
  });

  it("keeps unilateral execution outside generic canonical side scope", () => {
    expect(registry.exercises.flatMap((exercise) => exercise.entries).every((entry) => entry.side_scope === "bilateral")).toBe(true);
    expect(registry.side_scope_rule).toBe("Generic canonical definitions are bilateral; performed side is captured later.");
  });

  it("validates golden fixtures by identity and structure without requiring complete registry coverage", () => {
    expect(goldenPlans.length).toBeGreaterThan(0);
    for (const plan of goldenPlans) {
      expect(plan.sessions.length).toBeGreaterThan(0);
      expect(goldenPlanExerciseSlugs(plan).length).toBeGreaterThan(0);
    }
  });

  it("rejects golden-plan name or provider fallback identities", () => {
    const invalid = structuredClone(goldenPlans);
    invalid[0].sessions[0].exerciseSlugs[0] = registry.exercises[0].name;
    expect(() => validateGoldenPlanFixtures(invalid, registry)).toThrow(CuratedRegistryValidationError);
    expect(() => validateGoldenPlanFixtures(invalid, registry)).toThrow(/identity fallback is forbidden/i);
  });

  it("produces stable analysis independent of input ordering", () => {
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
            mappingVersion: exercise.mapping_version,
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
      const reordered = calculateMuscleLoad({
        mode: "planned",
        period: { kind: "week" },
        items: [...items].reverse().map((item) => ({
          ...item,
          mapping: { ...item.mapping, entries: [...item.mapping.entries].reverse() }
        }))
      });
      expect(JSON.stringify(original)).toBe(JSON.stringify(reordered));
    }
  });
});
