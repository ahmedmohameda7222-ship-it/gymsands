import { NextResponse } from "next/server";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { sendResendEmail } from "@/lib/integrations/resend";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "email-send", 10, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("Resend email", [
    ["RESEND_API_KEY", serverEnv.resendApiKey],
    ["RESEND_FROM_EMAIL", serverEnv.resendFromEmail]
  ]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const to = String(body.to ?? context.user.email ?? "").trim();
  const subject = String(body.subject ?? "FitLife Hub").trim();
  const html = String(body.html ?? body.message ?? "").trim();
  const emailType = String(body.emailType ?? "member_message");
  if (!to || !subject || !html) return jsonError("to, subject, and html/message are required.");

  try {
    const result = await sendResendEmail({ apiKey: serverEnv.resendApiKey, from: serverEnv.resendFromEmail, to, subject, html });
    await context.supabase.from("email_logs").insert({
      user_id: context.user.id,
      email_type: emailType,
      to_email: to,
      provider_message_id: result.id ?? null,
      status: "sent"
    });
    return NextResponse.json({ sent: true, id: result.id ?? null });
  } catch (error) {
    await context.supabase.from("email_logs").insert({
      user_id: context.user.id,
      email_type: emailType,
      to_email: to,
      status: "failed",
      error_message: error instanceof Error ? error.message : "Unknown error"
    });
    return jsonError(error instanceof Error ? error.message : "Email send failed.", 400);
  }
}
