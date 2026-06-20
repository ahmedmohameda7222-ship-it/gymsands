"use client";

import { translations, resolveLanguagePreference } from "@/lib/i18n/translations";
import type { TranslationKey } from "@/lib/i18n/types";
import { useUserSettings } from "@/lib/settings/user-settings-context";

export function useTranslation() {
  const { settings } = useUserSettings();
  const language = resolveLanguagePreference(settings.language);
  const dictionary = translations[language];

  return {
    language,
    dir: language === "ar" ? "rtl" : "ltr",
    t: (key: TranslationKey) => dictionary[key] ?? translations.en[key] ?? key
  };
}
