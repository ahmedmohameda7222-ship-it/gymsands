export const supportedLocales = ["en", "de", "ar"] as const;

export type SupportedLanguage = (typeof supportedLocales)[number];
export type LanguagePreference = SupportedLanguage | "system";
export type LocaleDirection = "ltr" | "rtl";

export type LocaleMetadata = {
  code: SupportedLanguage;
  intlLocale: string;
  direction: LocaleDirection;
};

export const defaultLocale: SupportedLanguage = "en";

export const localeRegistry = {
  en: { code: "en", intlLocale: "en-US", direction: "ltr" },
  de: { code: "de", intlLocale: "de-DE", direction: "ltr" },
  ar: { code: "ar", intlLocale: "ar", direction: "rtl" }
} as const satisfies Record<SupportedLanguage, LocaleMetadata>;

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return typeof value === "string" && supportedLocales.includes(value as SupportedLanguage);
}

export function isLanguagePreference(value: unknown): value is LanguagePreference {
  return value === "system" || isSupportedLanguage(value);
}

export function getLocaleMetadata(language: SupportedLanguage): LocaleMetadata {
  return localeRegistry[language];
}
