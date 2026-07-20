import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { describe, expect, it } from "vitest";

import arMessages from "@/messages/ar.json";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";

type MessageTree = string | { [key: string]: MessageTree };

const requiredKeys = [
  "common.back", "common.close", "common.cancel", "common.continue", "common.save", "common.saving",
  "common.loading", "common.retry", "common.done", "common.optional", "common.more", "common.open",
  "common.edit", "common.skip", "common.reset", "common.pause", "common.resume", "common.finish",
  "common.confirm", "common.remove", "common.add", "common.view", "common.hide",
  "header.workoutDay", "header.exerciseProgress", "header.setProgress", "header.sessionTime",
  "header.sessionProgress", "header.minimizeWorkout", "header.openSessionMenu",
  "exercise.setsCount", "exercise.repsCount", "exercise.restSeconds", "exercise.previousPerformance",
  "exercise.previousSet", "exercise.useValues", "exercise.noPreviousPerformance", "exercise.complete",
  "exercise.setsSaved", "exercise.nextExercise", "exercise.startNextExercise", "exercise.reviewAndFinish",
  "exercise.openDetails",
  "set.label", "set.weight", "set.reps", "set.finish", "set.saved", "set.editing", "set.completedAt",
  "set.saveChanges", "set.cancelEditing", "set.details", "set.type", "set.working", "set.warmup",
  "set.drop", "set.failure", "set.normal", "set.rpe", "set.rir", "set.note", "set.addExtra",
  "set.extra", "set.userAdded",
  "rest.beforeSet", "rest.next", "rest.skip", "rest.addThirtySeconds", "rest.stopTimer",
  "rest.nextSetReady", "rest.start", "rest.finished",
  "navigation.exercises", "navigation.current", "navigation.completed", "navigation.inProgress",
  "navigation.notStarted", "navigation.skipped", "navigation.partial", "navigation.moveToday",
  "navigation.moveNext", "navigation.moveLater", "navigation.moveLast", "navigation.todayOrderOnly",
  "details.instructions", "details.videoAnimation", "details.equipment", "details.commonMistakes",
  "details.alternatives", "details.recentHistory", "details.musclesTargeted", "details.primary",
  "details.secondary", "details.stabilizers", "details.targetMapTitle", "details.targetMapDescription",
  "details.targetMapUnavailable", "details.openFullDetails",
  "actions.exerciseActions", "actions.setDetails", "actions.addSetNote", "actions.addExtraSet",
  "actions.replaceExercise", "actions.skipExerciseToday", "actions.changeTodayOrder",
  "actions.machineOccupied", "actions.equipmentUnavailable", "actions.painDiscomfort",
  "actions.tooHardToday", "actions.homeAlternative", "actions.sameMuscle", "actions.backFriendly",
  "actions.kneeFriendly", "actions.shoulderFriendly", "actions.other", "actions.chooseReason",
  "actions.confirmReplacement", "actions.savedPlanUnchanged", "actions.cancelReplacement",
  "chatGPT.label", "chatGPT.currentContext", "chatGPT.technique", "chatGPT.increaseOrKeepWeight",
  "chatGPT.nextSetAdvice", "chatGPT.replaceQuickly", "chatGPT.makeLighter", "chatGPT.ownQuestion",
  "chatGPT.whyReplacement", "chatGPT.suggestedAlternatives", "chatGPT.useExercise",
  "chatGPT.noChangeUntilConfirm",
  "heatMap.currentSessionHeat", "heatMap.currentSessionDescription", "heatMap.exerciseTargetTitle",
  "heatMap.exerciseTargetDescription", "heatMap.savedSetsOnly", "heatMap.updating",
  "heatMap.noSavedWorkingSets", "heatMap.partialMapping", "heatMap.unavailable",
  "heatMap.couldNotRefresh", "heatMap.retry", "heatMap.front", "heatMap.back", "heatMap.legend",
  "heatMap.openFullMap", "heatMap.closeFullMap", "heatMap.showingLastAvailable",
  "superset.label", "superset.progress", "superset.next", "superset.goTo", "superset.rest",
  "superset.nextRound",
  "minimized.activeWorkout", "minimized.workoutPaused", "minimized.restTime",
  "minimized.nextSetReady", "minimized.openWorkout", "minimized.pause", "minimized.resume",
  "minimized.finishWorkout", "minimized.cancelWorkout", "minimized.hideBar",
  "review.title", "review.duration", "review.completedSets", "review.completedExercises",
  "review.skipped", "review.volume", "review.personalRecords", "review.incompleteExercises",
  "review.workoutNote", "review.optionalNote", "review.saveAndFinish", "review.continueWorkout",
  "completion.title", "completion.savedHistory", "completion.backToWorkouts", "completion.viewDetails",
  "offline.setSaveFailed", "offline.keepOpenRetry", "offline.retry",
  "multiDevice.activeElsewhere", "multiDevice.viewOnly", "multiDevice.takeOver",
  "multiDevice.otherReadOnly", "multiDevice.changedElsewhere", "multiDevice.unsavedPreserved",
  "validation.requiredValues", "validation.validNumber", "validation.nonNegative",
  "validation.wholeReps", "validation.unusualValue",
  "notifications.restFinished", "notifications.nextSetReady",
  "accessibility.openSessionMenu", "accessibility.minimizeWorkout",
  "accessibility.openExerciseDetails", "accessibility.openExerciseList",
  "accessibility.openChatGPTActions", "accessibility.currentSet", "accessibility.completedSet",
  "accessibility.plannedSet", "accessibility.sessionProgress",
  "accessibility.openCurrentSessionHeat", "accessibility.switchFront", "accessibility.switchBack"
] as const;

