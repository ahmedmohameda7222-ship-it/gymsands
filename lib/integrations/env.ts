import { NextResponse } from "next/server";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { env as publicEnv } from "@/lib/env";

export const serverEnv = {
  supabaseUrl: publicEnv.supabaseUrl,
  supabaseAnonKey: publicEnv.supabaseAnonKey,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  appUrl: publicEnv.appUrl,
  wgerApiKey: process.env.WGER_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  resendApiKey: process.env.RESEND_API_KEY || "",
  resendFromEmail: process.env.RESEND_FROM_EMAIL || "",
  stravaClientId: process.env.STRAVA_CLIENT_ID || "",
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET || "",
  stravaRedirectUri: process.env.STRAVA_REDIRECT_URI || "",
  googleHealthClientId: process.env.GOOGLE_HEALTH_CLIENT_ID || "",
  googleHealthClientSecret: process.env.GOOGLE_HEALTH_CLIENT_SECRET || "",
  googleHealthRedirectUri: process.env.GOOGLE_HEALTH_REDIRECT_URI || "",
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || "",
  gymAddress: process.env.GYM_ADDRESS || "",
  gymLat: process.env.GYM_LAT || "",
  gymLng: process.env.GYM_LNG || ""
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

  const { data, error } = await context.supabase
    .from("profiles")
    .select("role")
    .eq("id", context.user.id)
    .maybeSingle();

  if (error) return jsonError(error.message, 400);
  if (data?.role !== "admin") return jsonError("Admin access is required for this action.", 403);
  return context;
}

export function configuredProviders() {
  return [
    { provider: "Open Food Facts", configured: true },
    { provider: "wger", configured: Boolean(serverEnv.wgerApiKey) },
    { provider: "Gemini", configured: Boolean(serverEnv.geminiApiKey) },
    { provider: "Resend", configured: Boolean(serverEnv.resendApiKey && serverEnv.resendFromEmail) },
    { provider: "Strava", configured: Boolean(serverEnv.stravaClientId && serverEnv.stravaClientSecret && serverEnv.stravaRedirectUri) },
    { provider: "Google Health", configured: Boolean(serverEnv.googleHealthClientId && serverEnv.googleHealthClientSecret && serverEnv.googleHealthRedirectUri) },
    { provider: "Google Maps", configured: Boolean(serverEnv.googleMapsApiKey && (serverEnv.gymAddress || (serverEnv.gymLat && serverEnv.gymLng))) }
  ];
}
