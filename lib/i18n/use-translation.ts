"use client";

import { translations, resolveLanguagePreference } from "@/lib/i18n/translations";
import type { TranslationKey } from "@/lib/i18n/types";
import { useUserSettings } from "@/lib/settings/user-settings-context";

export function useTranslation() {
  const { settings } = useUserSettings();
  const language = resolveLanguagePreference(settings.language);
  const dictionary = translations[language];
  const dir: "ltr" | "rtl" = language === "ar" ? "rtl" : "ltr";

  return {
    language,
    dir,
    t: (key: TranslationKey, values?: Record<string, string | number>) => {
      const template = dictionary[key] ?? translations.en[key] ?? key;
      if (!values) return template;
      return Object.entries(values).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), template);
    }
  };
}
