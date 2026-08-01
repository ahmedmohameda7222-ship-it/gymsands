"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  defaultLocale,
  getLocaleMetadata,
  isSupportedLanguage,
  type LocaleDirection,
  type SupportedLanguage
} from "@/lib/i18n/config";
import {
  createActiveWorkoutFormatters,
  type ActiveWorkoutBaseFormatters
} from "@/lib/i18n/active-workout-formatters";

export type ActiveWorkoutMeasurementUnit = "kg" | "reps" | "seconds" | "minutes";

export type ActiveWorkoutFormatters = Omit<ActiveWorkoutBaseFormatters, "measurement"> & {
  measurement: (value: number, unit: ActiveWorkoutMeasurementUnit, maximumFractionDigits?: number) => string;
};

const activeWorkoutSessionLabels: Record<SupportedLanguage, string> = {
  en: "Workout session",
  de: "Trainingseinheit",
  ar: "جلسة التمرين"
};

const higherThanLastSavedSet: Record<SupportedLanguage, (values: Record<string, string | number | Date>) => string> = {
  en: (values) => `${values.name}: higher than your last saved set — ${values.weight} × ${values.reps} reps`,
  de: (values) => `${values.name}: höher als dein zuletzt gespeicherter Satz — ${values.weight} × ${values.reps} Wdh.`,
  ar: (values) => `${values.name}: أعلى من آخر مجموعة محفوظة — ${values.weight} × ${values.reps} تكرار`
};

export function activeWorkoutSessionLabel(locale: SupportedLanguage) {
  return activeWorkoutSessionLabels[locale];
}

export type ActiveWorkoutTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

export function isolateBidiText(value: string): string {
  return `\u2068${value}\u2069`;
}

export function useActiveWorkoutTranslation() {
  const requestedLocale = useLocale();
  const locale: SupportedLanguage = isSupportedLanguage(requestedLocale) ? requestedLocale : defaultLocale;
  const metadata = getLocaleMetadata(locale);
  const message = useTranslations("ActiveWorkout");
  const t = useMemo<ActiveWorkoutTranslator>(() => (
    key,
    values
  ) => {
    if (key === "header.workoutSession") return activeWorkoutSessionLabel(locale);
    // This comparison is against the immediately previous saved set, not the
    // provenance-backed record authority. Keep it factual and never call it a
    // PR/new record before server verification completes.
    if (key === "set.newBest" && values) return higherThanLastSavedSet[locale](values);
    return message(key as never, values as never);
  }, [locale, message]);
  const baseFormatters = useMemo(
    () => createActiveWorkoutFormatters(metadata.intlLocale),
    [metadata.intlLocale]
  );
  const formatters = useMemo<ActiveWorkoutFormatters>(() => {
    const localizedUnitLabel = (unit: ActiveWorkoutMeasurementUnit): string => {
      switch (unit) {
        case "kg":
          return t("units.kg");
        case "reps":
          return t("units.reps");
        case "seconds":
          return t("units.seconds");
        case "minutes":
          return t("units.minutes");
      }
    };

    return {
      ...baseFormatters,
      measurement: (value, unit, maximumFractionDigits) =>
        baseFormatters.measurement(value, localizedUnitLabel(unit), maximumFractionDigits)
    };
  }, [baseFormatters, t]);

  return {
    t,
    locale,
    direction: metadata.direction satisfies LocaleDirection,
    intlLocale: metadata.intlLocale,
    formatters
  };
}

export type ActiveWorkoutTranslation = ReturnType<typeof useActiveWorkoutTranslation>;
