import { describe, expect, it } from "vitest";
import { getTrainLocaleMetadata, translateTrain, type TrainKey } from "@/lib/i18n/train";

const languages = ["en", "de", "ar"] as const;

describe("Train localization", () => {
  it("provides English, German, and Arabic copy from one key contract", () => {
    expect(translateTrain("en", "myWorkout")).toBe("My Workout");
    expect(translateTrain("de", "myWorkout")).toBe("Mein Training");
    expect(translateTrain("ar", "myWorkout")).toMatch(/\p{Script=Arabic}/u);

    for (const language of languages) {
      expect(translateTrain(language, "askChatGpt")).toContain("ChatGPT");
      expect(translateTrain(language, "createPlan").trim().length).toBeGreaterThan(0);
    }
  });

  it("uses RTL only for Arabic and exposes locale-aware formatter identifiers", () => {
    expect(getTrainLocaleMetadata("en")).toEqual({ dir: "ltr", locale: "en-US" });
    expect(getTrainLocaleMetadata("de")).toEqual({ dir: "ltr", locale: "de-DE" });
    expect(getTrainLocaleMetadata("ar")).toEqual({ dir: "rtl", locale: "ar" });
  });

  it("localizes every displayed weekday instead of exposing database English", () => {
    const weekdayKeys: TrainKey[] = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday"
    ];
    const english = weekdayKeys.map((key) => translateTrain("en", key));
    const german = weekdayKeys.map((key) => translateTrain("de", key));
    const arabic = weekdayKeys.map((key) => translateTrain("ar", key));

    expect(new Set(english).size).toBe(7);
    expect(new Set(german).size).toBe(7);
    expect(new Set(arabic).size).toBe(7);
    expect(german).not.toEqual(english);
    expect(arabic).not.toEqual(english);
    expect(arabic.every((label) => /\p{Script=Arabic}/u.test(label))).toBe(true);
  });

  it("localizes workout statuses, builder steps, and destructive confirmation copy", () => {
    const keys: TrainKey[] = [
      "inProgress",
      "completed",
      "scheduled",
      "rest",
      "planDetailsStep",
      "trainingDaysStep",
      "reviewStep",
      "savePlan",
      "deleteTitle",
      "deleteDescription"
    ];

    for (const key of keys) {
      const values = languages.map((language) => translateTrain(language, key));
      expect(values.every((value) => value.trim().length > 0), key).toBe(true);
      expect(new Set(values).size, key).toBe(3);
    }
  });

  it("interpolates localized Train values without leaking placeholder tokens", () => {
    for (const language of languages) {
      expect(translateTrain(language, "nextWorkout", { workout: "Push", weekday: "Monday" }))
        .not.toMatch(/\{(?:workout|weekday)\}/);
      expect(translateTrain(language, "exercises", { count: 4 })).toContain("4");
      expect(translateTrain(language, "programWeeks", { count: 8 })).toContain("8");
    }
  });
});
