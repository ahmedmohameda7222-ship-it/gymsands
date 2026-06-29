"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { WelcomeSettings } from "@/types";

const fallbackWelcomeSettings: WelcomeSettings = {
  popup_enabled: true,
  show_frequency: "once_per_day",
  default_message: "Welcome back to Plaivra. Ready for today?",
  is_custom_message: false
};

type WelcomeFrequency = "every_login" | "once_per_day";

export type AdminWelcomeMessage = {
  user_id: string;
  message: string;
  popup_enabled: boolean;
  show_frequency: WelcomeFrequency;
  is_active: boolean;
};

type WelcomeSettingsRow = {
  value: Partial<WelcomeSettings> | null;
};

type CustomWelcomeMessageRow = {
  message: string | null;
  popup_enabled: boolean | null;
  show_frequency: string | null;
};

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

function normalizeFrequency(value: unknown): WelcomeFrequency {
  return value === "every_login" ? "every_login" : "once_per_day";
}

function normalizeWelcomeSettings(value: Partial<WelcomeSettings> | null | undefined): WelcomeSettings {
  const message = typeof value?.default_message === "string" && value.default_message.trim()
    ? value.default_message.trim()
    : fallbackWelcomeSettings.default_message;

  return {
    popup_enabled: typeof value?.popup_enabled === "boolean" ? value.popup_enabled : fallbackWelcomeSettings.popup_enabled,
    show_frequency: normalizeFrequency(value?.show_frequency),
    default_message: message,
    is_custom_message: Boolean(value?.is_custom_message)
  };
}

export async function getWelcomeSettings(userId: string): Promise<WelcomeSettings> {
  if (!canUseUserData(userId)) return fallbackWelcomeSettings;

  const [settingsResult, customResult] = await Promise.all([
    supabase!.from("public_app_settings").select("value").eq("key", "welcome_settings").maybeSingle(),
    supabase!
      .from("user_welcome_messages")
      .select("message,popup_enabled,show_frequency")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle()
  ]);

  if (settingsResult.error) {
    console.warn("Plaivra could not load default welcome settings.", settingsResult.error.message);
  }

  const settingsRow = settingsResult.data as WelcomeSettingsRow | null;
  const parsed = normalizeWelcomeSettings(settingsRow?.value ?? null);

  if (customResult.error) {
    console.warn("Plaivra could not load custom welcome message.", customResult.error.message);
    return parsed;
  }

  const custom = customResult.data as CustomWelcomeMessageRow | null;
  if (!custom?.message?.trim()) return parsed;

  return {
    ...parsed,
    default_message: custom.message.trim(),
    popup_enabled: typeof custom.popup_enabled === "boolean" ? custom.popup_enabled : parsed.popup_enabled,
    show_frequency: normalizeFrequency(custom.show_frequency),
    is_custom_message: true
  };
}

export async function adminGetWelcomeSettings(): Promise<WelcomeSettings> {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!.from("public_app_settings").select("value").eq("key", "welcome_settings").maybeSingle();
  if (error) throw error;
  const settingsRow = data as WelcomeSettingsRow | null;
  return normalizeWelcomeSettings(settingsRow?.value ?? null);
}

export async function adminListWelcomeMessages(): Promise<AdminWelcomeMessage[]> {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("user_welcome_messages")
    .select("user_id,message,popup_enabled,show_frequency,is_active")
    .eq("is_active", true);
  if (error) throw error;
  return ((data ?? []) as Array<{
    user_id: string;
    message: string | null;
    popup_enabled: boolean | null;
    show_frequency: string | null;
    is_active: boolean | null;
  }>)
    .filter((item) => Boolean(item.user_id && item.message?.trim()))
    .map((item) => ({
      user_id: item.user_id,
      message: item.message?.trim() ?? "",
      popup_enabled: typeof item.popup_enabled === "boolean" ? item.popup_enabled : true,
      show_frequency: normalizeFrequency(item.show_frequency),
      is_active: typeof item.is_active === "boolean" ? item.is_active : true
    }));
}

export async function adminUpsertWelcomeMessage(payload: {
  user_id: string;
  message: string;
  popup_enabled: boolean;
  show_frequency: WelcomeFrequency;
}) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("user_welcome_messages")
    .upsert({ ...payload, message: payload.message.trim(), is_active: true }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function adminUpdateWelcomeSettings(settings: WelcomeSettings) {
  if (!supabase) throw new Error("Database not connected");
  const normalized = normalizeWelcomeSettings(settings);
  const { data, error } = await supabase!
    .from("public_app_settings")
    .upsert({ key: "welcome_settings", value: { ...normalized, is_custom_message: false } }, { onConflict: "key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
