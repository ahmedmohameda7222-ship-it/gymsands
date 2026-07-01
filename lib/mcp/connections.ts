import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSavedAiPermissionScopes } from "@/lib/mcp/scopes";

export async function getSavedUserAiScopes(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data: settings, error } = await supabase
    .from("user_ai_permission_settings")
    .select("access_mode,scopes")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !settings || !Array.isArray(settings.scopes)) return [];
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
