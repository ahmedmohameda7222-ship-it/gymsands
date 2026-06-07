import { NextResponse } from "next/server";
import { configuredProviders, requireAdmin } from "@/lib/integrations/env";

export async function GET(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json({ providers: configuredProviders() });
}
