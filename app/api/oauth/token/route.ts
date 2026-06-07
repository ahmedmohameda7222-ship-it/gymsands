import { handleOAuthToken } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleOAuthToken(request);
}
