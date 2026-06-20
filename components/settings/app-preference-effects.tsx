"use client";

import { useEffect } from "react";
import { applyAppPreferenceClasses, useAppPreferences } from "@/lib/settings/app-preferences";

export function AppPreferenceEffects() {
  const { preferences } = useAppPreferences();

  useEffect(() => {
    applyAppPreferenceClasses(preferences);

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => applyAppPreferenceClasses(preferences);

    mediaQuery.addEventListener("change", handleSystemThemeChange);
    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange);
  }, [preferences]);

  return null;
}
