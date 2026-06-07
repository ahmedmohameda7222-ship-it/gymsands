import { NextResponse } from "next/server";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { sendResendEmail } from "@/lib/integrations/resend";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "email-weekly-summary", 6, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("Resend weekly summary", [
    ["RESEND_API_KEY", serverEnv.resendApiKey],
    ["RESEND_FROM_EMAIL", serverEnv.resendFromEmail]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const to = String(body.to ?? context.user.email ?? "").trim();
  if (!to) return jsonError("A recipient email is required.");
  const html = String(
    body.html ??
      `<h1>Your FitLife Hub weekly summary</h1><p>${body.summary ?? "Your weekly summary is ready inside FitLife Hub."}</p>`
  );

  try {
    const result = await sendResendEmail({
      apiKey: serverEnv.resendApiKey,
      from: serverEnv.resendFromEmail,
      to,
      subject: "Your FitLife Hub weekly summary",
      html
    });
    await context.supabase.from("email_logs").insert({
      user_id: context.user.id,
      email_type: "weekly_summary",
      to_email: to,
      provider_message_id: result.id ?? null,
      status: "sent"
    });
    return NextResponse.json({ sent: true, id: result.id ?? null });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Weekly summary email failed.", 400);
  }
}
