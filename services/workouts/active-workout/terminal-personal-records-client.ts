"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";

export type ActiveWorkoutCanonicalPersonalRecord = {
  id: string;
  exerciseName: string;
  recordType: string;
  recordValue: number;
  recordUnit: string;
  achievedAt: string;
};

async function accessToken() {
  const session = supabase ? await supabase.auth.getSession() : null;
  const token = session?.data.session?.access_token || (env.useMockAuth ? "plaivra-local-qa" : "");
  if (!token) throw new Error("Please sign in again.");
  return token;
}

export async function refreshAndReadActiveWorkoutPersonalRecords(
  sessionId: string,
  signal?: AbortSignal
): Promise<ActiveWorkoutCanonicalPersonalRecord[]> {
  const authorization = `Bearer ${await accessToken()}`;
  // The canonical workout is already terminal before this runs. Record rebuild
  // is a secondary projection: failure never rolls back or invalidates save,
  // but it must not be treated as a confirmed empty/stale PR result either.
  const refreshResponse = await fetch(
    `/api/workouts/history/${encodeURIComponent(sessionId)}/verified-records`,
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json", Authorization: authorization }
    }
  );
  if (!refreshResponse.ok) throw new Error("Personal records are unavailable.");

  const response = await fetch(
    `/api/workouts/active/${encodeURIComponent(sessionId)}/personal-records`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json", Authorization: authorization }
    }
  );
  if (!response.ok) throw new Error("Personal records are unavailable.");
  const body = await response.json() as { data?: ActiveWorkoutCanonicalPersonalRecord[] };
  return Array.isArray(body.data) ? body.data : [];
}
