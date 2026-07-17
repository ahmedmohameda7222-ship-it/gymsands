import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { activityToWorkout } from "@/lib/activity-catalog/adapter";
import { normalizeLegacyInstructions } from "./legacy-instructions";
import {
  __resetLegacyCatalogSnapshotCacheForTests,
  LegacyActivityCatalogProvider
} from "./legacy-provider";

type CuratedExercise = {
  exercise_id: string;
  slug: string;
  name: string;
  instructions: Array<{ order: number; text: string }>;
};

const registry = JSON.parse(readFileSync(resolve(process.cwd(), "data/muscle-intelligence/v1/registry.json"), "utf8")) as {
  exercises: CuratedExercise[];
};
const curatedExercise = registry.exercises[0];

function legacySupabase(row: Record<string, unknown>): SupabaseClient {
  const results: Record<string, Array<Record<string, unknown>>> = {
    exercises: [row],
    workouts: [],
    exercise_videos: []
  };
  return {
    from(table: string) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return chain; },
        async limit() { return { data: results[table] ?? [], error: null }; }
      };
      return chain;
    }
  } as unknown as SupabaseClient;
}

describe("legacy Activity Catalog instruction normalization", () => {
  beforeEach(() => {
    __resetLegacyCatalogSnapshotCacheForTests();
  });

  it("parses a real Phase 2 four-step payload into ordered readable steps", () => {
    const result = normalizeLegacyInstructions(JSON.stringify(curatedExercise.instructions));

    expect(result).toEqual(curatedExercise.instructions);
    expect(result).toHaveLength(4);
  });

  it("normalizes all 60 curated instruction payloads without exposing raw JSON", () => {
    expect(registry.exercises).toHaveLength(60);
    for (const exercise of registry.exercises) {
      const encoded = JSON.stringify(exercise.instructions);
      const result = normalizeLegacyInstructions(encoded);
      expect(result).toEqual(exercise.instructions);
      expect(result.map((step) => step.text).join("\n")).not.toContain(encoded);
    }
  });

  it("sorts valid entries and preserves source order for tied positions while ignoring invalid entries", () => {
    const result = normalizeLegacyInstructions(JSON.stringify([
      { order: 2, text: "  Second  " },
      { order: 1, text: "First" },
      { order: 2, text: "Third with tied order" },
      { order: 0, text: "Invalid order" },
      { order: 3, text: "   " },
      null
    ]));

    expect(result).toEqual([
      { order: 1, text: "First" },
      { order: 2, text: "Second" },
      { order: 2, text: "Third with tied order" }
    ]);
  });

  it("preserves ordinary and malformed legacy text as one safe step", () => {
    expect(normalizeLegacyInstructions("  Brace, then move with control.  ")).toEqual([
      { order: 1, text: "Brace, then move with control." }
    ]);
    expect(normalizeLegacyInstructions("[{ malformed json")).toEqual([
      { order: 1, text: "[{ malformed json" }
    ]);
  });

  it("falls back to the original text when a structured array has no valid steps", () => {
    const invalid = JSON.stringify([{ order: 0, text: "Ignored" }, { order: 1, text: " " }]);
    expect(normalizeLegacyInstructions(invalid)).toEqual([{ order: 1, text: invalid }]);
    expect(normalizeLegacyInstructions("[]")).toEqual([{ order: 1, text: "[]" }]);
  });

  it("returns an empty list and never throws for empty or arbitrary non-string legacy values", () => {
    for (const value of [null, undefined, "", "   ", 42, {}, []]) {
      expect(() => normalizeLegacyInstructions(value)).not.toThrow();
      expect(normalizeLegacyInstructions(value)).toEqual([]);
    }
  });

  it("renders curated instructions through the legacy provider and final workout adapter without raw JSON", async () => {
    const encodedInstructions = JSON.stringify(curatedExercise.instructions);
    const provider = new LegacyActivityCatalogProvider(legacySupabase({
      id: curatedExercise.exercise_id,
      slug: curatedExercise.slug,
      name: curatedExercise.name,
      category: "Strength",
      target_muscle: "Chest",
      instructions: encodedInstructions,
      is_global: true,
      is_approved: true
    }));

    const result = await provider.getActivity(curatedExercise.exercise_id);
    const workout = activityToWorkout(result.data, result.meta);

    expect(workout.instructions).toBe(curatedExercise.instructions.map((step) => step.text).join("\n"));
    expect(workout.instruction_steps).toEqual(curatedExercise.instructions);
    expect(workout.instructions).not.toContain(encodedInstructions);
    expect(workout.instructions).not.toMatch(/^\s*\[/);
  });
});
