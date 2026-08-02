"use client";

import { supabase } from "@/lib/supabase/client";
import { isUuid } from "@/lib/utils";

export type VerifiedRecordRefreshResult = {
  session_id: string;
  record_count: number;
  schema_version: number;
  formula_version: string;
  status: "current";
};

export async function refreshVerifiedRecordsAuthenticated(
  sessionId: string,
): Promise<VerifiedRecordRefreshResult | null> {
  if (!supabase || !isUuid(sessionId)) return null;
  const auth = await supabase.auth.getSession();
  const token = auth.data.session?.access_token;
  if (auth.error || !token) return null;

  const response = await fetch(
    `/api/workouts/history/${encodeURIComponent(sessionId)}/verified-records`,
    {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Verified record refresh failed (${response.status}).`);
  }
  return (await response.json()) as VerifiedRecordRefreshResult;
}
