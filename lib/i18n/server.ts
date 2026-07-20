import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { languagePreferenceStorageKey, parseLanguagePreference } from "@/lib/i18n/client-language-preference";
import { resolveLocale } from "@/lib/i18n/locale-resolution";
import type { LanguagePreference, SupportedLanguage } from "@/lib/i18n/config";

export type RequestLanguage = {
  preference: LanguagePreference | null;
  locale: SupportedLanguage;
};

export const getRequestLanguage = cache(async (): Promise<RequestLanguage> => {
  const [cookieStore, requestHeaders] = await Promise.all([cookies(), headers()]);
  const preference = parseLanguagePreference(cookieStore.get(languagePreferenceStorageKey)?.value);
  const acceptLanguage = requestHeaders.get("accept-language");

  return {
    preference,
    locale: resolveLocale({ preference, acceptLanguage })
  };
});
