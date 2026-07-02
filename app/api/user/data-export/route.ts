import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { buildCurrentUserDataExport } from "@/lib/privacy/data-export";
import { rateLimit } from "@/lib/integrations/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limited = rateLimit(request, "data-export", 3, 60_000);
  if (limited) return limited;

  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  try {
    const payload = await buildCurrentUserDataExport(context.supabase, context.user);
    const date = new Date().toISOString().slice(0, 10);
    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="plaivra-data-export-${date}.json"`,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("Plaivra data export failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Your Plaivra data export could not be generated." }, { status: 500 });
  }
}
