import { getRequestConfig } from "next-intl/server";

import arMessages from "@/messages/ar.json";
import deMessages from "@/messages/de.json";
import enMessages from "@/messages/en.json";
import { defaultLocale, type SupportedLanguage } from "@/lib/i18n/config";
import { getRequestLanguage } from "@/lib/i18n/server";

const messagesByLocale = {
  en: enMessages,
  de: deMessages,
  ar: arMessages
} as const;

export function getMessagesForLocale(locale: SupportedLanguage) {
  return messagesByLocale[locale] ?? messagesByLocale[defaultLocale];
}

export default getRequestConfig(async () => {
  const { locale } = await getRequestLanguage();
  return {
    locale,
    messages: getMessagesForLocale(locale)
  };
});
