import { createClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/integrations/env";

export function hasSupabaseAdminConfig() {
  return Boolean(serverEnv.supabaseUrl && serverEnv.supabaseServiceRoleKey);
}

export function createSupabaseAdminClient() {
  if (!serverEnv.supabaseServiceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for server-side FitLife MCP actions.");
  }

  return createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}
