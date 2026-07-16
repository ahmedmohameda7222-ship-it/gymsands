import { NextResponse } from "next/server";
import { CatalogError, asCatalogError } from "@/lib/activity-catalog/errors";
import { CATALOG_LOCALE, CATALOG_SLUG } from "@/lib/activity-catalog/validation";
import type { ActivitySearchParams, CatalogResult } from "@/lib/activity-catalog/types";
import { requireEligibleUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import {
  CATALOG_REQUEST_GROUP_ID_HEADER,
  REQUEST_ID_HEADER,
  resolveOperationalCorrelationId
} from "@/lib/observability/correlation-id";
import { logOperationalEvent, type OperationalLog } from "@/lib/observability/structured-log";
import { createActivityCatalogExecutionObserver } from "@/services/activity-catalog/server/observability";
import { createActivityCatalogProvider } from "@/services/activity-catalog/server/selector";
import type { ActivityCatalogProvider } from "@/services/activity-catalog/server/provider";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization"
};

const RESPONSE_TELEMETRY = Symbol("activityCatalogResponseTelemetry");

type CatalogResponseTelemetry = {
  responseBytes: number;
  resultCount: number;
};

type CatalogResponse = NextResponse & {
  [RESPONSE_TELEMETRY]?: CatalogResponseTelemetry;
};

type CatalogRouteSpec = {
  endpoint: string;
  operation: string;
  pageDefaults?: { limit: number; offset: number };
  filterKeys?: readonly string[];
};

const ROUTE_SPECS: Record<string, CatalogRouteSpec> = {
  "activity-catalog-sports": {
    endpoint: "/api/activity-catalog/sports",
    operation: "list_sports"
  },
  "activity-catalog-session-template": {
    endpoint: "/api/activity-catalog/sports/[sportSlug]/session-template",
    operation: "get_sport_session_template"
  },
  "activity-catalog-filters": {
    endpoint: "/api/activity-catalog/filters",
    operation: "get_filters",
    filterKeys: ["sport"]
  },
  "activity-catalog-activities": {
    endpoint: "/api/activity-catalog/activities",
    operation: "list_activities",
    pageDefaults: { limit: 30, offset: 0 },
    filterKeys: [
      "sport", "sessionType", "phase", "activityType", "difficulty", "equipment", "goal",
      "activityTypes", "difficulties", "primaryMuscles", "secondaryMuscles",
      "muscleCategories", "movementPatterns", "forceTypes"
    ]
  },
  "activity-catalog-activity": {
    endpoint: "/api/activity-catalog/activities/[identifier]",
    operation: "get_activity"
  },
  "activity-catalog-alternatives": {
    endpoint: "/api/activity-catalog/activities/[identifier]/alternatives",
    operation: "get_alternatives"
  }
};

