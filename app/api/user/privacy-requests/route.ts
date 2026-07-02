import { NextResponse } from "next/server";
import { requireUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";

const allowedRequestTypes = new Set(["access", "export", "deletion", "portability", "correction", "restriction"]);

async function revokeChatGptForDeletion(context: Awaited<ReturnType<typeof requireUser>>) {
  if (context instanceof NextResponse) return false;
  const { error } = await context.supabase
    .from("chatgpt_connections")
    .update({ is_active: false, revoked_at: new Date().toISOString() })
    .eq("user_id", context.user.id)
    .eq("is_active", true);
  if (error) {
    console.error("Could not revoke ChatGPT while creating deletion request:", error.message);
    return false;
  }
  return true;
}

export async function GET(request: Request) {
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;
  const { data, error } = await context.supabase
    .from("privacy_requests")
    .select("id,request_type,status,created_at,updated_at,completed_at")
    .eq("user_id", context.user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Privacy requests could not be loaded." }, { status: 400 });
  return NextResponse.json({ requests: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "privacy-request", 5, 60_000);
  if (limited) return limited;

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
  if (body.message !== undefined && (typeof body.message !== "string" || body.message.trim().length > 500)) {
    return NextResponse.json({ error: "Privacy request notes must be plain text with at most 500 characters." }, { status: 400 });
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

  if (existing.error) {
    console.error("Plaivra privacy request lookup failed:", existing.error.message);
    return NextResponse.json({ error: "Privacy request status could not be checked." }, { status: 500 });
  }
  if (existing.data) {
    const chatgptAccessRevoked = requestType === "deletion" ? await revokeChatGptForDeletion(context) : undefined;
    return NextResponse.json({ request: existing.data, already_exists: true, chatgpt_access_revoked: chatgptAccessRevoked });
  }

  const { data, error } = await context.supabase
    .from("privacy_requests")
    .insert({
      user_id: context.user.id,
      request_type: requestType,
      status: "pending",
      message: body.message?.trim() || null
    })
    .select("id,request_type,status,created_at")
    .single();

  if (error) {
    console.error("Plaivra privacy request creation failed:", error.message);
    return NextResponse.json({ error: "The privacy request could not be submitted." }, { status: 500 });
  }
  const chatgptAccessRevoked = requestType === "deletion" ? await revokeChatGptForDeletion(context) : undefined;
  return NextResponse.json({ request: data, already_exists: false, chatgpt_access_revoked: chatgptAccessRevoked }, { status: 201 });
}
