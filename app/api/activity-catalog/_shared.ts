import { NextResponse } from "next/server";
import { CatalogError, asCatalogError } from "@/lib/activity-catalog/errors";
import { CATALOG_LOCALE, CATALOG_SLUG } from "@/lib/activity-catalog/validation";
import type { ActivitySearchParams, CatalogResult } from "@/lib/activity-catalog/types";
import { requireEligibleUser } from "@/lib/integrations/env";
import { rateLimit } from "@/lib/integrations/rate-limit";
import { createActivityCatalogProvider } from "@/services/activity-catalog/server/selector";
import type { ActivityCatalogProvider } from "@/services/activity-catalog/server/provider";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  Vary: "Authorization"
};

export async function withCatalogRoute(
  request: Request,
  namespace: string,
  handler: (getProvider: () => ActivityCatalogProvider) => Promise<NextResponse>
) {
  const limited = rateLimit(request, namespace, 30, 60_000);
  if (limited) return withPrivateHeaders(limited);
  const context = await requireEligibleUser(request);
  if (context instanceof NextResponse) return withPrivateHeaders(context);
  try {
    let provider: ActivityCatalogProvider | null = null;
    return withPrivateHeaders(await handler(() => {
      provider ??= createActivityCatalogProvider(context.supabase);
      return provider;
    }));
  } catch (error) {
    const safe = asCatalogError(error);
    return NextResponse.json({ error: safe.message, code: safe.code }, { status: safe.status, headers: PRIVATE_HEADERS });
  }
}

export function catalogResponse<T>(result: CatalogResult<T>) {
  return NextResponse.json({ data: result.data, meta: result.meta }, { headers: PRIVATE_HEADERS });
}

export function catalogSearchResponse(result: Awaited<ReturnType<ActivityCatalogProvider["searchActivities"]>>) {
  return NextResponse.json({ data: result.data.activities, pagination: result.data.pagination, meta: result.meta }, { headers: PRIVATE_HEADERS });
}

function withPrivateHeaders(response: NextResponse) {
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
  const allowed = ["query", "sport", "sessionType", "phase", "activityType", "difficulty", "equipment", "goal", "limit", "offset", "locale"];
  const { searchParams, locale } = parseCatalogOptions(request, allowed);
  const query = searchParams.get("query")?.trim();
  if (query && query.length > 100) throw new CatalogError("catalog_bad_request");
  const difficulty = searchParams.get("difficulty")?.trim();
  if (difficulty && !["beginner", "intermediate", "advanced"].includes(difficulty)) throw new CatalogError("catalog_bad_request");
  const rawEquipment = searchParams.get("equipment")?.trim();
  const equipment = rawEquipment ? rawEquipment.split(",").map((item) => item.trim()) : undefined;
  if (equipment && (equipment.length > 20 || equipment.some((item) => item.length > 100 || !CATALOG_SLUG.test(item)))) throw new CatalogError("catalog_bad_request");
  return {
    ...(query ? { query } : {}),
    ...(optionalSlug(searchParams, "sport") ? { sport: optionalSlug(searchParams, "sport") } : {}),
    ...(optionalSlug(searchParams, "sessionType") ? { sessionType: optionalSlug(searchParams, "sessionType") } : {}),
    ...(optionalSlug(searchParams, "phase") ? { phase: optionalSlug(searchParams, "phase") } : {}),
    ...(optionalSlug(searchParams, "activityType") ? { activityType: optionalSlug(searchParams, "activityType") } : {}),
    ...(difficulty ? { difficulty: difficulty as ActivitySearchParams["difficulty"] } : {}),
    ...(equipment?.length ? { equipment } : {}),
    ...(optionalSlug(searchParams, "goal") ? { goal: optionalSlug(searchParams, "goal") } : {}),
    limit: boundedInteger(searchParams, "limit", 30, 1, 100),
    offset: boundedInteger(searchParams, "offset", 0, 0, 10_000),
    ...(locale ? { locale } : {})
  };
}

export function parseAlternativeOptions(request: Request) {
  const { searchParams, locale } = parseCatalogOptions(request, ["limit", "locale"]);
  return { limit: boundedInteger(searchParams, "limit", 4, 1, 20), ...(locale ? { locale } : {}) };
}
