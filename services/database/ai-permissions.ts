import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { UserAiPermissionSettings, AiPermissionSection } from "@/types";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

export const ALL_AI_PERMISSION_SECTIONS: AiPermissionSection[] = [
  "workouts",
  "nutrition",
  "meal_plans",
  "hydration",
  "wellness",
  "progress",
  "profile",
  "settings"
];

export type AiPermissionConfig = {
  accessMode: "full" | "custom";
  sections: Record<
    AiPermissionSection,
    { read: boolean; write: boolean }
  >;
};

export type AiPermissionSettingsStatus =
  | { state: "loaded"; message?: string }
  | { state: "none"; message?: string }
  | { state: "failed"; message: string };

function scopesToConfig(scopes: string[]): AiPermissionConfig {
  const isFull = scopes.includes("plaivra.full_access");

  const sections: AiPermissionConfig["sections"] = {
    workouts: { read: false, write: false },
    nutrition: { read: false, write: false },
    meal_plans: { read: false, write: false },
    hydration: { read: false, write: false },
    wellness: { read: false, write: false },
    progress: { read: false, write: false },
    profile: { read: false, write: false },
    settings: { read: false, write: false }
  };

  if (isFull) {
    for (const section of ALL_AI_PERMISSION_SECTIONS) {
      sections[section] = { read: true, write: true };
    }
  } else {
    for (const scope of scopes) {
      const match = scope.match(/^plaivra\.([a-z_]+)\.(read|write)$/);
      if (match) {
        const section = match[1] as AiPermissionSection;
        const action = match[2] as "read" | "write";
        if (section in sections) {
          sections[section][action] = true;
          if (action === "write") sections[section].read = true;
        }
      }
    }
  }

  return {
    accessMode: isFull ? "full" : "custom",
    sections
  };
}

export function configToScopes(config: AiPermissionConfig): string[] {
  if (config.accessMode === "full") {
    return [
      "plaivra.full_access",
      "plaivra.workouts.read",
      "plaivra.workouts.write",
      "plaivra.nutrition.read",
      "plaivra.nutrition.write",
      "plaivra.meal_plans.read",
      "plaivra.meal_plans.write",
      "plaivra.hydration.read",
      "plaivra.hydration.write",
      "plaivra.progress.read",
      "plaivra.progress.write",
      "plaivra.wellness.read",
      "plaivra.wellness.write",
      "plaivra.profile.read",
      "plaivra.profile.write",
      "plaivra.settings.read",
      "plaivra.settings.write"
    ];
  }

  const scopes: string[] = [];
  for (const section of ALL_AI_PERMISSION_SECTIONS) {
    const perms = config.sections[section];
    if (perms.read || perms.write) {
      scopes.push(`plaivra.${section}.read`);
    }
    if (perms.write) {
      scopes.push(`plaivra.${section}.write`);
    }
  }
  return scopes;
}

export function getDefaultAiPermissionConfig(): AiPermissionConfig {
  return scopesToConfig([]);
}

export async function getAiPermissionSettingsWithStatus(
  userId: string
): Promise<{ config: AiPermissionConfig | null; status: AiPermissionSettingsStatus }> {
  if (!canUseUserData(userId)) {
    return {
      config: null,
      status: { state: "failed", message: "Sign in again to load your AI permission settings." }
    };
  }

  const { data, error } = await supabase!
    .from("user_ai_permission_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not load AI permission settings:", error.message);
    return {
      config: null,
      status: { state: "failed", message: "Plaivra could not confirm your saved AI permissions. Retry before making changes." }
    };
  }

  if (!data) {
    return {
      config: null,
      status: { state: "none", message: "No saved AI permission choices yet." }
    };
  }

  const settings = data as UserAiPermissionSettings;
  return {
    config: scopesToConfig(settings.scopes),
    status: { state: "loaded" }
  };
}

export async function getAiPermissionSettings(userId: string): Promise<AiPermissionConfig | null> {
  const result = await getAiPermissionSettingsWithStatus(userId);
  return result.status.state === "failed" ? null : result.config;
}

export async function saveAiPermissionSettings(
  userId: string,
  config: AiPermissionConfig
): Promise<UserAiPermissionSettings> {
  if (!canUseUserData(userId)) {
    throw new Error("Sign in required to save AI permission settings.");
  }

  const scopes = configToScopes(config);
  const accessMode = config.accessMode;

  const { data, error } = await supabase!
    .from("user_ai_permission_settings")
    .upsert(
      {
        user_id: userId,
        access_mode: accessMode,
        scopes
      },
      { onConflict: "user_id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return data as UserAiPermissionSettings;
}

export async function getAiPermissionSettingsRaw(userId: string): Promise<UserAiPermissionSettings | null> {
  if (!canUseUserData(userId)) return null;
  const { data, error } = await supabase!
    .from("user_ai_permission_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Could not load AI permission settings:", error.message);
    return null;
  }
  return (data as UserAiPermissionSettings | null) ?? null;
}
