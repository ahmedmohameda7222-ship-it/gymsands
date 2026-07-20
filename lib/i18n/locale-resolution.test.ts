import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultLocale,
  getLocaleMetadata,
  isLanguagePreference,
  isSupportedLanguage,
  localeRegistry,
  supportedLocales
} from "@/lib/i18n/config";
import {
  buildLanguagePreferenceCookie,
  languagePreferenceMaxAgeSeconds,
  languagePreferenceStorageKey,
  parseLanguagePreference,
  readLanguagePreferenceCookie,
  serializeLanguagePreference
} from "@/lib/i18n/client-language-preference";
import {
  normalizeLanguageTag,
  resolveAcceptLanguage,
  resolveLocale
} from "@/lib/i18n/locale-resolution";
import { resolveLanguagePreference } from "@/lib/i18n/translations";
import { getTrainLocaleMetadata } from "@/lib/i18n/train";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("locale registry", () => {
  it("defines exactly the approved locales and default", () => {
    expect(supportedLocales).toEqual(["en", "de", "ar"]);
    expect(defaultLocale).toBe("en");
    expect(Object.keys(localeRegistry)).toEqual(["en", "de", "ar"]);
  });

  it("provides canonical locale metadata", () => {
    expect(getLocaleMetadata("en")).toEqual({ code: "en", intlLocale: "en-US", direction: "ltr" });
    expect(getLocaleMetadata("de")).toEqual({ code: "de", intlLocale: "de-DE", direction: "ltr" });
    expect(getLocaleMetadata("ar")).toEqual({ code: "ar", intlLocale: "ar", direction: "rtl" });
  });

  it("rejects unknown locale and preference values", () => {
    expect(isSupportedLanguage("fr")).toBe(false);
    expect(isSupportedLanguage("")).toBe(false);
    expect(isLanguagePreference("system")).toBe(true);
    expect(isLanguagePreference("de")).toBe(true);
    expect(isLanguagePreference("fr")).toBe(false);
  });
});

describe("locale normalization", () => {
  it.each([
    ["en-US", "en"],
    ["en-GB", "en"],
    ["de-DE", "de"],
    ["de-AT", "de"],
    ["de-CH", "de"],
    ["ar-EG", "ar"],
    ["ar-SA", "ar"]
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeLanguageTag(input)).toBe(expected);
  });

  it.each(["fr-FR", "", "not a tag", "de;", null, undefined])("rejects unsupported or malformed %s", (input) => {
    expect(normalizeLanguageTag(input)).toBeNull();
  });
});

describe("weighted Accept-Language parsing", () => {
  it.each([
    ["fr-FR, de-DE;q=0.9, en;q=0.8", "de"],
    ["ar-EG, en;q=0.5", "ar"],
    ["de;q=0.4, en;q=0.9", "en"],
    ["fr-FR, es-ES;q=0.8", "en"],
    ["*, de;q=0.7", "de"],
    ["de;q=broken, ar;q=0.5", "ar"]
  ])("resolves %s to %s", (header, expected) => {
    expect(resolveAcceptLanguage(header)).toBe(expected);
  });

  it("never throws for malformed quality values", () => {
    expect(() => resolveAcceptLanguage("de;q=1.5, en;q=oops, ar;q=0.4")).not.toThrow();
    expect(resolveAcceptLanguage("de;q=1.5, en;q=oops, ar;q=0.4")).toBe("ar");
  });
});

describe("preference precedence", () => {
  it.each([
    ["ar", "de", "ar"],
    ["de", "ar", "de"],
    ["system", "de-DE", "de"],
    [undefined, "ar-EG", "ar"],
    ["invalid", "de-DE", "de"],
    [undefined, undefined, "en"]
  ])("resolves preference %s and header %s to %s", (preference, acceptLanguage, expected) => {
    expect(resolveLocale({ preference, acceptLanguage })).toBe(expected);
  });
});

describe("device preference helpers", () => {
  it("accepts German, preserves system, and rejects invalid values", () => {
    expect(parseLanguagePreference("de")).toBe("de");
    expect(serializeLanguagePreference("system")).toBe("system");
    expect(parseLanguagePreference("fr")).toBeNull();
  });

  it("creates the approved non-sensitive cookie contract", () => {
    const cookie = buildLanguagePreferenceCookie("de", { secure: true });
    expect(cookie).toContain(languagePreferenceStorageKey + "=de");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Max-Age=" + languagePreferenceMaxAgeSeconds);
    expect(cookie).toContain("Secure");
    expect(cookie).not.toMatch(/user|email|token|session|secret/i);
    expect(readLanguagePreferenceCookie(cookie)).toBe("de");
  });
});

describe("legacy compatibility", () => {
  it.each(["en", "de", "ar"] as const)("keeps explicit %s resolution", (language) => {
    expect(resolveLanguagePreference(language)).toBe(language);
  });

  it("resolves system through supported browser languages", () => {
    vi.stubGlobal("navigator", { language: "de-DE", languages: ["de-DE", "en-US"] });
    expect(resolveLanguagePreference("system")).toBe("de");
  });

  it("falls back to English for an unsupported system language", () => {
    vi.stubGlobal("navigator", { language: "fr-FR", languages: ["fr-FR"] });
    expect(resolveLanguagePreference("system")).toBe("en");
  });

  it("keeps Train metadata aligned with the central registry", () => {
    expect(getTrainLocaleMetadata("en")).toEqual({ dir: "ltr", locale: "en-US" });
    expect(getTrainLocaleMetadata("de")).toEqual({ dir: "ltr", locale: "de-DE" });
    expect(getTrainLocaleMetadata("ar")).toEqual({ dir: "rtl", locale: "ar" });
  });
});
