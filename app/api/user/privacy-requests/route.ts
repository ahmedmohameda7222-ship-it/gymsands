import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";

const allowedRequestTypes = new Set(["access", "export", "deletion", "portability", "correction", "restriction"]);

export async function POST(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  let body: { request_type?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const requestType = body.request_type?.trim() ?? "";
  if (!allowedRequestTypes.has(requestType)) {
    return NextResponse.json({ error: "Unsupported privacy request type." }, { status: 400 });
  }

  const existing = await context.supabase
    .from("privacy_requests")
    .select("id,status,created_at")
    .eq("user_id", context.user.id)
    .eq("request_type", requestType)
    .in("status", ["pending", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  if (existing.data) return NextResponse.json({ request: existing.data, already_exists: true });

  const { data, error } = await context.supabase
    .from("privacy_requests")
    .insert({
      user_id: context.user.id,
      request_type: requestType,
      status: "pending",
      message: body.message?.trim().slice(0, 2000) || null
    })
    .select("id,request_type,status,created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ request: data, already_exists: false }, { status: 201 });
}
