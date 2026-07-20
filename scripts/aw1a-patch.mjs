import { readFile, writeFile } from "node:fs/promises";

async function replaceOnce(path, expected, replacement) {
  const current = await readFile(path, "utf8");
  if (current.includes(replacement)) return;
  if (!current.includes(expected)) {
    throw new Error(`Expected AW-1A patch target was not found in ${path}`);
  }
  await writeFile(path, current.replace(expected, replacement), "utf8");
}

await replaceOnce(
  "lib/i18n/types.ts",
  'export type SupportedLanguage = "en" | "de" | "ar";\nexport type LanguagePreference = SupportedLanguage | "system";',
  'export type { LanguagePreference, SupportedLanguage } from "@/lib/i18n/config";'
);

await replaceOnce(
  "lib/i18n/translations.ts",
  'import type { SupportedLanguage, TranslationKey } from "@/lib/i18n/types";',
  'import { resolveLocale } from "@/lib/i18n/locale-resolution";\nimport type { SupportedLanguage, TranslationKey } from "@/lib/i18n/types";'
);

await replaceOnce(
  "lib/i18n/translations.ts",
  `export function resolveLanguagePreference(language: string): SupportedLanguage {
  if (language === "de" || language === "ar" || language === "en") return language;
  if (typeof navigator !== "undefined") {
    const browserLanguage = navigator.language.toLowerCase();
    if (browserLanguage.startsWith("de")) return "de";
    if (browserLanguage.startsWith("ar")) return "ar";
  }
  return "en";
}`,
  `export function resolveLanguagePreference(language: string): SupportedLanguage {
  const browserLanguages = typeof navigator !== "undefined"
    ? navigator.languages?.length
      ? navigator.languages
      : [navigator.language]
    : [];
  return resolveLocale({
    preference: language,
    acceptLanguage: browserLanguages.filter(Boolean).join(",")
  });
}`
);

await replaceOnce(
  "lib/i18n/train.ts",
  'import { useTranslation } from "@/lib/i18n/use-translation";\nimport type { SupportedLanguage } from "@/lib/i18n/types";',
  'import { getLocaleMetadata } from "@/lib/i18n/config";\nimport { useTranslation } from "@/lib/i18n/use-translation";\nimport type { SupportedLanguage } from "@/lib/i18n/types";'
);

await replaceOnce(
  "lib/i18n/train.ts",
  `export function getTrainLocaleMetadata(language: SupportedLanguage) {
  return {
    dir: (language === "ar" ? "rtl" : "ltr") as "ltr" | "rtl",
    locale: language === "de" ? "de-DE" : language === "ar" ? "ar" : "en-US"
  };
}`,
  `export function getTrainLocaleMetadata(language: SupportedLanguage) {
  const metadata = getLocaleMetadata(language);
  return {
    dir: metadata.direction,
    locale: metadata.intlLocale
  };
}`
);

console.log("AW-1A compatibility patches applied.");
