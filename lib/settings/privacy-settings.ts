"use client";

import { useCallback, useEffect, useState } from "react";

export type PrivacySettings = {
  hideBodyWeightOnDashboard: boolean;
  hideCaloriesOnDashboard: boolean;
  hideProgressPhotos: boolean;
  hideProfileDetails: boolean;
  privateProfileMode: boolean;
};

export const PRIVACY_SETTINGS_STORAGE_KEY = "fitlife_privacy_settings_v1";

export const defaultPrivacySettings: PrivacySettings = {
  hideBodyWeightOnDashboard: false,
  hideCaloriesOnDashboard: false,
  hideProgressPhotos: false,
  hideProfileDetails: false,
  privateProfileMode: false
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizePrivacySettings(value: unknown): PrivacySettings {
  const source = value && typeof value === "object" ? (value as Partial<PrivacySettings>) : {};

  return {
    hideBodyWeightOnDashboard: typeof source.hideBodyWeightOnDashboard === "boolean" ? source.hideBodyWeightOnDashboard : defaultPrivacySettings.hideBodyWeightOnDashboard,
    hideCaloriesOnDashboard: typeof source.hideCaloriesOnDashboard === "boolean" ? source.hideCaloriesOnDashboard : defaultPrivacySettings.hideCaloriesOnDashboard,
    hideProgressPhotos: typeof source.hideProgressPhotos === "boolean" ? source.hideProgressPhotos : defaultPrivacySettings.hideProgressPhotos,
    hideProfileDetails: typeof source.hideProfileDetails === "boolean" ? source.hideProfileDetails : defaultPrivacySettings.hideProfileDetails,
    privateProfileMode: typeof source.privateProfileMode === "boolean" ? source.privateProfileMode : defaultPrivacySettings.privateProfileMode
  };
}

export function getStoredPrivacySettings(): PrivacySettings {
  if (!canUseStorage()) return defaultPrivacySettings;

  try {
    const stored = window.localStorage.getItem(PRIVACY_SETTINGS_STORAGE_KEY);
    return normalizePrivacySettings(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultPrivacySettings;
  }
}

export function saveStoredPrivacySettings(settings: PrivacySettings) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(PRIVACY_SETTINGS_STORAGE_KEY, JSON.stringify(normalizePrivacySettings(settings)));
}

export function usePrivacySettings() {
  const [settings, setSettingsState] = useState<PrivacySettings>(defaultPrivacySettings);

  useEffect(() => {
    setSettingsState(getStoredPrivacySettings());
  }, []);

  const setSettings = useCallback((updater: PrivacySettings | ((current: PrivacySettings) => PrivacySettings)) => {
    const next = typeof updater === "function" ? updater(getStoredPrivacySettings()) : updater;
    saveStoredPrivacySettings(next);
    setSettingsState(next);
  }, []);

  return { settings, setSettings };
}
