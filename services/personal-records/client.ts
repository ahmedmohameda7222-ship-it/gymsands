"use client";

import { env } from "@/lib/env";
import type { ManualPersonalRecordInput, PersonalRecordLineageDetail, PersonalRecordsMainResult } from "@/lib/personal-records/contracts";
import { supabase } from "@/lib/supabase/client";

async function token() {
  const session = supabase ? await supabase.auth.getSession() : null;
  const accessToken = session?.data.session?.access_token || (env.useMockAuth ? "plaivra-local-qa" : "");
  if (!accessToken) throw new Error("Please sign in again.");
  return accessToken;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) throw new Error(body.error || "Personal records request failed.");
  return body as T;
}

function query(values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== null && value !== undefined && value !== "") params.set(key, String(value));
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export function getPersonalRecordsMain(options: { sport?: string | null; cursor?: string | null; limit?: number } = {}) {
  return request<PersonalRecordsMainResult>(`/api/personal-records${query(options)}`);
}

export function getPersonalRecordLineage(lineageId: string, options: { event?: string | null; cursor?: string | null; limit?: number } = {}) {
  return request<PersonalRecordLineageDetail>(`/api/personal-records/${encodeURIComponent(lineageId)}${query(options)}`);
}

export function getExercisePersonalRecords(identity: string) {
  return request<{ performed: boolean; lastPerformedAt: string | null; highestLoad: unknown; estimatedOneRepMax: unknown; recentWorkoutId: string | null }>(`/api/personal-records/exercise${query({ identity })}`);
}

export function addManualPersonalRecord(input: ManualPersonalRecordInput) {
  return request<{ eventId: string }>("/api/personal-records", { method: "POST", body: JSON.stringify(input) });
}

export function editManualPersonalRecord(input: ManualPersonalRecordInput & { eventId: string }) {
  return request<{ eventId: string }>(`/api/personal-records/events/${encodeURIComponent(input.eventId)}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function removeManualPersonalRecord(eventId: string) {
  return request<{ deleted: true }>(`/api/personal-records/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
}
