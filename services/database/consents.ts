import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";

export async function hasRequiredConsents(userId: string): Promise<boolean> {
  if (env.useMockAuth && userId === "mock-user") return true;
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("user_consents")
    .select("consent_type, version, revoked_at")
    .eq("user_id", userId)
    .eq("granted", true)
    .is("revoked_at", null);

  if (error || !data) {
    console.warn("Plaivra could not check consent records.", error?.message);
    return false;
  }

  const grantedKeys = new Set(data.map((c) => `${c.consent_type}:${c.version}`));
  return REQUIRED_CONSENTS.every((req) =>
    grantedKeys.has(`${req.consent_type}:${req.version}`)
  );
}
