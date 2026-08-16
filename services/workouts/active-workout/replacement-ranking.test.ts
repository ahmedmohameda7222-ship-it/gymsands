import { describe, expect, it } from "vitest";

import type { ReplacementEligibility } from "@/services/database/workout-replacement-eligibility";
import type { ExerciseAlternativeReason, UserExerciseAlternative, Workout } from "@/types";
import {
  ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION,
  rankActiveWorkoutReplacements,
  replacementProfileFromWorkout,
} from "./replacement-ranking";

function workout(id: string, patch: Partial<Workout> = {}): Workout {
  return {
    id,
    name: id,
    category: "strength",
    target_muscle: "chest",
    equipment: "barbell",
    difficulty: "intermediate",
    sets: 3,
    reps: "8-10",
    rest_seconds: 90,
    instructions: "",
    notes: null,
    movement_pattern: "horizontal push",
    mechanics: "compound",
    force_type: "push",
    secondary_muscles: ["triceps", "front delts"],
    catalog_degraded: false,
    is_global: true,
    ...patch,
  };
}

function eligible(items: readonly Workout[], denied: string[] = []) {
  return new Map(items.map((item) => [item.id, {
    eligible: !denied.includes(item.id),
    reason: denied.includes(item.id) ? "missing_mapping" : null,
  } satisfies ReplacementEligibility]));
}

function rank(reason: ExerciseAlternativeReason, candidates: Workout[], options?: {
  denied?: string[];
  saved?: UserExerciseAlternative[];
  used?: Set<string>;
}) {
  const original = workout("original");
  return rankActiveWorkoutReplacements({
    original: replacementProfileFromWorkout(original),
    candidates,
    eligibility: eligible(candidates, options?.denied),
    savedAlternatives: options?.saved,
    sessionExerciseIds: options?.used,
    reason,
  });
}

describe("Active Workout replacement ranking v1", () => {
  it("filters canonical ineligible candidates before ranking", () => {
    const best = workout("best", { equipment: "dumbbell" });
    const fallback = workout("fallback", { target_muscle: "shoulders", movement_pattern: "vertical push" });
    const ranked = rank("machine_taken", [best, fallback], { denied: ["best"] });
    expect(ranked.map((item) => item.workout.id)).toEqual(["fallback"]);
  });

  it("prefers the same muscle and movement over a poor muscle match", () => {
    const close = workout("close", { equipment: "dumbbell" });
    const poor = workout("poor", { target_muscle: "hamstrings", movement_pattern: "hinge", equipment: "dumbbell" });
    expect(rank("other", [poor, close])[0]?.workout.id).toBe("close");
  });

  it("changes machine-taken ranking toward different equipment", () => {
    const sameMachine = workout("same-machine", { equipment: "chest press machine" });
    const dumbbells = workout("dumbbells", { equipment: "dumbbells" });
    const original = workout("original", { equipment: "chest press machine" });
    const candidates = [sameMachine, dumbbells];
    const ranked = rankActiveWorkoutReplacements({
      original: replacementProfileFromWorkout(original),
      candidates,
      eligibility: eligible(candidates),
      reason: "machine_taken",
    });
    expect(ranked[0]?.workout.id).toBe("dumbbells");
    expect(ranked[0]?.reasons).toContain("different_equipment");
  });

  it("uses equipment-unavailable reason to prioritize alternate equipment", () => {
    const unavailable = workout("unavailable", { equipment: "barbell" });
    const cable = workout("cable", { equipment: "cable" });
    expect(rank("no_equipment", [unavailable, cable])[0]?.workout.id).toBe("cable");
  });

  it("uses too-hard reason to prefer an easier variation with the same intent", () => {
    const sameLevel = workout("same-level", { difficulty: "intermediate" });
    const easier = workout("easier", { difficulty: "beginner" });
    const ranked = rank("too_hard", [sameLevel, easier]);
    expect(ranked[0]?.workout.id).toBe("easier");
    expect(ranked[0]?.reasons).toContain("easier_variation");
  });

  it("does not emit a pain-safety claim", () => {
    const ranked = rank("pain_or_discomfort", [workout("candidate")]);
    expect(ranked.flatMap((item) => item.reasons)).not.toContain("safe_for_pain");
  });

  it("boosts a saved previous alternative without bypassing eligibility", () => {
    const previous = workout("previous", { name: "Machine Chest Press" });
    const peer = workout("peer", { name: "Cable Chest Press" });
    const saved: UserExerciseAlternative[] = [{
      id: "saved-1",
      user_id: "user",
      plan_exercise_id: "plan-exercise",
      original_exercise_name: "Bench Press",
      alternative_exercise_name: "Machine Chest Press",
      reason: "machine_taken",
      target_muscle: "chest",
      equipment: "machine",
      pain_friendly_note: null,
      created_by: "user",
      created_at: "2026-08-15T00:00:00Z",
      updated_at: "2026-08-15T00:00:00Z",
    }];
    expect(rank("other", [peer, previous], { saved })[0]?.workout.id).toBe("previous");
    expect(rank("other", [peer, previous], { saved, denied: ["previous"] })[0]?.workout.id).toBe("peer");
  });

  it("penalizes unnecessary duplication already present in the session", () => {
    const unused = workout("unused");
    const used = workout("used");
    expect(rank("other", [used, unused], { used: new Set(["used"]) })[0]?.workout.id).toBe("unused");
  });

  it("prefers strong catalog identity when other signals tie", () => {
    const degraded = workout("a-degraded", { catalog_degraded: true });
    const strong = workout("z-strong", { catalog_degraded: false });
    const ranked = rank("other", [degraded, strong]);
    expect(ranked[0]?.workout.id).toBe("z-strong");
    expect(ranked[0]?.reasons).toContain("strong_identity");
  });

  it("keeps deterministic ordering for custom/provider candidates and reports ranking version", () => {
    const custom = workout("custom-2", { is_global: false, catalog_source: "custom", catalog_degraded: true });
    const provider = workout("provider-1", { catalog_source: "external" });
    const ranked = rank("other", [custom, provider]);
    expect(ranked.every((item) => item.rankingVersion === ACTIVE_WORKOUT_REPLACEMENT_RANKING_VERSION)).toBe(true);
    expect(ranked.map((item) => item.workout.id)).toContain("custom-2");
    expect(ranked.map((item) => item.workout.id)).toContain("provider-1");
  });
});
