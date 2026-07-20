import arMessages from "@/messages/ar.json";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";
import type { SupportedLanguage } from "@/lib/i18n/types";

export type ActiveSessionMuscleLoadCopy = {
  title: string;
  description: string;
  savedOnly: string;
  updating: string;
  noSavedSets: string;
  partial: string;
  unavailable: string;
  loadFailed: string;
  retry: string;
};

const messages = {
  en: enMessages.ActiveWorkout.heatMap,
  de: deMessages.ActiveWorkout.heatMap,
  ar: arMessages.ActiveWorkout.heatMap
} as const;

export function getActiveSessionMuscleLoadCopy(language: SupportedLanguage): ActiveSessionMuscleLoadCopy {
  const copy = messages[language] ?? messages.en;
  return {
    title: copy.currentSessionHeat,
    description: copy.currentSessionDescription,
    savedOnly: copy.savedSetsOnly,
    updating: copy.updating,
    noSavedSets: copy.noSavedWorkingSets,
    partial: copy.partialDescription,
    unavailable: copy.unavailableDescription,
    loadFailed: copy.refreshFailedDescription,
    retry: copy.retry
  };
}
