import { NextResponse } from "next/server";
import { createSupabaseServerClient, jsonError, requireServerKeys, serverEnv } from "@/lib/integrations/env";
import { exchangeGoogleHealthCode } from "@/lib/integrations/google-health";

export async function GET(request: Request) {
  const missing = requireServerKeys("Google Health", [
    ["GOOGLE_HEALTH_CLIENT_ID", serverEnv.googleHealthClientId],
    ["GOOGLE_HEALTH_CLIENT_SECRET", serverEnv.googleHealthClientSecret],
    ["GOOGLE_HEALTH_REDIRECT_URI", serverEnv.googleHealthRedirectUri]
  ]);
  if (missing) return missing;
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return jsonError("Missing Google Health code or state.", 400);

  try {
    const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as { userId?: string };
    if (!parsed.userId) return jsonError("Invalid Google Health state.", 400);
    const token = await exchangeGoogleHealthCode(serverEnv.googleHealthClientId, serverEnv.googleHealthClientSecret, serverEnv.googleHealthRedirectUri, code);
    const supabase = createSupabaseServerClient(null, true);
    await supabase.from("user_integrations").upsert(
      {
        user_id: parsed.userId,
        provider: "google_health",
        access_token: token.access_token,
        refresh_token: token.refresh_token,
        expires_at: token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null,
        scopes: ["fitness.activity.read"],
        provider_user_id: null
      },
      { onConflict: "user_id,provider" }
    );
    return NextResponse.redirect(`${serverEnv.appUrl}/settings?google_health=connected`);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Google Health callback failed.", 400);
  }
}
