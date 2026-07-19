import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { SupportedLanguage } from "@/lib/i18n/types";
import {
  CURATED_EXERCISE_DISPLAY_VOCABULARY,
  formatExerciseDisplayList,
  formatExerciseDisplayValue,
  isTechnicalExerciseDisplayValue,
  resolveExerciseDisplayLanguage,
  type ExerciseDisplayDomain
} from "./exercise-display";

const languages: SupportedLanguage[] = ["en", "de", "ar"];

const vocabularies: Array<{ domain: ExerciseDisplayDomain; values: readonly string[] }> = [
  { domain: "muscle", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.muscles },
  { domain: "equipment", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.equipment },
  { domain: "difficulty", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.difficulty },
  { domain: "mechanics", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.mechanics },
  { domain: "force", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.force },
  { domain: "movement", values: CURATED_EXERCISE_DISPLAY_VOCABULARY.movement }
];

const memberFacingFiles = [
  "app/(private)/workouts/[id]/page.tsx",
  "app/(private)/my-workout/exercises/[exerciseId]/page.tsx",
  "components/workouts/exercise-picker-dialog.tsx",
  "components/workouts/my-workout-plans.tsx",
  "components/workouts/todays-workout.tsx",
  "components/workouts/workout-browser.tsx",
  "components/workouts/workout-plan-builder.tsx",
  "components/workouts/workout-plan-editor.tsx",
  "components/workouts/workout-plan-detail.tsx"
];

describe("member-facing exercise terminology", () => {
  it("covers the complete curated Phase 4B metadata vocabulary in every supported language", () => {
    for (const { domain, values } of vocabularies) {
      for (const value of values) {
        for (const language of languages) {
          const display = formatExerciseDisplayValue(value, language, domain);
          expect(display, `${domain}:${value}:${language}`).toBeTruthy();
          expect(display, `${domain}:${value}:${language}`).not.toMatch(/[_.]/);
          expect(isTechnicalExerciseDisplayValue(display), `${domain}:${value}:${language}`).toBe(false);
        }
      }
    }
  });

  it("uses common training language for the reported bench-press metadata", () => {
    expect(formatExerciseDisplayValue("pectoralis_major", "en", "muscle")).toBe("Chest");
    expect(formatExerciseDisplayValue("anterior_deltoid", "de", "muscle")).toBe("Vordere Schulter");
    expect(formatExerciseDisplayValue("horizontal_push", "ar", "movement")).toBe("دفع أفقي");
    expect(formatExerciseDisplayList(["barbell", "bench"], "en", "equipment")).toBe("Barbell, Bench");
  });

  it("keeps unknown provider values readable without leaking technical separators", () => {
    expect(formatExerciseDisplayValue("future_provider_value", "en", "category")).toBe("Future Provider Value");
    expect(formatExerciseDisplayValue("Bereits lesbar", "de", "category")).toBe("Bereits lesbar");
    expect(formatExerciseDisplayList("cable_machine, rope_attachment", "en", "equipment")).toBe("Cable Machine, Rope Attachment");
  });

  it("resolves application locale variants deterministically", () => {
    expect(resolveExerciseDisplayLanguage("de-DE")).toBe("de");
    expect(resolveExerciseDisplayLanguage("ar-EG")).toBe("ar");
    expect(resolveExerciseDisplayLanguage("en-US")).toBe("en");
    expect(resolveExerciseDisplayLanguage(undefined)).toBe("en");
  });

  it("keeps all 60 curated exercise names and localizations member-facing", () => {
    const registry = JSON.parse(readFileSync("data/muscle-intelligence/v1/registry.json", "utf8")) as {
      status: string;
      exercises: Array<{ name: string; localizations: Record<string, { name: string }> }>;
    };
    expect(registry.exercises).toHaveLength(60);
    expect(registry.status).not.toBe("approved_planning_input_not_implemented");
    for (const exercise of registry.exercises) {
      expect(exercise.name).not.toMatch(/[_.]/);
      for (const locale of ["en", "de", "ar"]) {
        expect(exercise.localizations[locale]?.name).toBeTruthy();
        expect(exercise.localizations[locale]?.name).not.toMatch(/[_.]/);
      }
    }
  });

  it("routes controlled exercise metadata through the shared presentation resolver", () => {
    for (const path of memberFacingFiles) {
      const source = readFileSync(path, "utf8");
      expect(source, path).toContain("formatExerciseDisplay");
      expect(source, path).not.toMatch(/secondary_muscles\.join\(["']\s*,\s*["']\)/);
      expect(source, path).not.toMatch(/>\s*\{(?:exercise|workout)\.(?:target_muscle|mechanics|force_type|difficulty|equipment)\}\s*</);
    }
  });

  it("keeps plan review and plan editing metadata friendly without changing canonical identities", () => {
    const editor = readFileSync("components/workouts/workout-plan-editor.tsx", "utf8");
    const detail = readFileSync("components/workouts/workout-plan-detail.tsx", "utf8");
    expect(editor).toContain('formatExerciseDisplayList(exercise.target_muscle, language, "muscle")');
    expect(editor).toContain('formatExerciseDisplayList(exercise.equipment, language, "equipment")');
    expect(detail).toContain('formatExerciseDisplayList(exercise.target_muscle, language, "muscle")');
    expect(detail).toContain('formatExerciseDisplayList(exercise.equipment, language, "equipment")');
    expect(editor).toContain("source_workout_id: workout.id");
    expect(editor.match(/readOnly=\{Boolean\(exercise\.source_workout_id \|\| exercise\.workout_id\)\}/g)).toHaveLength(2);
  });
});
