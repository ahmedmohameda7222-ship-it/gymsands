"use client";

import { isUuid } from "@/lib/utils";
import { resolveWorkoutHistoryCompatibilityAccessToken } from "@/services/workouts/history/session-compat";

export type VerifiedRecordRefreshResult = {
  session_id: string;
  record_count: number;
  schema_version: number;
  formula_version: string;
  status: "current";
};

export type VerifiedRecordAuthenticatedRequestContext = {
  accessToken: string | null | undefined;
  signal?: AbortSignal;
};

export async function refreshVerifiedRecordsWithCompatibilitySession(
  sessionId: string,
  signal?: AbortSignal,
): Promise<VerifiedRecordRefreshResult | null> {
  if (!isUuid(sessionId) || signal?.aborted) return null;
  const accessToken =
    await resolveWorkoutHistoryCompatibilityAccessToken();
  if (!accessToken || signal?.aborted) return null;
  return refreshVerifiedRecordsAuthenticated(sessionId, {
    accessToken,
    signal,
  });
}

export function refreshVerifiedRecordsAuthenticated(
  sessionId: string,
  context: VerifiedRecordAuthenticatedRequestContext,
): Promise<VerifiedRecordRefreshResult | null>;
/**
 * @deprecated Legacy non-AuthProvider compatibility only. New callers must
 * provide an explicit authenticated request context.
 */
export function refreshVerifiedRecordsAuthenticated(
  sessionId: string,
): Promise<VerifiedRecordRefreshResult | null>;
export async function refreshVerifiedRecordsAuthenticated(
  sessionId: string,
  context?: VerifiedRecordAuthenticatedRequestContext,
): Promise<VerifiedRecordRefreshResult | null> {
  if (context === undefined) {
    return refreshVerifiedRecordsWithCompatibilitySession(sessionId);
  }
  if (
    !isUuid(sessionId) ||
    !context.accessToken ||
    context.signal?.aborted
  ) {
    return null;
  }

  const response = await fetch(
    `/api/workouts/history/${encodeURIComponent(sessionId)}/verified-records`,
    {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: {
        Authorization: `Bearer ${context.accessToken}`,
        "Content-Type": "application/json",
      },
      signal: context.signal,
    },
  );
  if (!response.ok) {
    throw new Error(
      `Verified record refresh failed (${response.status}).`,
    );
  }
  return (await response.json()) as VerifiedRecordRefreshResult;
}
