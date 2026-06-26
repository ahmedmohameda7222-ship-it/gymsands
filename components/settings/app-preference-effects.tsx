"use client";

import { useEffect } from "react";
import { resolveLanguagePreference } from "@/lib/i18n/translations";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getThemeById, isDarkTheme, legacyThemeCacheKey, themeCacheKey, themeCssVariables } from "@/lib/themes";

export function AppPreferenceEffects() {
  const { settings } = useUserSettings();

  useEffect(() => {
    const root = document.documentElement;
    const theme = getThemeById(settings.themeId);
    const language = resolveLanguagePreference(settings.language);
    const shouldUseDark = isDarkTheme(theme);
    const variables = themeCssVariables(theme);

    Object.entries(variables).forEach(([key, value]) => root.style.setProperty(key, value));

    root.classList.toggle("dark", shouldUseDark);
    root.classList.toggle("reduce-motion", settings.reduceAnimations);
    root.classList.toggle("large-text", settings.largeTextMode);
    root.classList.toggle("compact-mode", settings.compactMode);
    root.dataset.theme = theme.id;
    root.lang = language;
    root.dir = language === "ar" ? "rtl" : "ltr";
    try {
      window.localStorage.setItem(themeCacheKey, theme.id);
      window.localStorage.removeItem(legacyThemeCacheKey);
    } catch {
      // The database setting still applies even when local storage is unavailable.
    }
  }, [settings]);

  return null;
}