export async function withCatalogRoute(
  request: Request,
  namespace: string,
  handler: (getProvider: () => ActivityCatalogProvider) => Promise<NextResponse>
) {
  const startedAt = performance.now();
  const requestId = resolveOperationalCorrelationId(request.headers.get(REQUEST_ID_HEADER));
  const catalogRequestGroupId = resolveOperationalCorrelationId(request.headers.get(CATALOG_REQUEST_GROUP_ID_HEADER));
  const observer = createActivityCatalogExecutionObserver();
  const spec = ROUTE_SPECS[namespace] ?? { endpoint: "/api/activity-catalog", operation: "unknown" };
  const requestShape = catalogRequestShape(request, spec);

  try {
    const limited = rateLimit(request, namespace, 30, 60_000);
    if (limited) {
      return finalizeCatalogResponse(limited, {
        requestId,
        catalogRequestGroupId,
        spec,
        requestShape,
        observer,
        startedAt
      });
    }

    const context = await requireEligibleUser(request);
    if (context instanceof NextResponse) {
      return finalizeCatalogResponse(context, {
        requestId,
        catalogRequestGroupId,
        spec,
        requestShape,
        observer,
        startedAt
      });
    }

    let response: NextResponse;
    try {
      let provider: ActivityCatalogProvider | null = null;
      response = await handler(() => {
        provider ??= createActivityCatalogProvider(context.supabase, { observer });
        return provider;
      });
    } catch (error) {
      const safe = asCatalogError(error);
      response = catalogJsonResponse(
        { error: safe.message, code: safe.code },
        { status: safe.status, headers: PRIVATE_HEADERS },
        0
      );
    }

    return finalizeCatalogResponse(response, {
      requestId,
      catalogRequestGroupId,
      spec,
      requestShape,
      observer,
      startedAt
    });
  } catch (error) {
    const safe = asCatalogError(error);
    logOperationalEvent({
      event: "activity_catalog_request_completed",
      level: "error",
      request_id: requestId,
      catalog_request_group_id: catalogRequestGroupId,
      endpoint: spec.endpoint,
      operation: spec.operation,
      provider_requested: observer.metadata.providerRequested,
      provider_used: observer.metadata.providerUsed,
      fallback_occurred: observer.metadata.fallbackOccurred,
      fallback_reason: observer.metadata.fallbackReason,
      fallback_stage: observer.metadata.fallbackStage,
      outcome: "failed_closed",
      http_status: 500,
      provider_duration_ms: observer.metadata.providerDurationMs,
      total_duration_ms: roundedDuration(performance.now() - startedAt),
      result_count: 0,
      ...requestShape,
      response_bytes: 0,
      cache_status: "bypass",
      error_code: safe.code
    });
    throw error;
  }
}

export function catalogResponse<T>(result: CatalogResult<T>) {
  return catalogJsonResponse(
    { data: result.data, meta: result.meta },
    { headers: PRIVATE_HEADERS },
    catalogResultCount(result.data)
  );
}

export function catalogSearchResponse(result: Awaited<ReturnType<ActivityCatalogProvider["searchActivities"]>>) {
  return catalogJsonResponse(
    { data: result.data.activities, pagination: result.data.pagination, meta: result.meta },
    { headers: PRIVATE_HEADERS },
    result.data.activities.length
  );
}

async function finalizeCatalogResponse(response: NextResponse, context: {
  requestId: string;
  catalogRequestGroupId: string;
  spec: CatalogRouteSpec;
  requestShape: Partial<Pick<OperationalLog, "page" | "limit" | "has_search" | "filter_count">>;
  observer: ReturnType<typeof createActivityCatalogExecutionObserver>;
  startedAt: number;
}) {
  const finalResponse = withPrivateHeaders(response);
  finalResponse.headers.set(REQUEST_ID_HEADER, context.requestId);
  finalResponse.headers.set(CATALOG_REQUEST_GROUP_ID_HEADER, context.catalogRequestGroupId);

  const telemetry = (finalResponse as CatalogResponse)[RESPONSE_TELEMETRY];
  const responseBytes = telemetry?.responseBytes ?? await responseSize(finalResponse);
  const status = finalResponse.status;
  const fallback = context.observer.metadata.fallbackOccurred;
  const outcome: NonNullable<OperationalLog["outcome"]> = status >= 200 && status < 300
    ? (fallback ? "success_with_fallback" : "success")
    : status === 400
      ? "invalid_request"
      : context.observer.metadata.errorCode || status >= 500
        ? "failed_closed"
        : "rejected";
  const level: OperationalLog["level"] = status >= 500 ? "error" : fallback ? "warn" : "info";

  logOperationalEvent({
    event: "activity_catalog_request_completed",
    level,
    request_id: context.requestId,
    catalog_request_group_id: context.catalogRequestGroupId,
    endpoint: context.spec.endpoint,
    operation: context.spec.operation,
    provider_requested: context.observer.metadata.providerRequested,
    provider_used: context.observer.metadata.providerUsed,
    fallback_occurred: fallback,
    fallback_reason: context.observer.metadata.fallbackReason,
    fallback_stage: context.observer.metadata.fallbackStage,
    outcome,
    http_status: status,
    provider_duration_ms: context.observer.metadata.providerDurationMs,
    total_duration_ms: roundedDuration(performance.now() - context.startedAt),
    result_count: telemetry?.resultCount ?? 0,
    ...context.requestShape,
    response_bytes: responseBytes,
    cache_status: "bypass",
    error_code: context.observer.metadata.errorCode
  });

  return finalResponse;
}

