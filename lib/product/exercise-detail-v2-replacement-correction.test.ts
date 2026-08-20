import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(path, "utf8");

const canonicalReasons = source("types/exercise-alternative.ts");
const databaseTypes = source("types/database.ts");
const legacyDatabaseTypes = source("types/database-legacy.ts");
const activeUi = source("components/workouts/active-workout/active-workout-replacement-recommendations.tsx");
const activeClient = source("services/workouts/active-workout/replacement-recommendations-client.ts");
const detailAlternatives = source("app/(private)/workouts/[id]/alternatives/page.tsx");
const migration = source("supabase/migrations/20260820070000_exercise_alternative_reason_v2.sql");

describe("Exercise Detail V2 replacement correction contract", () => {
  it("defines one exact eight-reason V2 product vocabulary", () => {
    for (const reason of [
      "machine_taken",
      "no_equipment",
      "too_hard",
      "want_harder",
      "pain_discomfort",
      "no_spotter",
      "technique_confidence",
      "variation",
    ]) expect(canonicalReasons).toContain(`"${reason}"`);
    expect(canonicalReasons).not.toContain('"other"');
    expect(activeUi).toContain("EXERCISE_ALTERNATIVE_REASONS.map");
  });

  it("keeps historical rows readable while new canonical intents remain exact", () => {
    for (const legacy of [
      "machine_taken",
      "no_equipment",
      "pain_or_discomfort",
      "too_hard",
      "home_alternative",
      "same_muscle",
      "lower_back_friendly",
      "knee_friendly",
      "shoulder_friendly",
      "other",
    ]) expect(legacyDatabaseTypes).toContain(`| "${legacy}"`);
    expect(databaseTypes).toContain("LegacyExerciseAlternativeReason | ExerciseAlternativeReasonV2");
    expect(databaseTypes).toContain('Omit<LegacyUserExerciseAlternative, "reason">');
    expect(migration).toContain("'other'");
    expect(migration).toContain("'variation'");
  });

  it("does not silently translate legacy Other into Want variation", () => {
    expect(activeClient).not.toMatch(/reason\s*===\s*["']other["'][\s\S]{0,120}["']variation["']/);
    expect(activeClient).toContain("if (canonicalReasonSet.has(reason))");
    expect(activeClient).toContain('if (reason === "pain_or_discomfort") return "pain_discomfort"');
    expect(activeClient).toContain("return null;");
  });

  it("keeps V2 relationship authority shared and legacy fallback bounded", () => {
    expect(activeClient).toContain("rankExerciseAlternativesV2(input.reason, alternatives.data)");
    expect(activeClient).toContain('if (semantic) return semantic');
    expect(activeClient).toContain('if (reason === "machine_taken" || reason === "no_equipment" || reason === "too_hard") return reason');
    expect(activeClient).toContain('if (reason === "pain_discomfort") return "pain_or_discomfort"');
    expect(activeClient).toContain("if (!legacyReason) return { recommendations: [], source: \"catalog\" }");
  });

  it("keeps Detail alternatives non-mutating while Active Workout owns Replace", () => {
    expect(detailAlternatives).toContain("{ed(\"view\")}");
    expect(detailAlternatives).not.toContain("{ed(\"replace\")}");
    expect(activeUi).toContain("onReplace(recommendation.workout)");
    expect(activeUi).toContain('tr("replacement.replace")');
  });
});
