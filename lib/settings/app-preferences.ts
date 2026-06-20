"use client";

import { useCallback, useEffect, useState } from "react";

export type AppPreferences = {
  theme: "light" | "dark" | "system";
  accentColor: "olive" | "champagne" | "sage";
  language: "en" | "de" | "ar" | "system";
  weightUnit: "kg" | "lb";
  heightUnit: "cm" | "ft-in";
  distanceUnit: "km" | "miles";
  liquidUnit: "ml" | "oz";
  energyUnit: "kcal" | "kJ";
  bodyMeasurementUnit: "cm" | "inches";
  weekStartsOn: "monday" | "sunday";
  defaultStartPage: "today" | "dashboard" | "train" | "eat" | "progress";
  compactMode: boolean;
  reduceAnimations: boolean;
  largeTextMode: boolean;
};

export const APP_PREFERENCES_STORAGE_KEY = "fitlife_app_preferences_v1";

export const defaultAppPreferences: AppPreferences = {
  theme: "system",
  accentColor: "olive",
  language: "en",
  weightUnit: "kg",
  heightUnit: "cm",
  distanceUnit: "km",
  liquidUnit: "ml",
  energyUnit: "kcal",
  bodyMeasurementUnit: "cm",
  weekStartsOn: "monday",
  defaultStartPage: "today",
  compactMode: false,
  reduceAnimations: false,
  largeTextMode: false
};

const preferenceChangeEventName = "fitlife:app-preferences-changed";

function hasBrowserStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function valueFromList<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function valueFromBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeAppPreferences(value: unknown): AppPreferences {
  const source = value && typeof value === "object" ? (value as Partial<AppPreferences>) : {};

  return {
    theme: valueFromList(source.theme, ["light", "dark", "system"], defaultAppPreferences.theme),
    accentColor: valueFromList(source.accentColor, ["olive", "champagne", "sage"], defaultAppPreferences.accentColor),
    language: valueFromList(source.language, ["en", "de", "ar", "system"], defaultAppPreferences.language),
    weightUnit: valueFromList(source.weightUnit, ["kg", "lb"], defaultAppPreferences.weightUnit),
    heightUnit: valueFromList(source.heightUnit, ["cm", "ft-in"], defaultAppPreferences.heightUnit),
    distanceUnit: valueFromList(source.distanceUnit, ["km", "miles"], defaultAppPreferences.distanceUnit),
    liquidUnit: valueFromList(source.liquidUnit, ["ml", "oz"], defaultAppPreferences.liquidUnit),
    energyUnit: valueFromList(source.energyUnit, ["kcal", "kJ"], defaultAppPreferences.energyUnit),
    bodyMeasurementUnit: valueFromList(source.bodyMeasurementUnit, ["cm", "inches"], defaultAppPreferences.bodyMeasurementUnit),
    weekStartsOn: valueFromList(source.weekStartsOn, ["monday", "sunday"], defaultAppPreferences.weekStartsOn),
    defaultStartPage: valueFromList(source.defaultStartPage, ["today", "dashboard", "train", "eat", "progress"], defaultAppPreferences.defaultStartPage),
    compactMode: valueFromBoolean(source.compactMode, defaultAppPreferences.compactMode),
    reduceAnimations: valueFromBoolean(source.reduceAnimations, defaultAppPreferences.reduceAnimations),
    largeTextMode: valueFromBoolean(source.largeTextMode, defaultAppPreferences.largeTextMode)
  };
}

export function getStoredAppPreferences(): AppPreferences {
  if (!hasBrowserStorage()) return defaultAppPreferences;

  try {
    const stored = window.localStorage.getItem(APP_PREFERENCES_STORAGE_KEY);
    return normalizeAppPreferences(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultAppPreferences;
  }
}

export function saveStoredAppPreferences(preferences: AppPreferences) {
  if (!hasBrowserStorage()) return;

  const normalized = normalizeAppPreferences(preferences);
  window.localStorage.setItem(APP_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent<AppPreferences>(preferenceChangeEventName, { detail: normalized }));
}

export function applyAppPreferenceClasses(preferences = getStoredAppPreferences()) {
  if (typeof document === "undefined" || typeof window === "undefined") return;

  const root = document.documentElement;
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const shouldUseDark = preferences.theme === "dark" || (preferences.theme === "system" && prefersDark);

  root.classList.toggle("dark", shouldUseDark);
  root.classList.toggle("reduce-motion", preferences.reduceAnimations);
  root.classList.toggle("large-text", preferences.largeTextMode);
  root.dataset.accent = preferences.accentColor;
}

export function useAppPreferences() {
  const [preferences, setPreferencesState] = useState<AppPreferences>(defaultAppPreferences);

  useEffect(() => {
    setPreferencesState(getStoredAppPreferences());

    function handleStorage(event: StorageEvent) {
      if (event.key === APP_PREFERENCES_STORAGE_KEY) {
        setPreferencesState(getStoredAppPreferences());
      }
    }

    function handleLocalChange(event: Event) {
      const customEvent = event as CustomEvent<AppPreferences>;
      setPreferencesState(normalizeAppPreferences(customEvent.detail));
    }

    window.addEventListener("storage", handleStorage);
    window.addEventListener(preferenceChangeEventName, handleLocalChange);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(preferenceChangeEventName, handleLocalChange);
    };
  }, []);

  const setPreferences = useCallback((updater: AppPreferences | ((current: AppPreferences) => AppPreferences)) => {
    const next = typeof updater === "function" ? updater(getStoredAppPreferences()) : updater;
    saveStoredAppPreferences(next);
    setPreferencesState(next);
  }, []);

  return { preferences, setPreferences };
}
