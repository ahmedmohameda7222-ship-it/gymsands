import { NextResponse } from "next/server";
import { configuredProviders, requireAdmin } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function GET(request: Request) {
  const limited = rateLimit(request, "admin-api-status", 30, 60_000);
  if (limited) return limited;

  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json({ providers: configuredProviders() });
}
