import { handleOAuthRegister } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return handleOAuthRegister(request);
}
