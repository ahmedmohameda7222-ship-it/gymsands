import { NextResponse } from "next/server";
import { logExternalApi } from "@/lib/integrations/api-logger";
import { jsonError, requireServerKeys, requireUser, serverEnv } from "@/lib/integrations/env";
import { createCoachResponse } from "@/lib/integrations/openai";
import { rateLimit } from "@/lib/integrations/rate-limit";

export async function POST(request: Request) {
  const limited = rateLimit(request, "ai-coach", 12, 60_000);
  if (limited) return limited;
  const missing = requireServerKeys("OpenAI coach", [["OPENAI_API_KEY", serverEnv.openaiApiKey]]);
  if (missing) return missing;
  const context = await requireUser(request);
  if (context instanceof NextResponse) return context;

  const body = await request.json().catch(() => ({}));
  const mode = String(body.mode ?? "coach_note");
  const payload = JSON.stringify(body.context ?? body, null, 2);
  const prompt = `Mode: ${mode}\nUser context:\n${payload}`;

  try {
    const message = await createCoachResponse(serverEnv.openaiApiKey, prompt);
    await logExternalApi({ userId: context.user.id, provider: "openai", endpoint: "responses", status: "success", request: { mode }, responseStatus: 200 });
    return NextResponse.json({ message });
  } catch (error) {
    await logExternalApi({ userId: context.user.id, provider: "openai", endpoint: "responses", status: "error", request: { mode }, errorMessage: error instanceof Error ? error.message : "Unknown error" });
    return jsonError(error instanceof Error ? error.message : "Coach response failed.", 400);
  }
}
