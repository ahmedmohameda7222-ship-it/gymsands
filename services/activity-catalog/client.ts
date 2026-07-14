"use client";

import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase/client";
import type {
  ActivityCatalogAlternative,
  ActivityCatalogAlternativesOptions,
  ActivityCatalogFilterOptions,
  ActivityCatalogRequestOptions,
  ActivityCatalogResult,
  ActivityCatalogSearchParams,
  ActivityCatalogSport,
  ActivityCatalogSportSessionTemplate,
  TrainingActivity
} from "@/lib/activity-catalog/types";

const INTERNAL_CATALOG_ROOT = "/api/activity-catalog";
const MOCK_ACCESS_TOKEN = "plaivra-local-mock-auth";

export class ActivityCatalogClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ActivityCatalogClientError";
    this.code = code;
    this.status = status;
  }
}

async function accessToken() {
  if (supabase) {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ActivityCatalogClientError("unauthorized", "Your session expired. Please sign in again.", 401);
    if (data.session?.access_token) return data.session.access_token;
  }
  if (env.useMockAuth && process.env.NODE_ENV !== "production") return MOCK_ACCESS_TOKEN;
  throw new ActivityCatalogClientError("unauthorized", "Your session expired. Please sign in again.", 401);
}

function isResult<T>(value: unknown): value is ActivityCatalogResult<T> {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<ActivityCatalogResult<T>>;
  return (
    "data" in result &&
    Boolean(result.meta) &&
    (result.meta?.source === "external" || result.meta?.source === "legacy") &&
    typeof result.meta?.degraded === "boolean"
  );
}

function safeInternalError(payload: unknown, status: number) {
  const body = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const nested = body.error && typeof body.error === "object" ? body.error as Record<string, unknown> : null;
  const code = String(nested?.code ?? body.code ?? (status === 401 ? "unauthorized" : "unavailable"));
  if (status === 401) return new ActivityCatalogClientError(code, "Your session expired. Please sign in again.", 401);
  if (status === 403) return new ActivityCatalogClientError(code, "Your account cannot use the activity catalog right now.", 403);
  const messages: Record<string, string> = {
    invalid_request: "The activity catalog request is invalid.",
    not_found: "The requested exercise could not be found.",
    timeout: "The exercise library took too long to respond.",
    upstream_unauthorized: "The exercise library connection needs administrator attention.",
    upstream_forbidden: "The exercise library connection needs administrator attention.",
    invalid_response: "The exercise library returned an invalid response.",
    unavailable: "The exercise library is temporarily unavailable."
  };
  return new ActivityCatalogClientError(code, messages[code] ?? messages.unavailable, status);
}

async function requestCatalog<T>(path: string, signal?: AbortSignal): Promise<ActivityCatalogResult<T>> {
  if (!path.startsWith(`${INTERNAL_CATALOG_ROOT}/`) || path.includes("://")) {
    throw new ActivityCatalogClientError("invalid_request", "The activity catalog request is invalid.", 400);
  }
  const token = await accessToken();
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw safeInternalError(payload, response.status);
  if (!isResult<T>(payload)) {
    throw new ActivityCatalogClientError("invalid_response", "The exercise library returned an invalid response.", 502);
  }
  return payload;
}

function appendOptions(search: URLSearchParams, options?: ActivityCatalogRequestOptions) {
  if (options?.locale) search.set("locale", options.locale);
}

export function listActivityCatalogSports(options?: ActivityCatalogRequestOptions) {
  const search = new URLSearchParams();
  appendOptions(search, options);
  return requestCatalog<ActivityCatalogSport[]>(`${INTERNAL_CATALOG_ROOT}/sports${search.size ? `?${search}` : ""}`, options?.signal);
}

export function getActivityCatalogSportSessionTemplate(sportSlug: string, options?: ActivityCatalogRequestOptions) {
  const search = new URLSearchParams();
  appendOptions(search, options);
  return requestCatalog<ActivityCatalogSportSessionTemplate>(
    `${INTERNAL_CATALOG_ROOT}/sports/${encodeURIComponent(sportSlug)}/session-template${search.size ? `?${search}` : ""}`,
    options?.signal
  );
}

export function getActivityCatalogFilters(options?: ActivityCatalogRequestOptions & { sport?: string }) {
  const search = new URLSearchParams();
  appendOptions(search, options);
  if (options?.sport) search.set("sport", options.sport);
  return requestCatalog<ActivityCatalogFilterOptions>(`${INTERNAL_CATALOG_ROOT}/filters${search.size ? `?${search}` : ""}`, options?.signal);
}

export function searchActivityCatalog(params: ActivityCatalogSearchParams & { signal?: AbortSignal } = {}) {
  const search = new URLSearchParams();
  const strings = ["query", "sport", "sessionType", "phase", "activityType", "difficulty", "goal", "locale"] as const;
  strings.forEach((key) => {
    const value = params[key];
    if (value) search.set(key, value);
  });
  if (params.equipment?.length) search.set("equipment", params.equipment.join(","));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  return requestCatalog<TrainingActivity[]>(`${INTERNAL_CATALOG_ROOT}/activities${search.size ? `?${search}` : ""}`, params.signal);
}

export function getActivityCatalogActivity(identifier: string, options?: ActivityCatalogRequestOptions) {
  const search = new URLSearchParams();
  appendOptions(search, options);
  return requestCatalog<TrainingActivity>(
    `${INTERNAL_CATALOG_ROOT}/activities/${encodeURIComponent(identifier)}${search.size ? `?${search}` : ""}`,
    options?.signal
  );
}

export function getActivityCatalogAlternatives(identifier: string, options?: ActivityCatalogAlternativesOptions) {
  const search = new URLSearchParams();
  appendOptions(search, options);
  if (options?.limit !== undefined) search.set("limit", String(options.limit));
  return requestCatalog<ActivityCatalogAlternative[]>(
    `${INTERNAL_CATALOG_ROOT}/activities/${encodeURIComponent(identifier)}/alternatives${search.size ? `?${search}` : ""}`,
    options?.signal
  );
}
