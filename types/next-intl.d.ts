import type enMessages from "@/messages/en.json";
import type { SupportedLanguage } from "@/lib/i18n/config";

declare module "next-intl" {
  interface AppConfig {
    Locale: SupportedLanguage;
    Messages: typeof enMessages;
  }
}
