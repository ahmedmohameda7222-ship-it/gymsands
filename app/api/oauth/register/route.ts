import { handleOAuthRegister, oauthRateLimit } from "@/lib/mcp/oauth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const rateLimitError = await oauthRateLimit(`register:${ip}`, 10, 60);
  if (rateLimitError) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), {
      status: 429,
      headers: { "Content-Type": "application/json" }
    });
  }

  return handleOAuthRegister();
}
