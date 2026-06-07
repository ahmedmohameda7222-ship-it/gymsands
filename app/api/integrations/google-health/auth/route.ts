import { NextResponse } from "next/server";
import { requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { buildGoogleHealthAuthUrl } from "@/lib/integrations/google-health";

export async function GET(request: Request) {
  const missing = requireServerKeys("Google Health", [
    ["GOOGLE_HEALTH_CLIENT_ID", serverEnv.googleHealthClientId],
    ["GOOGLE_HEALTH_CLIENT_SECRET", serverEnv.googleHealthClientSecret],
    ["GOOGLE_HEALTH_REDIRECT_URI", serverEnv.googleHealthRedirectUri]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const state = Buffer.from(JSON.stringify({ userId: context.user.id })).toString("base64url");
  return NextResponse.json({ url: buildGoogleHealthAuthUrl(serverEnv.googleHealthClientId, serverEnv.googleHealthRedirectUri, state) });
}