const allowedIdenticalTokens = new Set(["Plaivra", "ChatGPT", "RPE", "RIR", "AMRAP", "PR", "kg", "lb"]);
const unsafeMessagePattern = /<script|javascript:|onerror\s*=|onclick\s*=/i;
const placeholderOnlyPattern = /^\s*\{[A-Za-z][^}]*\}\s*$/;

function flattenMessages(node: MessageTree, prefix = ""): Record<string, string> {
  if (typeof node === "string") return { [prefix]: node };
  return Object.fromEntries(
    Object.entries(node).flatMap(([key, value]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      return Object.entries(flattenMessages(value, nextPrefix));
    })
  );
}

function getPath(node: MessageTree, path: string): MessageTree | undefined {
  return path.split(".").reduce<MessageTree | undefined>((current, segment) => {
    if (!current || typeof current === "string") return undefined;
    return current[segment];
  }, node);
}

function collectArguments(elements: MessageFormatElement[], values = new Set<string>()): Set<string> {
  for (const element of elements) {
    switch (element.type) {
      case TYPE.argument:
      case TYPE.number:
      case TYPE.date:
      case TYPE.time:
        values.add(element.value);
        break;
      case TYPE.select:
      case TYPE.plural:
        values.add(element.value);
        Object.values(element.options).forEach((option) => collectArguments(option.value, values));
        break;
      case TYPE.tag:
        collectArguments(element.children, values);
        break;
      case TYPE.literal:
      case TYPE.pound:
        break;
    }
  }
  return values;
}

function parsedArguments(message: string): string[] {
  return [...collectArguments(parse(message))].sort();
}

const locales = {
  en: enMessages.ActiveWorkout as MessageTree,
  de: deMessages.ActiveWorkout as MessageTree,
  ar: arMessages.ActiveWorkout as MessageTree
};

describe("ActiveWorkout message contract", () => {
  it("exists in every supported locale and contains the complete semantic inventory", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      expect(messages, `${locale} ActiveWorkout namespace`).toBeTruthy();
      for (const key of requiredKeys) {
        expect(getPath(messages, key), `${locale}: ${key}`).toEqual(expect.any(String));
      }
    }
  });

  it("contains only non-empty, safe ICU strings", () => {
    for (const [locale, messages] of Object.entries(locales)) {
      for (const [key, value] of Object.entries(flattenMessages(messages))) {
        expect(typeof value, `${locale}: ${key}`).toBe("string");
        expect(value.trim().length, `${locale}: ${key}`).toBeGreaterThan(0);
        expect(placeholderOnlyPattern.test(value), `${locale}: ${key}`).toBe(false);
        expect(unsafeMessagePattern.test(value), `${locale}: ${key}`).toBe(false);
        expect(() => parse(value), `${locale}: ${key}`).not.toThrow();
      }
    }
  });

  it("keeps ICU argument names identical across EN, DE, and AR", () => {
    const english = flattenMessages(locales.en);
    const german = flattenMessages(locales.de);
    const arabic = flattenMessages(locales.ar);
    expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
    expect(Object.keys(arabic).sort()).toEqual(Object.keys(english).sort());

    for (const key of Object.keys(english)) {
      const expected = parsedArguments(english[key]);
      expect(parsedArguments(german[key]), `de: ${key}`).toEqual(expected);
      expect(parsedArguments(arabic[key]), `ar: ${key}`).toEqual(expected);
    }
  });

  it("uses translated German and Arabic copy except for approved technical tokens", () => {
    const english = flattenMessages(locales.en);
    for (const [locale, messages] of Object.entries({ de: locales.de, ar: locales.ar })) {
      const translated = flattenMessages(messages);
      for (const key of Object.keys(english)) {
        if (translated[key] !== english[key]) continue;
        expect(allowedIdenticalTokens.has(english[key].trim()), `${locale}: ${key}`).toBe(true);
      }
    }
  });

  it("does not add rejected future-state semantics to the canonical namespace", () => {
    const rejectedKeyPattern = /(undo|reopen|stayHere|difficultyRating|recoveryMap|readinessMap|injuryRisk|silentMerge|autoReplace)/i;
    for (const [locale, messages] of Object.entries(locales)) {
      for (const key of Object.keys(flattenMessages(messages))) {
        expect(rejectedKeyPattern.test(key), `${locale}: ${key}`).toBe(false);
      }
    }
  });
});
