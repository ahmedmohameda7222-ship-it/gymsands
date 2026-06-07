import { NextResponse } from "next/server";
import { jsonError, requireAdmin } from "@/lib/integrations/env";

export async function POST(request: Request) {
  const context = await requireAdmin(request);
  if (context instanceof NextResponse) return context;
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids : [body.id].filter(Boolean);
  if (!ids.length) return jsonError("At least one exercise id is required.");
  const { error } = await context.supabase.from("exercises").update({ is_approved: false, is_global: false }).in("id", ids);
  if (error) return jsonError(error.message, 400);
  return NextResponse.json({ rejected: ids.length });
}
