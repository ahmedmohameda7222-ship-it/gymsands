"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { synchronizeClientLanguagePreference } from "@/lib/i18n/client-language-preference";
import { getLocaleMetadata } from "@/lib/i18n/config";
import { resolveLocale } from "@/lib/i18n/locale-resolution";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getThemeById, isDarkTheme, legacyThemeCacheKey, themeCacheKey, themeCssVariables } from "@/lib/themes";

function getBrowserLanguageHeader() {
  if (typeof navigator === "undefined") return "";
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.filter(Boolean).join(",");
}

export function AppPreferenceEffects() {
  const { settings, isLoadingSettings } = useUserSettings();
  const router = useRouter();

  useEffect(() => {
    const root = document.documentElement;
    const theme = getThemeById(settings.themeId);
    const language = resolveLocale({
      preference: settings.language,
      acceptLanguage: getBrowserLanguageHeader()
    });
    const { direction } = getLocaleMetadata(language);
    const shouldUseDark = isDarkTheme(theme);
    const variables = themeCssVariables(theme);

    Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));

    root.classList.toggle("dark", shouldUseDark);
    root.classList.toggle("reduce-motion", settings.reduceAnimations);
    root.classList.toggle("large-text", settings.largeTextMode);
    root.classList.toggle("compact-mode", settings.compactMode);
    root.dataset.theme = theme.id;
    root.lang = language;
    root.dir = direction;

    try {
      window.localStorage.setItem(themeCacheKey, theme.id);
      window.localStorage.removeItem(legacyThemeCacheKey);
    } catch {
      // The database setting still applies even when local storage is unavailable.
    }

    if (isLoadingSettings) return;

    synchronizeClientLanguagePreference(settings.language);

    const requestLocale = root.dataset.requestLocale;
    if (!requestLocale || requestLocale === language) {
      delete root.dataset.localeRefreshTarget;
      return;
    }

    if (root.dataset.localeRefreshTarget === language) return;
    root.dataset.localeRefreshTarget = language;
    router.refresh();
  }, [isLoadingSettings, router, settings]);

  return null;
}
