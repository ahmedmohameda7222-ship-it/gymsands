"use client";

import { useEffect } from "react";
import { resolveLanguagePreference } from "@/lib/i18n/translations";
import { useUserSettings } from "@/lib/settings/user-settings-context";
import { getThemeById, hexToHslParts, isDarkTheme } from "@/lib/themes";

export function AppPreferenceEffects() {
  const { settings } = useUserSettings();

  useEffect(() => {
    const root = document.documentElement;
    const theme = getThemeById(settings.themeId);
    const language = resolveLanguagePreference(settings.language);
    const shouldUseDark = isDarkTheme(theme);

    root.style.setProperty("--app-bg", theme.appBackground);
    root.style.setProperty("--surface", theme.surface);
    root.style.setProperty("--surface-elevated", theme.surfaceElevated);
    root.style.setProperty("--primary-soft", theme.primarySoft);
    root.style.setProperty("--text-primary", theme.textPrimary);
    root.style.setProperty("--text-secondary", theme.textSecondary);
    root.style.setProperty("--button-text", theme.buttonText);
    root.style.setProperty("--success", theme.success);
    root.style.setProperty("--danger", theme.danger);
    root.style.setProperty("--warning", theme.warning);

    root.style.setProperty("--background", hexToHslParts(theme.appBackground));
    root.style.setProperty("--foreground", hexToHslParts(theme.textPrimary));
    root.style.setProperty("--card", hexToHslParts(theme.surface));
    root.style.setProperty("--card-foreground", hexToHslParts(theme.textPrimary));
    root.style.setProperty("--popover", hexToHslParts(theme.surfaceElevated));
    root.style.setProperty("--popover-foreground", hexToHslParts(theme.textPrimary));
    root.style.setProperty("--primary", hexToHslParts(theme.primary));
    root.style.setProperty("--primary-foreground", hexToHslParts(theme.buttonText));
    root.style.setProperty("--secondary", hexToHslParts(theme.warning));
    root.style.setProperty("--secondary-foreground", hexToHslParts(theme.buttonText));
    root.style.setProperty("--muted", hexToHslParts(theme.primarySoft));
    root.style.setProperty("--muted-foreground", hexToHslParts(theme.textSecondary));
    root.style.setProperty("--accent", hexToHslParts(theme.primarySoft));
    root.style.setProperty("--accent-foreground", hexToHslParts(theme.textPrimary));
    root.style.setProperty("--destructive", hexToHslParts(theme.danger));
    root.style.setProperty("--destructive-foreground", hexToHslParts(theme.buttonText));
    root.style.setProperty("--border", hexToHslParts(theme.border));
    root.style.setProperty("--input", hexToHslParts(theme.border));
    root.style.setProperty("--ring", hexToHslParts(theme.primary));

    root.style.setProperty("--color-background", theme.appBackground);
    root.style.setProperty("--color-surface", theme.surface);
    root.style.setProperty("--color-elevated", theme.surfaceElevated);
    root.style.setProperty("--color-card", theme.surface);
    root.style.setProperty("--color-primary", theme.primary);
    root.style.setProperty("--color-primary-hover", theme.primary);
    root.style.setProperty("--color-secondary", theme.warning);
    root.style.setProperty("--color-secondary-hover", theme.warning);
    root.style.setProperty("--color-text-primary", theme.textPrimary);
    root.style.setProperty("--color-text-secondary", theme.textSecondary);
    root.style.setProperty("--color-text-tertiary", theme.textSecondary);
    root.style.setProperty("--color-border", theme.border);
    root.style.setProperty("--color-border-subtle", theme.border);
    root.style.setProperty("--color-success", theme.success);
    root.style.setProperty("--color-warning", theme.warning);
    root.style.setProperty("--color-destructive", theme.danger);

    root.classList.toggle("dark", shouldUseDark);
    root.classList.toggle("reduce-motion", settings.reduceAnimations);
    root.classList.toggle("large-text", settings.largeTextMode);
    root.classList.toggle("compact-mode", settings.compactMode);
    root.dataset.theme = theme.id;
    root.lang = language;
    root.dir = language === "ar" ? "rtl" : "ltr";
  }, [settings]);

  return null;
}
