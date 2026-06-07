import { NextResponse } from "next/server";
import { requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { buildStravaAuthUrl } from "@/lib/integrations/strava";

export async function GET(request: Request) {
  const missing = requireServerKeys("Strava", [
    ["STRAVA_CLIENT_ID", serverEnv.stravaClientId],
    ["STRAVA_CLIENT_SECRET", serverEnv.stravaClientSecret],
    ["STRAVA_REDIRECT_URI", serverEnv.stravaRedirectUri]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const state = Buffer.from(JSON.stringify({ userId: context.user.id })).toString("base64url");
  return NextResponse.json({ url: buildStravaAuthUrl(serverEnv.stravaClientId, serverEnv.stravaRedirectUri, state) });
}
