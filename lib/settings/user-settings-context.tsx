"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { readStoredLanguagePreference } from "@/lib/i18n/client-language-preference";
import type { LanguagePreference } from "@/lib/i18n/config";
import { isThemeId, legacyThemeCacheKey, themeCacheKey } from "@/lib/themes";
import {
  defaultUserAppSettings,
  getUserAppSettings,
  resetUserAppSettings,
  upsertUserAppSettings,
  type UserAppSettings
} from "@/services/database/user-settings";

type UserSettingsContextValue = {
  settings: UserAppSettings;
  isLoadingSettings: boolean;
  isSavingSettings: boolean;
  saveError: string | null;
  updateSettings: (patch: Partial<UserAppSettings>) => Promise<UserAppSettings>;
  resetSettings: () => Promise<UserAppSettings>;
};

type UserSettingsProviderProps = {
  children: React.ReactNode;
  initialLanguagePreference: LanguagePreference;
};

const UserSettingsContext = createContext<UserSettingsContextValue | null>(null);

function readCachedThemeId() {
  if (typeof window === "undefined") return null;
  try {
    const cached = window.localStorage.getItem(themeCacheKey) ?? window.localStorage.getItem(legacyThemeCacheKey);
    return isThemeId(cached) ? cached : null;
  } catch {
    return null;
  }
}

function cacheThemeId(themeId: UserAppSettings["themeId"]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(themeCacheKey, themeId);
    window.localStorage.removeItem(legacyThemeCacheKey);
  } catch {
    // Local storage is only a paint cache; Supabase remains the source of truth.
  }
}

function withUser(settings: UserAppSettings, userId: string | null | undefined) {
  return { ...settings, userId: userId ?? settings.userId };
}

function withCachedTheme(settings: UserAppSettings) {
  const cachedThemeId = readCachedThemeId();
  return cachedThemeId ? { ...settings, themeId: cachedThemeId } : settings;
}

function withDevicePublicPreferences(
  settings: UserAppSettings,
  initialLanguagePreference: LanguagePreference
): UserAppSettings {
  return {
    ...withCachedTheme(settings),
    language: readStoredLanguagePreference() ?? initialLanguagePreference
  };
}

export function UserSettingsProvider({ children, initialLanguagePreference }: UserSettingsProviderProps) {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserAppSettings>(() => ({
    ...defaultUserAppSettings,
    language: initialLanguagePreference
  }));
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSettings((current) => withCachedTheme(current));
  }, []);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (isLoading) return;
      if (!user?.id) {
        setSettings(withDevicePublicPreferences(defaultUserAppSettings, initialLanguagePreference));
        setIsLoadingSettings(false);
        return;
      }

      setIsLoadingSettings(true);
      setSaveError(null);
      try {
        const loaded = await getUserAppSettings(user.id);
        cacheThemeId(loaded.themeId);
        const accountAuthoritative = {
          ...withCachedTheme(loaded),
          language: loaded.language
        };
        if (mounted) setSettings(accountAuthoritative);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Settings could not be loaded.";
        if (mounted) {
          const fallback = withDevicePublicPreferences(defaultUserAppSettings, initialLanguagePreference);
          setSettings(withUser(fallback, user.id));
          setSaveError(message);
        }
        toast({ title: "Settings could not be loaded", description: message, variant: "error" });
      } finally {
        if (mounted) setIsLoadingSettings(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [initialLanguagePreference, isLoading, toast, user?.id]);

  const updateSettings = useCallback(
    async (patch: Partial<UserAppSettings>) => {
      const previous = settings;
      const optimistic = withUser({ ...settings, ...patch }, user?.id);

      setSettings(optimistic);
      cacheThemeId(optimistic.themeId);
      if (!user?.id) return optimistic;
      setIsSavingSettings(true);
      setSaveError(null);
      try {
        const saved = await upsertUserAppSettings(user.id, patch);
        cacheThemeId(saved.themeId);
        setSettings(saved);
        return saved;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Settings could not be saved.";
        setSettings(previous);
        cacheThemeId(previous.themeId);
        setSaveError(message);
        toast({ title: "Settings could not be saved", description: message, variant: "error" });
        throw error;
      } finally {
        setIsSavingSettings(false);
      }
    },
    [settings, toast, user]
  );

  const resetSettings = useCallback(async () => {
    if (!user?.id) throw new Error("Sign in required to reset settings.");
    const previous = settings;
    const optimistic = withUser(defaultUserAppSettings, user.id);

    setSettings(optimistic);
    cacheThemeId(optimistic.themeId);
    setIsSavingSettings(true);
    setSaveError(null);
    try {
      const saved = await resetUserAppSettings(user.id);
      cacheThemeId(saved.themeId);
      setSettings(saved);
      return saved;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Settings could not be reset.";
      setSettings(previous);
      cacheThemeId(previous.themeId);
      setSaveError(message);
      toast({ title: "Settings could not be reset", description: message, variant: "error" });
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }, [settings, toast, user]);

  const value = useMemo(
    () => ({ settings, isLoadingSettings, isSavingSettings, saveError, updateSettings, resetSettings }),
    [isLoadingSettings, isSavingSettings, resetSettings, saveError, settings, updateSettings]
  );

  return <UserSettingsContext.Provider value={value}>{children}</UserSettingsContext.Provider>;
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error("useUserSettings must be used inside UserSettingsProvider");
  }
  return context;
}
