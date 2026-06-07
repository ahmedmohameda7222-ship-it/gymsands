import { oauthProtectedResourceMetadata } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return oauthProtectedResourceMetadata(request);
}
