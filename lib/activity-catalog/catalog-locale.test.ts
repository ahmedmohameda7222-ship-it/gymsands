import { describe, expect, it } from "vitest";

import { getLocaleMetadata } from "@/lib/i18n/config";
import type { SupportedLanguage } from "@/lib/i18n/types";
import { toCatalogLocale } from "./catalog-locale";

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
});
