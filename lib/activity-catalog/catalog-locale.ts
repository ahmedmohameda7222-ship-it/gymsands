import type { SupportedLanguage } from "@/lib/i18n/types";

export const CATALOG_LOCALES = ["en", "de", "ar"] as const;
export type CatalogLocale = (typeof CATALOG_LOCALES)[number];

const catalogLocaleByLanguage = {
  en: "en",
  de: "de",
  ar: "ar"
} as const satisfies Record<SupportedLanguage, CatalogLocale>;

export function toCatalogLocale(language: SupportedLanguage): CatalogLocale {
  return catalogLocaleByLanguage[language];
}
