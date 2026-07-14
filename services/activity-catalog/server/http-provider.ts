import "server-only";

import { ActivityCatalogError, safeActivityCatalogError } from "@/lib/activity-catalog/errors";
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
import {
  normalizeActivityCatalogBaseUrl,
  parseActivityResponse,
  parseActivitySearchResponse,
  parseAlternativesResponse,
  parseFiltersResponse,
  parseSportsResponse,
  parseSportSessionTemplateResponse,
  safeUpstreamRequestId,
  validateActivityCatalogLocale,
  validateActivityCatalogSearchParams,
  validateActivityCatalogSlug,
  validateActivityIdentifier
} from "@/lib/activity-catalog/validation";
import type { ActivityCatalogProvider } from "./provider";

const defaultTimeoutMs = 8_000;
const defaultMaxResponseBytes = 2_000_000;

type FetchImplementation = typeof fetch;

export type HttpActivityCatalogProviderOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: FetchImplementation;
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowLocalHttp?: boolean;
};

function result<T>(data: T, meta: { apiVersion: string; locale: string; requestId?: string }, pagination?: ActivityCatalogResult<T>["pagination"]): ActivityCatalogResult<T> {
  return {
    data,
    ...(pagination ? { pagination } : {}),
    meta: {
      source: "external",
      degraded: false,
      apiVersion: meta.apiVersion,
      locale: meta.locale,
      ...(meta.requestId ? { requestId: meta.requestId } : {})
    }
  };
}

function mappedHttpError(status: number, requestId?: string) {
  if (status === 400) return new ActivityCatalogError("invalid_request", { requestId });
  if (status === 401) return new ActivityCatalogError("upstream_unauthorized", { requestId });
  if (status === 403) return new ActivityCatalogError("upstream_forbidden", { requestId });
  if (status === 404) return new ActivityCatalogError("not_found", { requestId });
  if (status === 429) return new ActivityCatalogError("rate_limited", { requestId });
  return new ActivityCatalogError("unavailable", { requestId });
}

export class HttpActivityCatalogProvider implements ActivityCatalogProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;

  constructor(options: HttpActivityCatalogProviderOptions) {
    this.baseUrl = normalizeActivityCatalogBaseUrl(options.baseUrl, { allowLocalHttp: options.allowLocalHttp });
    this.apiKey = options.apiKey.trim();
    if (!this.apiKey) throw new ActivityCatalogError("configuration_error");
    this.fetchImplementation = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    this.maxResponseBytes = options.maxResponseBytes ?? defaultMaxResponseBytes;
    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs < 1 || !Number.isFinite(this.maxResponseBytes) || this.maxResponseBytes < 1) {
      throw new ActivityCatalogError("configuration_error");
    }
  }

  private async request(path: string, query: URLSearchParams, signal?: AbortSignal) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const url = new URL(path, `${this.baseUrl}/`);
      url.search = query.toString();
      const response = await this.fetchImplementation(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
        cache: "no-store"
      });
      const requestId = safeUpstreamRequestId(response.headers.get("x-request-id"));
      if (!response.ok) throw mappedHttpError(response.status, requestId);
      const text = await response.text();
      if (text.length > this.maxResponseBytes) throw new ActivityCatalogError("invalid_response", { requestId });
      try {
        return JSON.parse(text) as unknown;
      } catch (error) {
        throw new ActivityCatalogError("invalid_response", { requestId, cause: error });
      }
    } catch (error) {
      if (error instanceof ActivityCatalogError) throw error;
      if (controller.signal.aborted) throw new ActivityCatalogError("timeout", { cause: error });
      throw safeActivityCatalogError(error, "unavailable");
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
    }
  }

  async listSports(options: ActivityCatalogRequestOptions = {}): Promise<ActivityCatalogResult<ActivityCatalogSport[]>> {
    const locale = validateActivityCatalogLocale(options.locale);
    const parsed = parseSportsResponse(await this.request("v1/sports", new URLSearchParams({ locale }), options.signal));
    return result(parsed.data, parsed.meta);
  }

  async getSportSessionTemplate(
    sportSlug: string,
    options: ActivityCatalogRequestOptions = {}
  ): Promise<ActivityCatalogResult<ActivityCatalogSportSessionTemplate>> {
    const slug = validateActivityCatalogSlug(sportSlug, "sport");
    const locale = validateActivityCatalogLocale(options.locale);
    const parsed = parseSportSessionTemplateResponse(
      await this.request(`v1/sports/${encodeURIComponent(slug)}/session-template`, new URLSearchParams({ locale }), options.signal)
    );
    return result(parsed.data, parsed.meta);
  }

  async getFilters(options: ActivityCatalogRequestOptions & { sport?: string } = {}): Promise<ActivityCatalogResult<ActivityCatalogFilterOptions>> {
    const locale = validateActivityCatalogLocale(options.locale);
    const query = new URLSearchParams({ locale });
    if (options.sport) query.set("sport", validateActivityCatalogSlug(options.sport, "sport"));
    const parsed = parseFiltersResponse(await this.request("v1/filters", query, options.signal));
    return result(parsed.data, parsed.meta);
  }

  async searchActivities(params: ActivityCatalogSearchParams): Promise<ActivityCatalogResult<TrainingActivity[]>> {
    const validated = validateActivityCatalogSearchParams(params);
    const query = new URLSearchParams();
    if (validated.query) query.set("query", validated.query);
    if (validated.sport) query.set("sport", validated.sport);
    if (validated.sessionType) query.set("sessionType", validated.sessionType);
    if (validated.phase) query.set("phase", validated.phase);
    if (validated.activityType) query.set("activityType", validated.activityType);
    if (validated.difficulty) query.set("difficulty", validated.difficulty);
    if (validated.equipment?.length) query.set("equipment", validated.equipment.join(","));
    if (validated.goal) query.set("goal", validated.goal);
    query.set("limit", String(validated.limit));
    query.set("offset", String(validated.offset));
    query.set("locale", validated.locale ?? "en");
    const parsed = parseActivitySearchResponse(await this.request("v1/activities", query));
    return result(parsed.data, parsed.meta, parsed.pagination);
  }

  async getActivity(identifier: string, options: ActivityCatalogRequestOptions = {}): Promise<ActivityCatalogResult<TrainingActivity>> {
    const cleanIdentifier = validateActivityIdentifier(identifier);
    const locale = validateActivityCatalogLocale(options.locale);
    const parsed = parseActivityResponse(
      await this.request(`v1/activities/${encodeURIComponent(cleanIdentifier)}`, new URLSearchParams({ locale }), options.signal)
    );
    return result(parsed.data, parsed.meta);
  }

  async getActivityAlternatives(
    identifier: string,
    options: ActivityCatalogAlternativesOptions = {}
  ): Promise<ActivityCatalogResult<ActivityCatalogAlternative[]>> {
    const cleanIdentifier = validateActivityIdentifier(identifier);
    const locale = validateActivityCatalogLocale(options.locale);
    const limit = options.limit ?? 4;
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new ActivityCatalogError("invalid_request");
    const parsed = parseAlternativesResponse(
      await this.request(
        `v1/activities/${encodeURIComponent(cleanIdentifier)}/alternatives`,
        new URLSearchParams({ locale, limit: String(limit) }),
        options.signal
      )
    );
    return result(parsed.data, parsed.meta);
  }
}
