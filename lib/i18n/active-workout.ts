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

export function isolateBidiText(value: string): string {
  return `\u2068${value}\u2069`;
}

export function useActiveWorkoutTranslation() {
  const requestedLocale = useLocale();
  const locale: SupportedLanguage = isSupportedLanguage(requestedLocale) ? requestedLocale : defaultLocale;
  const metadata = getLocaleMetadata(locale);
  const t = useTranslations("ActiveWorkout");
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
export type ActiveWorkoutTranslator = ActiveWorkoutTranslation["t"];
