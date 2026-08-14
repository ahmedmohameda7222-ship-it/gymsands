"use client";

export type ActiveWorkoutCanonicalPersonalRecord = {
  id: string;
  exerciseName: string;
  recordType: string;
  recordValue: number;
  recordUnit: string;
  achievedAt: string;
};

export async function refreshAndReadActiveWorkoutPersonalRecords(
  sessionId: string,
  signal?: AbortSignal
): Promise<ActiveWorkoutCanonicalPersonalRecord[]> {
  // The canonical workout is already terminal before this runs. Record rebuild
  // is a secondary projection: failure never rolls back or invalidates save.
  await fetch(`/api/workouts/history/${encodeURIComponent(sessionId)}/verified-records`, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers: { Accept: "application/json" }
  }).catch(() => undefined);

  const response = await fetch(
    `/api/workouts/active/${encodeURIComponent(sessionId)}/personal-records`,
    {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal,
      headers: { Accept: "application/json" }
    }
  );
  if (!response.ok) throw new Error("Personal records are unavailable.");
  const body = await response.json() as { data?: ActiveWorkoutCanonicalPersonalRecord[] };
  return Array.isArray(body.data) ? body.data : [];
}
