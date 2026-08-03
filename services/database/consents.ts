import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import { isMockAuthUserId } from "@/lib/fixtures/mock-auth";
import { REQUIRED_CONSENTS } from "@/lib/legal/versions";

export type ConsentEvaluationRecord = {
  consent_type: string;
  version: string;
  granted: boolean;
  revoked_at: string | null;
};

export function evaluateRequiredConsents(
  records: readonly ConsentEvaluationRecord[],
): boolean {
  const grantedKeys = new Set(
    records
      .filter((record) => record.granted && !record.revoked_at)
      .map((record) => `${record.consent_type}:${record.version}`),
  );
  return REQUIRED_CONSENTS.every((required) =>
    grantedKeys.has(`${required.consent_type}:${required.version}`),
  );
}

export async function hasRequiredConsents(userId: string): Promise<boolean> {
  if (env.useMockAuth && isMockAuthUserId(userId)) return true;
  if (!supabase) return false;

  const { data, error } = await supabase
    .from("user_consents")
    .select("consent_type, version, granted, revoked_at")
    .eq("user_id", userId)
    .eq("granted", true)
    .is("revoked_at", null);

  if (error || !data) {
    console.warn("Plaivra could not check consent records.", error?.message);
    return false;
  }

  return evaluateRequiredConsents(data as ConsentEvaluationRecord[]);
}
