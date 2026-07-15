import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { translateTrain, type TrainKey } from "./train";

const libraryKeys: TrainKey[] = [
  "workoutFiltersLoadFailed", "workoutsLoadFailed", "moreWorkoutsLoadFailed",
  "exerciseFavorited", "exerciseUnfavorited", "favoriteChangeFailed",
  "customExerciseCreated", "discardCustomDraftTitle", "customExerciseHelp",
  "filterOptionsLoadFailed", "exerciseMatches", "librarySourceNotice",
  "exerciseLibraryQuality", "missingVideo", "duplicateNamesDescription",
  "startBrowsingDescription", "secondaryMusclesNamed", "unfavorite"
];

describe("Train workout library localization", () => {
  it("provides non-empty English, German, and Arabic copy for each library area", () => {
    for (const key of libraryKeys) {
      const english = translateTrain("en", key, { count: 2, name: "Squat", names: "Core" });
      const german = translateTrain("de", key, { count: 2, name: "Squat", names: "Rumpf" });
      const arabic = translateTrain("ar", key, { count: 2, name: "القرفصاء", names: "الجذع" });
      expect(english.trim()).not.toBe("");
      expect(german.trim()).not.toBe("");
      expect(arabic.trim()).not.toBe("");
      expect(arabic).not.toBe(english);
    }
  });

  it("keeps former browser-facing English literals behind Train translation keys", () => {
    const browser = readFileSync(resolve(process.cwd(), "components/workouts/workout-browser.tsx"), "utf8");
    for (const literal of [
      "Could not load workout filters", "Exercise favorited", "Discard custom exercise draft?",
      "Custom exercises are private to you", "Filter options could not load", "Favorites only",
      "Library source notice", "Exercise library quality", "Missing video", "Secondary:"
    ]) {
      expect(browser).not.toContain(literal);
    }
    expect(browser).toContain('tr("exerciseLibraryQuality")');
    expect(browser).toContain('aria-label={favorite ? tr("unfavorite") : tr("favorite")}');
  });
});
