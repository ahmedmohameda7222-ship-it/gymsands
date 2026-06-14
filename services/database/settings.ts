"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";
import type { WelcomeSettings } from "@/types";

function canUseUserData(userId: string | null | undefined) {
  return Boolean(supabase && isUuid(userId));
}

export async function getWelcomeSettings(userId: string): Promise<WelcomeSettings> {
  const fallback: WelcomeSettings = {
    popup_enabled: true,
    show_frequency: "once_per_day",
    default_message: "Welcome back to FitLife Hub. Ready for today?"
  };
  if (!canUseUserData(userId)) return fallback;

  const [settingsResult, customResult] = await Promise.all([
    supabase!.from("admin_settings").select("value").eq("key", "welcome_settings").maybeSingle(),
    supabase!.from("user_welcome_messages").select("message,popup_enabled,show_frequency").eq("user_id", userId).eq("is_active", true).maybeSingle()
  ]);

  if (settingsResult.error || customResult.error) {
    console.warn(
      "FitLife Hub could not load welcome settings.",
      settingsResult.error?.message || customResult.error?.message
    );
    return fallback;
  }

  const parsed = (settingsResult.data?.value as WelcomeSettings | null) ?? fallback;
  const custom = customResult.data;
  return {
    ...parsed,
    default_message: custom?.message ?? parsed.default_message,
    popup_enabled: custom?.popup_enabled ?? parsed.popup_enabled,
    show_frequency: custom?.show_frequency ?? parsed.show_frequency
  };
}

export async function adminUpsertWelcomeMessage(payload: {
  user_id: string;
  message: string;
  popup_enabled: boolean;
  show_frequency: "every_login" | "once_per_day";
}) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("user_welcome_messages")
    .upsert({ ...payload, is_active: true }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function adminUpdateWelcomeSettings(settings: WelcomeSettings) {
  if (!supabase) throw new Error("Database not connected");
  const { data, error } = await supabase!
    .from("admin_settings")
    .upsert({ key: "welcome_settings", value: settings }, { onConflict: "key" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}
