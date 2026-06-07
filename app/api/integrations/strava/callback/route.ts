import { NextResponse } from "next/server";
import { createSupabaseServerClient, jsonError, requireServerKeys, serverEnv } from "@/lib/integrations/env";
import { exchangeStravaCode } from "@/lib/integrations/strava";

export async function GET(request: Request) {
  const missing = requireServerKeys("Strava", [
    ["STRAVA_CLIENT_ID", serverEnv.stravaClientId],
    ["STRAVA_CLIENT_SECRET", serverEnv.stravaClientSecret],
    ["STRAVA_REDIRECT_URI", serverEnv.stravaRedirectUri]
  ]);
  if (missing) return missing;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return jsonError("Missing Strava code or state.", 400);

  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId?: string };
    if (!parsed.userId) return jsonError("Invalid Strava state.", 400);
    const token = await exchangeStravaCode(serverEnv.stravaClientId, serverEnv.stravaClientSecret, code);
    const supabase = createSupabaseServerClient(null, true);
    await supabase.from("user_integrations").upsert(
      {
        user_id: parsed.userId,
        provider: "strava",
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_at ? new Date(token.expires_at * 1000).toISOString() : null,
        scopes: ["read", "activity:read_all"],
        provider_user_id: token.athlete?.id ? String(token.athlete.id) : null
      },
      { onConflict: "user_id,provider" }
    );
    return NextResponse.redirect(`${serverEnv.appUrl}/settings?strava=connected`);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Strava callback failed.", 400);
  }
}
