"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { useToast } from "@/components/ui/toaster";
import { readStoredLanguagePreference } from "@/lib/i18n/client-language-preference";
import type { LanguagePreference } from "@/lib/i18n/config";
import { isThemeId, legacyThemeCacheKey, themeCacheKey } from "@/lib/themes";
import {
  defaultUserAppSettings,
  normalizeUserAppSettings,
  resetUserAppSettings,
  upsertUserAppSettings,
  type UserAppSettings,
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
    const cached =
      window.localStorage.getItem(themeCacheKey) ??
      window.localStorage.getItem(legacyThemeCacheKey);
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
    // Local storage is only a paint cache; the bootstrap/database remains authoritative.
  }
}

function withUser(
  settings: UserAppSettings,
  userId: string | null | undefined,
) {
  return { ...settings, userId: userId ?? settings.userId };
}

function withCachedTheme(settings: UserAppSettings) {
  const cachedThemeId = readCachedThemeId();
  return cachedThemeId ? { ...settings, themeId: cachedThemeId } : settings;
}

function withDevicePublicPreferences(
  settings: UserAppSettings,
  initialLanguagePreference: LanguagePreference,
): UserAppSettings {
  return {
    ...withCachedTheme(settings),
    language: readStoredLanguagePreference() ?? initialLanguagePreference,
  };
}

function authenticatedDefaults(userId: string) {
  return normalizeUserAppSettings(defaultUserAppSettings, userId);
}

export function UserSettingsProvider({
  children,
  initialLanguagePreference,
}: UserSettingsProviderProps) {
  const {
    user,
    isLoading,
    bootstrap,
    bootstrapStatus,
    bootstrapError,
  } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<UserAppSettings>(() =>
    withCachedTheme({
      ...defaultUserAppSettings,
      language: initialLanguagePreference,
    }),
  );
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSettings((current) => withCachedTheme(current));
  }, []);

  useEffect(() => {
    if (isLoading) return;

    if (!user?.id) {
      setSettings(
        withDevicePublicPreferences(
          defaultUserAppSettings,
          initialLanguagePreference,
        ),
      );
      setSaveError(null);
      setIsLoadingSettings(false);
      return;
    }

    if (bootstrapStatus === "ready" && bootstrap?.userId === user.id) {
      const authoritative = {
        ...withCachedTheme(bootstrap.settings),
        language: bootstrap.settings.language,
      };
      cacheThemeId(authoritative.themeId);
      setSettings(authoritative);
      setSaveError(null);
      setIsLoadingSettings(false);
      return;
    }

    if (settings.userId !== user.id) {
      setSettings(withCachedTheme(authenticatedDefaults(user.id)));
    }

    if (bootstrapStatus === "error") {
      const message =
        bootstrapError?.message ?? "Settings could not be loaded.";
      setSettings((current) =>
        current.userId === user.id
          ? current
          : withCachedTheme(authenticatedDefaults(user.id)),
      );
      setSaveError(message);
      setIsLoadingSettings(false);
      toast({
        title: "Settings could not be loaded",
        description: message,
        variant: "error",
      });
      return;
    }

    setIsLoadingSettings(true);
  }, [
    bootstrap,
    bootstrapError,
    bootstrapStatus,
    initialLanguagePreference,
    isLoading,
    settings.userId,
    toast,
    user?.id,
  ]);

  const visibleSettings = useMemo(() => {
    if (user?.id && settings.userId !== user.id) {
      return withCachedTheme(authenticatedDefaults(user.id));
    }
    if (!user?.id && settings.userId) {
      return withDevicePublicPreferences(
        defaultUserAppSettings,
        initialLanguagePreference,
      );
    }
    return settings;
  }, [initialLanguagePreference, settings, user?.id]);

  const updateSettings = useCallback(
    async (patch: Partial<UserAppSettings>) => {
      const previous = visibleSettings;
      const optimistic = withUser(
        { ...visibleSettings, ...patch },
        user?.id,
      );

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
        const message =
          error instanceof Error
            ? error.message
            : "Settings could not be saved.";
        setSettings(previous);
        cacheThemeId(previous.themeId);
        setSaveError(message);
        toast({
          title: "Settings could not be saved",
          description: message,
          variant: "error",
        });
        throw error;
      } finally {
        setIsSavingSettings(false);
      }
    },
    [toast, user?.id, visibleSettings],
  );

  const resetSettings = useCallback(async () => {
    if (!user?.id) throw new Error("Sign in required to reset settings.");
    const previous = visibleSettings;
    const optimistic = authenticatedDefaults(user.id);

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
      const message =
        error instanceof Error ? error.message : "Settings could not be reset.";
      setSettings(previous);
      cacheThemeId(previous.themeId);
      setSaveError(message);
      toast({
        title: "Settings could not be reset",
        description: message,
        variant: "error",
      });
      throw error;
    } finally {
      setIsSavingSettings(false);
    }
  }, [toast, user?.id, visibleSettings]);

  const value = useMemo(
    () => ({
      settings: visibleSettings,
      isLoadingSettings,
      isSavingSettings,
      saveError,
      updateSettings,
      resetSettings,
    }),
    [
      isLoadingSettings,
      isSavingSettings,
      resetSettings,
      saveError,
      updateSettings,
      visibleSettings,
    ],
  );

  return (
    <UserSettingsContext.Provider value={value}>
      {children}
    </UserSettingsContext.Provider>
  );
}

export function useUserSettings() {
  const context = useContext(UserSettingsContext);
  if (!context) {
    throw new Error("useUserSettings must be used inside UserSettingsProvider");
  }
  return context;
}
