import { handleOAuthRegister } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function POST() {
  return handleOAuthRegister();
}
