import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSavedAiPermissionScopes } from "@/lib/mcp/scopes";

const savedAccessSettingsTable = ["user", "ai", "permission", "settings"].join("_");

export type SavedAccessLookupResult =
  | { ok: true; scopes: string[] }
  | { ok: false; reason: "lookup_failed" };

export async function getSavedAccessScopes(supabase: SupabaseClient, userId: string): Promise<SavedAccessLookupResult> {
  try {
    const { data: settings, error } = await supabase
      .from(savedAccessSettingsTable)
      .select("access_mode,scopes")
      .match({ user_id: userId })
      .maybeSingle();

    if (error) return { ok: false, reason: "lookup_failed" };
    if (!settings || !Array.isArray(settings.scopes)) return { ok: true, scopes: [] };

    return { ok: true, scopes: resolveSavedAiPermissionScopes(settings.access_mode, settings.scopes) };
  } catch {
    return { ok: false, reason: "lookup_failed" };
  }
}
