import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { getMcpActivityForUser } from "@/lib/mcp/activity";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "mcp-activity", 30, 60_000);
  if (limited) return limited;

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  try {
    const activities = await getMcpActivityForUser(context.supabase, context.user.id);
    return NextResponse.json({ activities }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Plaivra MCP activity load failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "ChatGPT activity could not be loaded." }, { status: 500 });
  }
}
