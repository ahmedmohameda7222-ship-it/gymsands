"use client";

import { useCallback, useEffect, useState } from "react";

export type ReminderSettings = {
  workoutReminders: boolean;
  workoutTime: string;
  mealReminders: boolean;
  remindBeforeMeals: boolean;
  hydrationReminders: boolean;
  hydrationInterval: string;
  bedtimeReminder: boolean;
  bedtime: string;
  supplementReminders: boolean;
  weighInReminder: boolean;
  weighInDay: string;
  photoReminder: boolean;
  photoFrequency: string;
  habitReminders: boolean;
  quietHours: boolean;
  quietStart: string;
  quietEnd: string;
};

export const REMINDER_SETTINGS_STORAGE_KEY = "fitlife_reminder_settings_v1";

export const defaultReminderSettings: ReminderSettings = {
  workoutReminders: false,
  workoutTime: "",
  mealReminders: false,
  remindBeforeMeals: false,
  hydrationReminders: false,
  hydrationInterval: "",
  bedtimeReminder: false,
  bedtime: "",
  supplementReminders: false,
  weighInReminder: false,
  weighInDay: "",
  photoReminder: false,
  photoFrequency: "",
  habitReminders: false,
  quietHours: false,
  quietStart: "",
  quietEnd: ""
};

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeReminderSettings(value: unknown): ReminderSettings {
  const source = value && typeof value === "object" ? (value as Partial<ReminderSettings>) : {};

  return {
    workoutReminders: typeof source.workoutReminders === "boolean" ? source.workoutReminders : defaultReminderSettings.workoutReminders,
    workoutTime: typeof source.workoutTime === "string" ? source.workoutTime : defaultReminderSettings.workoutTime,
    mealReminders: typeof source.mealReminders === "boolean" ? source.mealReminders : defaultReminderSettings.mealReminders,
    remindBeforeMeals: typeof source.remindBeforeMeals === "boolean" ? source.remindBeforeMeals : defaultReminderSettings.remindBeforeMeals,
    hydrationReminders: typeof source.hydrationReminders === "boolean" ? source.hydrationReminders : defaultReminderSettings.hydrationReminders,
    hydrationInterval: typeof source.hydrationInterval === "string" ? source.hydrationInterval : defaultReminderSettings.hydrationInterval,
    bedtimeReminder: typeof source.bedtimeReminder === "boolean" ? source.bedtimeReminder : defaultReminderSettings.bedtimeReminder,
    bedtime: typeof source.bedtime === "string" ? source.bedtime : defaultReminderSettings.bedtime,
    supplementReminders: typeof source.supplementReminders === "boolean" ? source.supplementReminders : defaultReminderSettings.supplementReminders,
    weighInReminder: typeof source.weighInReminder === "boolean" ? source.weighInReminder : defaultReminderSettings.weighInReminder,
    weighInDay: typeof source.weighInDay === "string" ? source.weighInDay : defaultReminderSettings.weighInDay,
    photoReminder: typeof source.photoReminder === "boolean" ? source.photoReminder : defaultReminderSettings.photoReminder,
    photoFrequency: typeof source.photoFrequency === "string" ? source.photoFrequency : defaultReminderSettings.photoFrequency,
    habitReminders: typeof source.habitReminders === "boolean" ? source.habitReminders : defaultReminderSettings.habitReminders,
    quietHours: typeof source.quietHours === "boolean" ? source.quietHours : defaultReminderSettings.quietHours,
    quietStart: typeof source.quietStart === "string" ? source.quietStart : defaultReminderSettings.quietStart,
    quietEnd: typeof source.quietEnd === "string" ? source.quietEnd : defaultReminderSettings.quietEnd
  };
}

export function getStoredReminderSettings(): ReminderSettings {
  if (!canUseStorage()) return defaultReminderSettings;

  try {
    const stored = window.localStorage.getItem(REMINDER_SETTINGS_STORAGE_KEY);
    return normalizeReminderSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return defaultReminderSettings;
  }
}

export function saveStoredReminderSettings(settings: ReminderSettings) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(REMINDER_SETTINGS_STORAGE_KEY, JSON.stringify(normalizeReminderSettings(settings)));
}

export function useReminderSettings() {
  const [settings, setSettingsState] = useState<ReminderSettings>(defaultReminderSettings);

  useEffect(() => {
    setSettingsState(getStoredReminderSettings());
  }, []);

  const setSettings = useCallback((updater: ReminderSettings | ((current: ReminderSettings) => ReminderSettings)) => {
    const next = typeof updater === "function" ? updater(getStoredReminderSettings()) : updater;
    saveStoredReminderSettings(next);
    setSettingsState(next);
  }, []);

  return { settings, setSettings };
}
