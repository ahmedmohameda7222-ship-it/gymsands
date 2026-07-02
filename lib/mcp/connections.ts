import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSavedAiPermissionScopes } from "@/lib/mcp/scopes";

const savedAccessSettingsTable = ["user", "ai", "permission", "settings"].join("_");

export async function getSavedUserAiScopes(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data: settings, error } = await supabase
    .from(savedAccessSettingsTable)
    .select("access_mode,scopes")
    .match({ user_id: userId })
    .maybeSingle();

  if (error) {
    throw new Error(`Saved access lookup failed: ${error.code ?? "unknown"} ${error.message}`);
  }
  if (!settings || !Array.isArray(settings.scopes)) return [];
  return resolveSavedAiPermissionScopes(settings.access_mode, settings.scopes);
}

export function rotateMcpConnection(
  supabase: SupabaseClient,
  input: { userId: string; tokenHash: string; scopes: string[] }
) {
  return supabase.rpc("rotate_chatgpt_connection", {
    p_user_id: input.userId,
    p_token_hash: input.tokenHash,
    p_scopes: input.scopes
  });
}
