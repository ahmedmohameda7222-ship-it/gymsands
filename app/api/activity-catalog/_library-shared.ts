import { NextResponse } from "next/server";
import { CATALOG_LOCALES, type CatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import { requireEligibleUser, serverEnv } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { CATALOG_REQUEST_GROUP_ID_HEADER, REQUEST_ID_HEADER, resolveOperationalCorrelationId } from "@/lib/observability/correlation-id";
import { logOperationalEvent } from "@/lib/observability/structured-log";
import type { LibraryProviderMeta } from "@/lib/activity-catalog/library-types";
import { asLibraryProviderError } from "@/services/activity-catalog/server/library-errors";
import { createLibraryActivityProvider } from "@/services/activity-catalog/server/library-selector";
import { parseCatalogProviderMode } from "@/services/activity-catalog/server/selector";
import type { LibraryActivityProvider } from "@/services/activity-catalog/server/library-provider";

export const PRIVATE_LIBRARY_HEADERS = { "Cache-Control": "private, no-store, max-age=0", Pragma: "no-cache", Vary: "Authorization" };
export const LIBRARY_LOCALES = new Set<CatalogLocale>(CATALOG_LOCALES);
export const LIBRARY_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function libraryJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: PRIVATE_LIBRARY_HEADERS });
}

export function parseLocale(url: URL): CatalogLocale | null {
  const locale = (url.searchParams.get("locale") || "en").toLowerCase();
  return LIBRARY_LOCALES.has(locale as CatalogLocale) ? locale as CatalogLocale : null;
}

export function validIdentifier(value: string) { return UUID.test(value) || LIBRARY_SLUG.test(value); }

export function rejectUnknown(url: URL, allowed: readonly string[]) {
  const allow = new Set(allowed);
  return Array.from(url.searchParams.keys()).find((key) => !allow.has(key)) ?? null;
}

export function parseLimit(url: URL, maximum: number, fallback: number) {
  const raw = url.searchParams.get("limit");
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= maximum ? value : null;
}

export async function withLibraryRoute(
  request: Request,
  namespace: string,
  handler: (provider: LibraryActivityProvider) => Promise<{ body: unknown; meta?: LibraryProviderMeta; count?: number; restarted?: boolean }>
) {
  const startedAt = performance.now();
  const requestId = resolveOperationalCorrelationId(request.headers.get(REQUEST_ID_HEADER));
  const requestGroupId = resolveOperationalCorrelationId(request.headers.get(CATALOG_REQUEST_GROUP_ID_HEADER));
  let mode: ReturnType<typeof parseCatalogProviderMode> | undefined;
  try {
    const limited = rateLimit(request, namespace, 30, 60_000);
    if (limited) return limited;
    const context = await requireEligibleUser(request);
    if (context instanceof NextResponse) return context;
    mode = parseCatalogProviderMode(serverEnv.plaivraActivityCatalogMode);
    const provider = createLibraryActivityProvider(context.supabase, mode);
    const result = await handler(provider);
    logOperationalEvent({
      event: "activity_catalog_library_request_completed",
      level: result.meta?.degraded ? "warn" : "info",
      request_id: requestId,
      catalog_request_group_id: requestGroupId,
      operation: namespace,
      outcome: result.meta?.degraded ? "success_with_fallback" : "success",
      provider_requested: mode,
      provider_used: result.meta?.source ?? "none",
      fallback_occurred: Boolean(result.meta?.degraded),
      total_duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      result_count: result.count ?? 1,
      cache_status: "bypass",
      library_release_version: result.meta?.libraryRelease?.version,
      catalog_release_version: result.meta?.catalogRelease?.version,
      cursor_restarted: Boolean(result.restarted)
    });
    const response = libraryJson(result.body);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    response.headers.set(CATALOG_REQUEST_GROUP_ID_HEADER, requestGroupId);
    return response;
  } catch (error) {
    const safe = asLibraryProviderError(error);
    logOperationalEvent({
      event: "activity_catalog_library_request_completed",
      level: safe.status >= 500 ? "error" : "warn",
      request_id: requestId,
      catalog_request_group_id: requestGroupId,
      operation: namespace,
      outcome: safe.status === 400 || safe.status === 409 ? "invalid_request" : "failed_closed",
      provider_requested: mode,
      provider_used: "none",
      fallback_occurred: false,
      total_duration_ms: Math.max(0, Math.round(performance.now() - startedAt)),
      result_count: 0,
      cache_status: "bypass",
      error_code: safe.upstreamCode ?? safe.code
    });
    const response = libraryJson({ error: safe.message, code: safe.upstreamCode ?? safe.code }, safe.status);
    response.headers.set(REQUEST_ID_HEADER, requestId);
    response.headers.set(CATALOG_REQUEST_GROUP_ID_HEADER, requestGroupId);
    return response;
  }
}
