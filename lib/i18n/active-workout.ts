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
  type ActiveWorkoutFormatters
} from "@/lib/i18n/active-workout-formatters";

export function isolateBidiText(value: string): string {
  return `\u2068${value}\u2069`;
}

export function useActiveWorkoutTranslation() {
  const requestedLocale = useLocale();
  const locale: SupportedLanguage = isSupportedLanguage(requestedLocale) ? requestedLocale : defaultLocale;
  const metadata = getLocaleMetadata(locale);
  const t = useTranslations("ActiveWorkout");
  const formatters = useMemo(
    () => createActiveWorkoutFormatters(metadata.intlLocale),
    [metadata.intlLocale]
  );

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
export type { ActiveWorkoutFormatters };
