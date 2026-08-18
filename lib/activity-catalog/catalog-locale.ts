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

export function toCatalogLocaleFromIntlLocale(intlLocale: string): CatalogLocale {
  const normalized = intlLocale.trim().toLowerCase().replaceAll("_", "-");
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  if (normalized === "de" || normalized.startsWith("de-")) return "de";
  if (normalized === "ar" || normalized.startsWith("ar-")) return "ar";
  throw new Error(`Unsupported Plaivra Catalog locale source: ${intlLocale}`);
}