function catalogJsonResponse(body: unknown, init: ResponseInit = {}, resultCount = 0) {
  const serialized = JSON.stringify(body);
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const response = new NextResponse(serialized, { ...init, headers }) as CatalogResponse;
  response[RESPONSE_TELEMETRY] = {
    responseBytes: new TextEncoder().encode(serialized).byteLength,
    resultCount
  };
  return response;
}

function catalogResultCount(data: unknown) {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return 0;
  const record = data as Record<string, unknown>;
  const values = Object.values(record);
  if (values.length && values.every(Array.isArray)) {
    return values.reduce((sum, value) => sum + (value as unknown[]).length, 0);
  }
  if ("sport" in record && Array.isArray(record.sessionTypes) && Array.isArray(record.sessionPhases)) {
    return 1 + record.sessionTypes.length + record.sessionPhases.length;
  }
  return 1;
}

function catalogRequestShape(request: Request, spec: CatalogRouteSpec) {
  const searchParams = new URL(request.url).searchParams;
  const hasSearch = spec.operation === "list_activities" && Boolean(searchParams.get("query")?.trim());
  const filterCount = (spec.filterKeys ?? []).reduce((count, key) => count + (searchParams.get(key)?.trim() ? 1 : 0), 0);
  if (!spec.pageDefaults) return { has_search: hasSearch, filter_count: filterCount };
  const limit = normalizedInteger(searchParams.get("limit"), spec.pageDefaults.limit, 1, 100);
  const offset = normalizedInteger(searchParams.get("offset"), spec.pageDefaults.offset, 0, 10_000);
  return {
    page: Math.floor(offset / limit) + 1,
    limit,
    has_search: hasSearch,
    filter_count: filterCount
  };
}

function normalizedInteger(raw: string | null, fallback: number, minimum: number, maximum: number) {
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}

function roundedDuration(durationMs: number) {
  return Math.max(0, Math.round(durationMs));
}

