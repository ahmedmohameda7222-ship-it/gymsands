import { describe, expect, it } from "vitest";

import { getLocaleMetadata } from "@/lib/i18n/config";
import type { SupportedLanguage } from "@/lib/i18n/types";
import { toCatalogLocale, toCatalogLocaleFromIntlLocale } from "./catalog-locale";

describe("Catalog locale mapping", () => {
  it.each([
    ["en", "en", "en-US"],
    ["de", "de", "de-DE"],
    ["ar", "ar", "ar"]
  ] as const)("maps UI language %s to Catalog locale %s while preserving Intl locale %s", (language, expectedCatalog, expectedIntl) => {
    const supportedLanguage: SupportedLanguage = language;
    expect(toCatalogLocale(supportedLanguage)).toBe(expectedCatalog);
    expect(getLocaleMetadata(supportedLanguage).intlLocale).toBe(expectedIntl);
  });

  it.each([
    ["en-US", "en"],
    ["en-GB", "en"],
    ["de-DE", "de"],
    ["ar", "ar"],
    ["ar-EG", "ar"]
  ] as const)("normalizes legacy Intl boundary %s through the same Catalog authority", (intlLocale, expectedCatalog) => {
    expect(toCatalogLocaleFromIntlLocale(intlLocale)).toBe(expectedCatalog);
  });

  it("rejects unsupported locale sources instead of weakening the Catalog API contract", () => {
    expect(() => toCatalogLocaleFromIntlLocale("fr-FR")).toThrow(/Unsupported Plaivra Catalog locale source/);
  });
});
