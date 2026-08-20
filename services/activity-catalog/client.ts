"use client";

import { supabase } from "@/lib/supabase/client";
import { env } from "@/lib/env";
import type { CatalogLocale } from "@/lib/activity-catalog/catalog-locale";
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
import type {
  LibraryActivityDetail,
  LibraryAlternative,
  LibraryDomain,
  LibraryDomainFilters,
  LibraryProviderMeta,
  LibrarySearchParams,
  LibrarySearchResult
} from "@/lib/activity-catalog/library-types";

type SearchResponse = {
  data: TrainingActivity[];
  pagination: OffsetPagination;
  meta: CatalogResult<unknown>["meta"];
};

type LibraryEnvelope<T> = { data: T; meta: LibraryProviderMeta };
type LibrarySearchEnvelope = LibrarySearchResult;

export type CatalogClientRequestOptions = { requestGroupId?: string; signal?: AbortSignal };
type CatalogClientRequestContext = string | CatalogClientRequestOptions | undefined;

export class CatalogClientError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = "CatalogClientError";
  }
}

export function createCatalogRequestGroupId() { return createOperationalCorrelationId(); }

function normalizeRequestOptions(context?: CatalogClientRequestContext): CatalogClientRequestOptions {
  return typeof context === "string" ? { requestGroupId: context } : (context ?? {});
}

function resolveCatalogRequestGroupId(value?: string) {
  return isValidOperationalCorrelationId(value) ? value!.trim() : createCatalogRequestGroupId();
}

async function catalogRequest<T>(path: string, context?: CatalogClientRequestContext): Promise<T> {
  const options = normalizeRequestOptions(context);
  const session = supabase ? await supabase.auth.getSession() : null;
  const accessToken = session?.data.session?.access_token || (env.useMockAuth ? "plaivra-local-qa" : "");
  if (!accessToken) throw new CatalogClientError(401, "session_expired", "Your session expired. Please sign in again.");
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
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    throw new CatalogClientError(
      response.status,
      typeof payload.code === "string" ? payload.code : "catalog_request_failed",
      typeof payload.error === "string" ? payload.error : "The exercise catalog could not load."
    );
  }
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

export function listLibraryDomains(locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryDomain[]>>(`/api/activity-catalog/library-domains${queryString({ locale })}`, context);
}

/** One semantic Library V2 detail request; no client-side domain discovery. */
export function getLibraryActivity(identifier: string, locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryActivityDetail>>(`/api/activity-catalog/library-activities/${encodeURIComponent(identifier)}${queryString({ locale })}`, context);
}

export function getLibraryDomain(domain: string, locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryDomain>>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}${queryString({ locale })}`, context);
}

export function getLibraryDomainFilters(domain: string, locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryDomainFilters>>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}/filters${queryString({ locale })}`, context);
}

export function getLibraryDomainArchetypes(domain: string, locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<unknown[]>>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}/archetypes${queryString({ locale })}`, context);
}

export function searchLibraryDomainActivities(params: LibrarySearchParams, context?: CatalogClientRequestContext) {
  const { domain, ...query } = params;
  return catalogRequest<LibrarySearchEnvelope>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}/activities${queryString(query)}`, context);
}

export function getLibraryDomainActivity(domain: string, identifier: string, locale?: CatalogLocale, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryActivityDetail>>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}${queryString({ locale })}`, context);
}

export function getLibraryDomainActivityAlternatives(domain: string, identifier: string, options: { limit?: number; locale?: CatalogLocale } = {}, context?: CatalogClientRequestContext) {
  return catalogRequest<LibraryEnvelope<LibraryAlternative[]>>(`/api/activity-catalog/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}/alternatives${queryString(options)}`, context);
}