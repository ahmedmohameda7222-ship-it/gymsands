import "server-only";

import { CatalogError } from "@/lib/activity-catalog/errors";
import {
  parseActivityEnvelope,
  parseAlternativesEnvelope,
  parseFiltersEnvelope,
  parseHealth,
  parseSearchEnvelope,
  parseSportsEnvelope,
  parseTemplateEnvelope
} from "@/lib/activity-catalog/validation";
import type {
  ActivitySearchParams,
  CatalogHealth,
  CatalogRequestOptions,
  CatalogResult,
  CatalogSourceMetadata
} from "@/lib/activity-catalog/types";
import type { ActivityCatalogProvider } from "./provider";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type HttpProviderOptions = {
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function externalMeta(locale?: string): CatalogSourceMetadata {
  return { source: "external", degraded: false, catalogVersion: "v1", ...(locale ? { locale } : {}) };
}

function hasUnsupportedCompatibilityFilter(params: ActivitySearchParams) {
  return Boolean(
    params.activityTypes?.length || params.difficulties?.length || params.primaryMuscles?.length ||
    params.secondaryMuscles?.length || params.muscleCategories?.length ||
    params.movementPatterns?.length || params.forceTypes?.length
  );
}

export class HttpActivityCatalogProvider implements ActivityCatalogProvider {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpProviderOptions) {
    if (!options.apiKey.trim()) throw new CatalogError("catalog_not_configured", { failureStage: "provider_request" });
    try {
      const baseUrl = new URL(options.baseUrl);
      const localHttp = baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
      if ((baseUrl.protocol !== "https:" && !localHttp) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
        throw new Error("invalid base url");
      }
      this.baseUrl = baseUrl;
    } catch (error) {
      throw new CatalogError("catalog_not_configured", { cause: error, failureStage: "provider_request" });
    }
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async getHealth(): Promise<CatalogHealth> {
    return parseHealth(await this.request("/v1/health", new URLSearchParams(), false));
  }

  async listSports(options: CatalogRequestOptions = {}) {
    const query = localeQuery(options);
    const payload = parseSportsEnvelope(await this.request("/v1/sports", query));
    return { data: payload.data, meta: externalMeta(payload.meta.locale) };
  }

  async getSportSessionTemplate(sportSlug: string, options: CatalogRequestOptions = {}) {
    const query = localeQuery(options);
    const payload = parseTemplateEnvelope(await this.request(`/v1/sports/${encodeURIComponent(sportSlug)}/session-template`, query));
    return { data: payload.data, meta: externalMeta(payload.meta.locale) };
  }

  async getFilters(options: CatalogRequestOptions & { sport?: string } = {}) {
    const query = localeQuery(options);
    if (options.sport) query.set("sport", options.sport);
    const payload = parseFiltersEnvelope(await this.request("/v1/filters", query));
    return { data: payload.data, meta: externalMeta(payload.meta.locale) };
  }

  async searchActivities(params: ActivitySearchParams) {
    // Compatibility lists are an internal Plaivra legacy extension. The
    // external public API must never receive or silently ignore them.
    if (hasUnsupportedCompatibilityFilter(params)) {
      throw new CatalogError("catalog_bad_request", { failureStage: "provider_request" });
    }
    const query = localeQuery(params);
    for (const key of ["query", "sport", "sessionType", "phase", "activityType", "difficulty", "goal"] as const) {
      if (params[key]) query.set(key, String(params[key]));
    }
    if (params.equipment?.length) query.set("equipment", params.equipment.join(","));
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.offset !== undefined) query.set("offset", String(params.offset));
    const payload = parseSearchEnvelope(await this.request("/v1/activities", query));
    return {
      data: { activities: payload.data, pagination: payload.pagination },
      meta: externalMeta(payload.meta.locale)
    };
  }

  async getActivity(identifier: string, options: CatalogRequestOptions = {}) {
    const query = localeQuery(options);
    const payload = parseActivityEnvelope(await this.request(`/v1/activities/${encodeURIComponent(identifier)}`, query));
    return { data: payload.data, meta: externalMeta(payload.meta.locale) };
  }

  async getActivityAlternatives(identifier: string, options: CatalogRequestOptions & { limit?: number } = {}) {
    const query = localeQuery(options);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    const payload = parseAlternativesEnvelope(await this.request(`/v1/activities/${encodeURIComponent(identifier)}/alternatives`, query));
    return { data: payload.data, meta: externalMeta(payload.meta.locale) };
  }

  private async request(path: string, query: URLSearchParams, authenticated = true): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    url.search = query.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(authenticated ? { Authorization: `Bearer ${this.apiKey}` } : {})
        }
      });
      if (!response.ok) throw statusError(response.status);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RESPONSE_BYTES) {
        throw new CatalogError("catalog_invalid_response", { failureStage: "response_validation" });
      }
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) {
        throw new CatalogError("catalog_invalid_response", { failureStage: "response_validation" });
      }
      try {
        return JSON.parse(body);
      } catch (error) {
        throw new CatalogError("catalog_invalid_response", { cause: error, failureStage: "response_parse" });
      }
    } catch (error) {
      if (error instanceof CatalogError) throw error;
      if (controller.signal.aborted) {
        throw new CatalogError("catalog_timeout", { allowLegacyFallback: true, cause: error, failureStage: "provider_request" });
      }
      throw new CatalogError("catalog_network_error", { allowLegacyFallback: true, cause: error, failureStage: "provider_request" });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function localeQuery(options: CatalogRequestOptions) {
  const query = new URLSearchParams();
  if (options.locale) query.set("locale", options.locale);
  return query;
}

function statusError(status: number) {
  const options = { failureStage: "response_status" as const };
  if (status === 401) return new CatalogError("catalog_unauthorized", options);
  if (status === 403) return new CatalogError("catalog_forbidden", options);
  if (status === 404) return new CatalogError("catalog_not_found", { ...options, allowLegacyFallback: true });
  if (status === 429) return new CatalogError("catalog_rate_limited", { ...options, allowLegacyFallback: true });
  if (status >= 500) return new CatalogError("catalog_upstream_error", { ...options, allowLegacyFallback: true });
  return new CatalogError("catalog_bad_request", options);
}
