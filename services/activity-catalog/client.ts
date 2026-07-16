"use client";

import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import {
  CATALOG_REQUEST_GROUP_ID_HEADER,
  createOperationalCorrelationId,
  isValidOperationalCorrelationId
} from "@/lib/observability/correlation-id";
import type {
  ActivityAlternative,
  ActivityCatalogFilters,
  ActivitySearchParams,
  CatalogResult,
  OffsetPagination,
  TrainingActivity
} from "@/lib/activity-catalog/types";

type SearchResponse = {
  data: TrainingActivity[];
  pagination: OffsetPagination;
  meta: CatalogResult<unknown>["meta"];
};

export type CatalogClientRequestOptions = {
  requestGroupId?: string;
  signal?: AbortSignal;
};

type CatalogClientRequestContext = string | CatalogClientRequestOptions | undefined;

export function createCatalogRequestGroupId() {
  return createOperationalCorrelationId();
}

function normalizeRequestOptions(context?: CatalogClientRequestContext): CatalogClientRequestOptions {
  return typeof context === "string" ? { requestGroupId: context } : (context ?? {});
}

function resolveCatalogRequestGroupId(value?: string) {
  return isValidOperationalCorrelationId(value) ? value!.trim() : createCatalogRequestGroupId();
}

async function catalogRequest<T>(path: string, context?: CatalogClientRequestContext): Promise<T> {
  const options = normalizeRequestOptions(context);
  const session = supabase ? await supabase.auth.getSession() : null;
  // The non-production mock-auth fixture uses an inert marker so rendered QA
  // can intercept the internal request without creating a real Supabase token.
  // The server never accepts this marker; production rejects mock auth entirely.
  const accessToken = session?.data.session?.access_token || (env.useMockAuth ? "plaivra-local-qa" : "");
  if (!accessToken) throw new Error("Your session expired. Please sign in again.");
  const response = await fetch(path, {
    method: "GET",
    cache: "no-store",
    credentials: "same-origin",
    signal: options.signal,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      [CATALOG_REQUEST_GROUP_ID_HEADER]: resolveCatalogRequestGroupId(options.requestGroupId)
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "The exercise catalog could not load.");
  return payload as T;
}

function queryString(values: Record<string, string | number | string[] | undefined>) {
  const query = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) return;
    query.set(key, Array.isArray(value) ? value.join(",") : String(value));
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export function getCatalogFilters(options: { sport?: string; locale?: string } = {}, context?: CatalogClientRequestContext) {
  return catalogRequest<CatalogResult<ActivityCatalogFilters>>(`/api/activity-catalog/filters${queryString(options)}`, context);
}

export function searchCatalogActivities(params: ActivitySearchParams, context?: CatalogClientRequestContext) {
  return catalogRequest<SearchResponse>(`/api/activity-catalog/activities${queryString(params)}`, context);
}

export function getCatalogActivity(identifier: string, locale?: string, context?: CatalogClientRequestContext) {
  return catalogRequest<CatalogResult<TrainingActivity>>(`/api/activity-catalog/activities/${encodeURIComponent(identifier)}${queryString({ locale })}`, context);
}

export function getCatalogActivityAlternatives(identifier: string, options: { limit?: number; locale?: string } = {}, context?: CatalogClientRequestContext) {
  return catalogRequest<CatalogResult<ActivityAlternative[]>>(`/api/activity-catalog/activities/${encodeURIComponent(identifier)}/alternatives${queryString(options)}`, context);
}
