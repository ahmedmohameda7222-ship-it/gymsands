import { createSupabaseServerClient, serverEnv } from "@/lib/integrations/env";

export async function hashRequest(value: unknown) {
  const payload = typeof value === "string" ? value : JSON.stringify(value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function logExternalApi({
  userId,
  provider,
  endpoint,
  status,
  request,
  responseStatus,
  errorMessage
}: {
  userId?: string | null;
  provider: string;
  endpoint: string;
  status: string;
  request?: unknown;
  responseStatus?: number | null;
  errorMessage?: string | null;
}) {
  if (!serverEnv.supabaseServiceRoleKey) return;
  const supabase = createSupabaseServerClient(null, true);
  const request_hash = request ? await hashRequest(request) : null;
  await supabase.from("external_api_logs").insert({
    user_id: userId ?? null,
    provider,
    endpoint,
    status,
    request_hash,
    response_status: responseStatus ?? null,
    error_message: errorMessage ?? null
  });
}
