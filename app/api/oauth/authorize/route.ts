import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { handleOAuthAuthorize, handleOAuthAuthorizeDecision } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  return handleOAuthAuthorize(request);
}

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  return handleOAuthAuthorizeDecision(request, context.user.id);
}
