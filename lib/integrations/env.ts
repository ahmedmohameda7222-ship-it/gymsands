import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { env as publicEnv } from "@/lib/env";

export const serverEnv = {
  supabaseUrl: publicEnv.supabaseUrl,
  supabaseAnonKey: publicEnv.supabaseAnonKey,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  appUrl: publicEnv.appUrl,
  wgerApiKey: process.env.WGER_API_KEY || "",
  plaivraMcpBaseUrl: process.env.PLAIVRA_MCP_BASE_URL || process.env.FITLIFE_MCP_BASE_URL || `${publicEnv.appUrl}/api/mcp`,
  plaivraMcpTokenSecret: process.env.PLAIVRA_MCP_TOKEN_SECRET || process.env.FITLIFE_MCP_TOKEN_SECRET || "",
  plaivraMcpOAuthClientId: process.env.PLAIVRA_MCP_OAUTH_CLIENT_ID || process.env.FITLIFE_MCP_OAUTH_CLIENT_ID || "",
  plaivraMcpOAuthClientSecret: process.env.PLAIVRA_MCP_OAUTH_CLIENT_SECRET || process.env.FITLIFE_MCP_OAUTH_CLIENT_SECRET || "",
  plaivraAllowLegacyMcpClientId: process.env.PLAIVRA_ALLOW_LEGACY_MCP_CLIENT_ID === "true",
  plaivraChatGptRedirectUris: process.env.PLAIVRA_CHATGPT_REDIRECT_URIS || "",
  plaivraMcpAllowedOrigins: process.env.PLAIVRA_MCP_ALLOWED_ORIGINS || process.env.FITLIFE_MCP_ALLOWED_ORIGINS || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL || ""
};

export type RouteContext = {
  supabase: SupabaseClient;
  user: User;
};

export function jsonError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function missingConfiguration(provider: string, keys: string[]) {
  return jsonError(`${provider} is not configured. Set ${keys.join(", ")} on the server to enable this feature.`, 503);
}

export function requireServerKeys(provider: string, entries: Array<[string, string]>) {
  const missing = entries.filter(([, value]) => !value).map(([key]) => key);
  return missing.length ? missingConfiguration(provider, missing) : null;
}

export function createSupabaseServerClient(authorization?: string | null, useServiceRole = false) {
  const key = useServiceRole && serverEnv.supabaseServiceRoleKey ? serverEnv.supabaseServiceRoleKey : serverEnv.supabaseAnonKey;
  return createClient(serverEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: authorization ? { headers: { Authorization: authorization } } : undefined
  });
}

export async function requireUser(request: Request): Promise<RouteContext | NextResponse> {
  const authorization = request.headers.get("authorization");
  if (!authorization) return jsonError("Please sign in before using this feature.", 401);

  const supabase = createSupabaseServerClient(authorization);
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return jsonError("Your session expired. Please sign in again.", 401);
  return { supabase, user: data.user };
}

export async function requireAdmin(request: Request): Promise<RouteContext | NextResponse> {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const { data, error } = await context.supabase.from("profiles").select("role").eq("id", context.user.id).maybeSingle();
  if (error) return jsonError(error.message, 400);
  if (data?.role !== "admin") return jsonError("Admin access is required for this action.", 403);
  return context;
}

export function configuredProviders() {
  return [
    { provider: "Open Food Facts", configured: true },
    { provider: "wger", configured: Boolean(serverEnv.wgerApiKey) },
    { provider: "ChatGPT MCP Connector", configured: Boolean(serverEnv.plaivraMcpBaseUrl && serverEnv.plaivraMcpTokenSecret && serverEnv.supabaseServiceRoleKey) },
    { provider: "Resend", configured: Boolean(serverEnv.resendApiKey && serverEnv.resendFromEmail) }
  ];
}
