"use client";

import { useEffect } from "react";
import { resolveLanguagePreference } from "@/lib/i18n/translations";
import { useUserSettings } from "@/lib/settings/user-settings-context";

export function AppPreferenceEffects() {
  const { settings } = useUserSettings();

  useEffect(() => {
    function apply() {
      const root = document.documentElement;
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const shouldUseDark = settings.theme === "dark" || (settings.theme === "system" && prefersDark);
      const language = resolveLanguagePreference(settings.language);

      root.classList.toggle("dark", shouldUseDark);
      root.classList.toggle("reduce-motion", settings.reduceAnimations);
      root.classList.toggle("large-text", settings.largeTextMode);
      root.classList.toggle("compact-mode", settings.compactMode);
      root.dataset.accent = settings.accentColor;
      root.lang = language;
      root.dir = language === "ar" ? "rtl" : "ltr";
    }

    apply();

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => apply();
    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [settings]);

  return null;
}