async function responseSize(response: Response) {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > 0) return Math.round(declared);
  try {
    return (await response.clone().arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

function withPrivateHeaders<T extends NextResponse>(response: T) {
  Object.entries(PRIVATE_HEADERS).forEach(([key, value]) => response.headers.set(key, value));
  return response;
}

function validateAllowed(searchParams: URLSearchParams, allowed: readonly string[]) {
  const allowedSet = new Set(allowed);
  for (const key of searchParams.keys()) {
    if (!allowedSet.has(key) || searchParams.getAll(key).length !== 1) throw new CatalogError("catalog_bad_request");
  }
}

function optionalLocale(searchParams: URLSearchParams) {
  const value = searchParams.get("locale")?.trim();
  if (!value) return undefined;
  if (!CATALOG_LOCALE.test(value)) throw new CatalogError("catalog_bad_request");
  return value;
}

function optionalSlug(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key)?.trim();
  if (!value) return undefined;
  if (value.length > 100 || !CATALOG_SLUG.test(value)) throw new CatalogError("catalog_bad_request");
  return value;
}

function optionalSlugList(searchParams: URLSearchParams, key: string) {
  const raw = searchParams.get(key)?.trim();
  if (!raw) return undefined;
  const values = raw.split(",").map((value) => value.trim());
  if (
    values.length > 20 || values.some((value) => !value || value.length > 100 || !CATALOG_SLUG.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new CatalogError("catalog_bad_request");
  }
  return values;
}

function boundedInteger(searchParams: URLSearchParams, key: string, fallback: number, minimum: number, maximum: number) {
  const raw = searchParams.get(key);
  if (raw === null || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new CatalogError("catalog_bad_request");
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw new CatalogError("catalog_bad_request");
  return value;
}

export function validateIdentifier(value: string) {
  const identifier = value.trim();
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(identifier)) throw new CatalogError("catalog_bad_request");
  return identifier;
}

export function validateCatalogSlug(value: string) {
  const slug = value.trim();
  if (slug.length > 100 || !CATALOG_SLUG.test(slug)) throw new CatalogError("catalog_bad_request");
  return slug;
}

export function parseCatalogOptions(request: Request, allowed: readonly string[]) {
  const searchParams = new URL(request.url).searchParams;
  validateAllowed(searchParams, allowed);
  return { searchParams, locale: optionalLocale(searchParams) };
}

export function parseActivitySearch(request: Request): ActivitySearchParams {
  const allowed = [
    "query", "sport", "sessionType", "phase", "activityType", "difficulty", "equipment", "goal", "limit", "offset", "locale",
    "activityTypes", "difficulties", "primaryMuscles", "secondaryMuscles", "muscleCategories", "movementPatterns", "forceTypes"
  ];
  const { searchParams, locale } = parseCatalogOptions(request, allowed);
  const query = searchParams.get("query")?.trim();
  if (query && query.length > 100) throw new CatalogError("catalog_bad_request");
  const difficulty = searchParams.get("difficulty")?.trim();
  if (difficulty && !["beginner", "intermediate", "advanced"].includes(difficulty)) throw new CatalogError("catalog_bad_request");
  const equipment = optionalSlugList(searchParams, "equipment");
  const activityTypes = optionalSlugList(searchParams, "activityTypes");
  const difficulties = optionalSlugList(searchParams, "difficulties");
  const primaryMuscles = optionalSlugList(searchParams, "primaryMuscles");
  const secondaryMuscles = optionalSlugList(searchParams, "secondaryMuscles");
  const muscleCategories = optionalSlugList(searchParams, "muscleCategories");
  const movementPatterns = optionalSlugList(searchParams, "movementPatterns");
  const forceTypes = optionalSlugList(searchParams, "forceTypes");
  return {
    ...(query ? { query } : {}),
    ...(optionalSlug(searchParams, "sport") ? { sport: optionalSlug(searchParams, "sport") } : {}),
    ...(optionalSlug(searchParams, "sessionType") ? { sessionType: optionalSlug(searchParams, "sessionType") } : {}),
    ...(optionalSlug(searchParams, "phase") ? { phase: optionalSlug(searchParams, "phase") } : {}),
    ...(optionalSlug(searchParams, "activityType") ? { activityType: optionalSlug(searchParams, "activityType") } : {}),
    ...(difficulty ? { difficulty: difficulty as ActivitySearchParams["difficulty"] } : {}),
    ...(equipment?.length ? { equipment } : {}),
    ...(optionalSlug(searchParams, "goal") ? { goal: optionalSlug(searchParams, "goal") } : {}),
    ...(activityTypes?.length ? { activityTypes } : {}),
    ...(difficulties?.length ? { difficulties } : {}),
    ...(primaryMuscles?.length ? { primaryMuscles } : {}),
    ...(secondaryMuscles?.length ? { secondaryMuscles } : {}),
    ...(muscleCategories?.length ? { muscleCategories } : {}),
    ...(movementPatterns?.length ? { movementPatterns } : {}),
    ...(forceTypes?.length ? { forceTypes } : {}),
    limit: boundedInteger(searchParams, "limit", 30, 1, 100),
    offset: boundedInteger(searchParams, "offset", 0, 0, 10_000),
    ...(locale ? { locale } : {})
  };
}

export function parseAlternativeOptions(request: Request) {
  const { searchParams, locale } = parseCatalogOptions(request, ["limit", "locale"]);
  return { limit: boundedInteger(searchParams, "limit", 4, 1, 20), ...(locale ? { locale } : {}) };
}
