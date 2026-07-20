import {
  defaultLocale,
  isSupportedLanguage,
  type LanguagePreference,
  type SupportedLanguage
} from "@/lib/i18n/config";

const languageTagPattern = /^[a-z]{2,8}(?:[-_][a-z0-9]{1,8})*$/i;
const qualityPattern = /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/;

type ResolveLocaleInput = {
  preference?: unknown;
  acceptLanguage?: string | null;
};

type WeightedLocale = {
  locale: SupportedLanguage;
  quality: number;
  index: number;
};

export function normalizeLanguageTag(value: unknown): SupportedLanguage | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || !languageTagPattern.test(normalized)) return null;
  const baseLanguage = normalized.split(/[-_]/, 1)[0];
  return isSupportedLanguage(baseLanguage) ? baseLanguage : null;
}

export function resolveAcceptLanguage(acceptLanguage?: string | null): SupportedLanguage {
  if (typeof acceptLanguage !== "string" || !acceptLanguage.trim()) return defaultLocale;

  const candidates: WeightedLocale[] = [];
  acceptLanguage.split(",").forEach((entry, index) => {
    const segments = entry.split(";").map((segment) => segment.trim()).filter(Boolean);
    const tag = segments.shift();
    if (!tag || tag === "*") return;

    let quality = 1;
    for (const parameter of segments) {
      const match = /^q\s*=\s*(.+)$/i.exec(parameter);
      if (!match) continue;
      if (!qualityPattern.test(match[1])) return;
      quality = Number(match[1]);
      break;
    }

    if (quality <= 0) return;
    const locale = normalizeLanguageTag(tag);
    if (!locale) return;
    candidates.push({ locale, quality, index });
  });

  candidates.sort((left, right) => right.quality - left.quality || left.index - right.index);
  return candidates[0]?.locale ?? defaultLocale;
}

export function resolveLocale({ preference, acceptLanguage }: ResolveLocaleInput = {}): SupportedLanguage {
  if (isSupportedLanguage(preference)) return preference;
  return resolveAcceptLanguage(acceptLanguage);
}

export function resolveBrowserLanguagePreference(
  preference: LanguagePreference | string,
  browserLanguages: readonly string[] = []
): SupportedLanguage {
  return resolveLocale({
    preference,
    acceptLanguage: browserLanguages.filter(Boolean).join(",")
  });
}
