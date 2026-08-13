import "server-only";

import type {
  LibraryActivityDetail,
  LibraryAlternative,
  LibraryDomain,
  LibraryProviderMeta,
  LibraryResponseMeta,
  LibrarySearchParams
} from "@/lib/activity-catalog/library-types";
import { LibraryProviderError } from "./library-errors";
import type { LibraryActivityProvider, LibraryRequestOptions } from "./library-provider";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

type HttpLibraryProviderOptions = { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch };

type V2Envelope<T> = { data: T; meta: LibraryResponseMeta; pagination?: { limit: number; returned: number; nextCursor: string | null } };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseEnvelope<T>(value: unknown, requirePagination = false): V2Envelope<T> {
  if (!isRecord(value) || !("data" in value) || !isRecord(value.meta)) {
    throw new LibraryProviderError("catalog_invalid_response");
  }
  const meta = value.meta as Record<string, unknown>;
  if (meta.apiVersion !== "v2" || typeof meta.locale !== "string" || !isRecord(meta.libraryRelease) || !isRecord(meta.catalogRelease)) {
    throw new LibraryProviderError("catalog_invalid_response");
  }
  const libraryRelease = meta.libraryRelease as Record<string, unknown>;
  const catalogRelease = meta.catalogRelease as Record<string, unknown>;
  for (const key of ["id", "version", "checksum"] as const) {
    if (typeof libraryRelease[key] !== "string" || typeof catalogRelease[key] !== "string") throw new LibraryProviderError("catalog_invalid_response");
  }
  if (typeof libraryRelease.publishedAt !== "string" || typeof libraryRelease.strengthSemanticFingerprint !== "string") {
    throw new LibraryProviderError("catalog_invalid_response");
  }
  let pagination: V2Envelope<T>["pagination"];
  if (requirePagination) {
    if (!isRecord(value.pagination)) throw new LibraryProviderError("catalog_invalid_response");
    const page = value.pagination as Record<string, unknown>;
    if (!Number.isInteger(page.limit) || !Number.isInteger(page.returned) || !(page.nextCursor === null || typeof page.nextCursor === "string")) {
      throw new LibraryProviderError("catalog_invalid_response");
    }
    pagination = page as V2Envelope<T>["pagination"];
  }
  return { data: value.data as T, meta: meta as unknown as LibraryResponseMeta, ...(pagination ? { pagination } : {}) };
}

function providerMeta(meta: LibraryResponseMeta): LibraryProviderMeta {
  return { ...meta, source: "library_v2", degraded: false };
}

export class HttpLibraryActivityProvider implements LibraryActivityProvider {
  private readonly baseUrl: URL;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpLibraryProviderOptions) {
    if (!options.apiKey.trim()) throw new LibraryProviderError("catalog_not_configured");
    try {
      const baseUrl = new URL(options.baseUrl);
      const localHttp = baseUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseUrl.hostname);
      if ((baseUrl.protocol !== "https:" && !localHttp) || baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) throw new Error("invalid base url");
      this.baseUrl = baseUrl;
    } catch (error) {
      throw new LibraryProviderError("catalog_not_configured", { cause: error });
    }
    this.apiKey = options.apiKey;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async listDomains(options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<LibraryDomain[]>(await this.request("/v2/library-domains", localeQuery(options)));
    if (!Array.isArray(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  async getDomain(domain: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<LibraryDomain>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}`, localeQuery(options)));
    if (!isRecord(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  async getFilters(domain: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<unknown[]>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/filters`, localeQuery(options)));
    if (!Array.isArray(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  async getArchetypes(domain: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<unknown[]>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/archetypes`, localeQuery(options)));
    if (!Array.isArray(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  async searchActivities(params: LibrarySearchParams) {
    const query = localeQuery(params);
    if (params.query) query.set("query", params.query);
    if (params.visibility) query.set("visibility", params.visibility);
    if (params.limit !== undefined) query.set("limit", String(params.limit));
    if (params.cursor) query.set("cursor", params.cursor);
    const payload = parseEnvelope<unknown[]>(await this.request(`/v2/library-domains/${encodeURIComponent(params.domain)}/activities`, query), true);
    if (!Array.isArray(payload.data) || !payload.pagination) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data as any, pagination: payload.pagination, meta: providerMeta(payload.meta) };
  }

  async getActivity(domain: string, identifier: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<LibraryActivityDetail>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}`, localeQuery(options)));
    if (!isRecord(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  async getActivityAlternatives(domain: string, identifier: string, options: LibraryRequestOptions & { limit?: number } = {}) {
    const query = localeQuery(options);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    const payload = parseEnvelope<LibraryAlternative[]>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}/alternatives`, query));
    if (!Array.isArray(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    return { data: payload.data, meta: providerMeta(payload.meta) };
  }

  private async request(path: string, query: URLSearchParams): Promise<unknown> {
    const url = new URL(path, this.baseUrl);
    url.search = query.toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
        headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` }
      });
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (declaredLength > MAX_RESPONSE_BYTES) throw new LibraryProviderError("catalog_invalid_response");
      const body = await response.text();
      if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) throw new LibraryProviderError("catalog_invalid_response");
      let payload: unknown = null;
      try { payload = body ? JSON.parse(body) : null; } catch (error) { throw new LibraryProviderError("catalog_invalid_response", { cause: error }); }
      if (!response.ok) throw statusError(response.status, payload);
      return payload;
    } catch (error) {
      if (error instanceof LibraryProviderError) throw error;
      if (controller.signal.aborted) throw new LibraryProviderError("catalog_timeout", { allowLegacyFallback: true, cause: error });
      throw new LibraryProviderError("catalog_network_error", { allowLegacyFallback: true, cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }
}

function localeQuery(options: LibraryRequestOptions) {
  const query = new URLSearchParams();
  if (options.locale) query.set("locale", options.locale);
  return query;
}

function upstreamCode(payload: unknown) {
  return isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string" ? payload.error.code : undefined;
}

function statusError(status: number, payload: unknown) {
  const code = upstreamCode(payload);
  if (status === 401) return new LibraryProviderError("catalog_unauthorized", { upstreamCode: code });
  if (status === 403) return new LibraryProviderError("catalog_forbidden", { upstreamCode: code });
  if (status === 404) return new LibraryProviderError("catalog_not_found", { upstreamCode: code });
  if (status === 429) return new LibraryProviderError("catalog_rate_limited", { allowLegacyFallback: true, upstreamCode: code });
  if (status >= 500) return new LibraryProviderError("catalog_upstream_error", { allowLegacyFallback: true, upstreamCode: code });
  if (status === 400 && (code === "invalid_cursor" || code === "incompatible_cursor")) return new LibraryProviderError("catalog_incompatible_cursor", { upstreamCode: code });
  return new LibraryProviderError("catalog_bad_request", { upstreamCode: code });
}
