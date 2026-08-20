import "server-only";

import type {
  LibraryActivityDetail,
  LibraryAlternative,
  LibraryCoverage,
  LibraryDomain,
  LibraryDomainFilterDefinition,
  LibraryDomainFilters,
  LibraryEnvironmentCapabilityDefinition,
  LibraryEquipment,
  LibraryExecutionProfile,
  LibraryInstruction,
  LibraryJsonValue,
  LibraryProviderMeta,
  LibraryResponseMeta,
  LibrarySearchParams
} from "@/lib/activity-catalog/library-types";
import { LibraryProviderError } from "./library-errors";
import type { LibraryActivityProvider, LibraryRequestOptions } from "./library-provider";

const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const LIBRARY_SLUG = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

type HttpLibraryProviderOptions = { baseUrl: string; apiKey: string; timeoutMs?: number; fetchImpl?: typeof fetch };
type V2Envelope<T> = { data: T; meta: LibraryResponseMeta; pagination?: { limit: number; returned: number; nextCursor: string | null } };

function invalidResponse(): never { throw new LibraryProviderError("catalog_invalid_response"); }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function nullableString(value: unknown) { return value === null || value === undefined ? null : typeof value === "string" ? value : invalidResponse(); }
function stringValue(value: unknown) { return typeof value === "string" && value.length > 0 ? value : invalidResponse(); }
function integerValue(value: unknown) { return typeof value === "number" && Number.isInteger(value) ? value : invalidResponse(); }
function recordArray(value: unknown) { return Array.isArray(value) && value.every(isRecord) ? value : invalidResponse(); }

function parseLibraryJsonValue(value: unknown): LibraryJsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(parseLibraryJsonValue);
  if (isRecord(value)) {
    const parsed: { [key: string]: LibraryJsonValue } = {};
    for (const [key, entry] of Object.entries(value)) parsed[key] = parseLibraryJsonValue(entry);
    return parsed;
  }
  return invalidResponse();
}
function parseLibraryJsonArray(value: unknown): LibraryJsonValue[] { if (!Array.isArray(value)) return invalidResponse(); return value.map(parseLibraryJsonValue); }
function parseLibrarySlug(value: unknown) { if (typeof value !== "string" || !LIBRARY_SLUG.test(value)) return invalidResponse(); return value; }
function parseFilterKind(value: unknown): LibraryDomainFilterDefinition["kind"] {
  switch (value) { case "enum": case "multi_enum": case "range": case "capability": return value; default: return invalidResponse(); }
}
function parseEnvironmentValueKind(value: unknown): LibraryEnvironmentCapabilityDefinition["valueKind"] {
  switch (value) { case "enum": case "boolean": case "equipment_set": return value; default: return invalidResponse(); }
}
function parseEnvironmentPrecedence(value: unknown): LibraryEnvironmentCapabilityDefinition["precedence"] {
  switch (value) { case "available_today_over_saved_setup": case "saved_setup_only": case "context_only": return value; default: return invalidResponse(); }
}
function parseDisplayOrder(value: unknown) { if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) return invalidResponse(); return value; }
function parseLibraryDomainFilterDefinition(value: unknown): LibraryDomainFilterDefinition {
  if (!isRecord(value)) return invalidResponse();
  return { slug: parseLibrarySlug(value.slug), kind: parseFilterKind(value.kind), options: parseLibraryJsonArray(value.options), displayOrder: parseDisplayOrder(value.displayOrder) };
}
function parseLibraryEnvironmentCapability(value: unknown): LibraryEnvironmentCapabilityDefinition {
  if (!isRecord(value) || typeof value.temporaryOverrideAllowed !== "boolean") return invalidResponse();
  return {
    key: parseLibrarySlug(value.key),
    valueKind: parseEnvironmentValueKind(value.valueKind),
    allowedValues: parseLibraryJsonArray(value.allowedValues),
    temporaryOverrideAllowed: value.temporaryOverrideAllowed,
    precedence: parseEnvironmentPrecedence(value.precedence)
  };
}
function parseLibraryDomainFilters(value: unknown, expectedDomain: string): LibraryDomainFilters {
  if (!isRecord(value) || !Array.isArray(value.filters) || !Array.isArray(value.environmentCapabilities) || typeof value.availableTodayPrimaryControl !== "boolean") return invalidResponse();
  const domain = parseLibrarySlug(value.domain);
  if (domain !== expectedDomain) return invalidResponse();
  return {
    domain,
    filters: value.filters.map(parseLibraryDomainFilterDefinition),
    environmentCapabilities: value.environmentCapabilities.map(parseLibraryEnvironmentCapability),
    availableTodayPrimaryControl: value.availableTodayPrimaryControl
  };
}

function parseInstruction(value: unknown): LibraryInstruction {
  if (!isRecord(value)) return invalidResponse();
  return { order: integerValue(value.order), text: stringValue(value.text) };
}
function parseEquipment(value: unknown): LibraryEquipment {
  if (!isRecord(value)) return invalidResponse();
  return { slug: nullableString(value.slug), name: nullableString(value.name), requirement: nullableString(value.requirement) };
}
function parseCoverage(value: unknown): LibraryCoverage {
  if (!isRecord(value)) return invalidResponse();
  return {
    ...value,
    slug: nullableString(value.slug),
    name: nullableString(value.name),
    muscleName: nullableString(value.muscleName),
    label: nullableString(value.label),
    role: nullableString(value.role),
    bodyRegion: nullableString(value.bodyRegion),
    targetId: nullableString(value.targetId),
    atlasTargetId: nullableString(value.atlasTargetId),
    side: nullableString(value.side)
  };
}
function parseExecutionProfile(value: unknown): LibraryExecutionProfile {
  if (!isRecord(value)) return invalidResponse();
  const metrics = value.metrics === undefined ? undefined : Array.isArray(value.metrics) && value.metrics.every((entry) => typeof entry === "string") ? value.metrics as string[] : invalidResponse();
  return { ...value, ...(metrics ? { metrics } : {}) };
}
function parseSchema(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.key !== "string" || !Number.isInteger(value.version)) return invalidResponse();
  if (value.fields !== undefined && !Array.isArray(value.fields)) return invalidResponse();
  return value as LibraryActivityDetail["prescriptionSchema"];
}
function parseActivityType(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || typeof value.slug !== "string" || typeof value.name !== "string") return invalidResponse();
  return { slug: value.slug, name: value.name };
}
function parseMembership(value: unknown): LibraryActivityDetail["membership"] {
  if (!isRecord(value) || typeof value.kind !== "string" || typeof value.visibility !== "string" || !Number.isFinite(value.domainPriority) || typeof value.primaryDomain !== "boolean") return invalidResponse();
  return { kind: value.kind, visibility: value.visibility, domainPriority: Number(value.domainPriority), primaryDomain: value.primaryDomain, ...(typeof value.checksum === "string" ? { checksum: value.checksum } : {}) };
}
function parseAuthority(value: unknown): LibraryActivityDetail["authority"] {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isRecord(value.libraryRelease) || !isRecord(value.catalogRelease)) return invalidResponse();
  const libraryRelease = value.libraryRelease;
  const catalogRelease = value.catalogRelease;
  if (![libraryRelease.id, libraryRelease.version, libraryRelease.checksum, catalogRelease.id, catalogRelease.version, catalogRelease.checksum, value.activityId, value.revisionId].every((entry) => typeof entry === "string") || !Number.isInteger(value.revisionNumber)) return invalidResponse();
  return {
    libraryRelease: { id: String(libraryRelease.id), version: String(libraryRelease.version), checksum: String(libraryRelease.checksum) },
    catalogRelease: { id: String(catalogRelease.id), version: String(catalogRelease.version), checksum: String(catalogRelease.checksum) },
    activityId: String(value.activityId), revisionId: String(value.revisionId), revisionNumber: Number(value.revisionNumber),
    ...(typeof value.releaseItemChecksum === "string" ? { releaseItemChecksum: value.releaseItemChecksum } : {})
  };
}

function parseLibraryActivityDetail(value: unknown, expectedDomain?: string): LibraryActivityDetail {
  if (!isRecord(value)) return invalidResponse();
  const domain = value.domain === undefined ? expectedDomain : parseLibrarySlug(value.domain);
  if (expectedDomain && domain !== expectedDomain) return invalidResponse();
  if (domain !== undefined && !LIBRARY_SLUG.test(domain)) return invalidResponse();
  if (!Array.isArray(value.instructions) || !Array.isArray(value.equipment) || !Array.isArray(value.coverage) || !Array.isArray(value.executionProfiles) || !Array.isArray(value.aliases) || !Array.isArray(value.bodyEffects)) return invalidResponse();
  const authority = parseAuthority(value.authority);
  const recordDefinitions = value.recordDefinitions === undefined ? [] : recordArray(value.recordDefinitions);
  const heatMap = value.heatMap === null || value.heatMap === undefined ? null : isRecord(value.heatMap) ? value.heatMap : invalidResponse();
  return {
    id: stringValue(value.id),
    ...(domain ? { domain } : {}),
    revisionId: stringValue(value.revisionId),
    revisionNumber: integerValue(value.revisionNumber),
    revisionLifecycle: stringValue(value.revisionLifecycle),
    ...(value.revisionChecksum === undefined ? {} : { revisionChecksum: nullableString(value.revisionChecksum) }),
    slug: stringValue(value.slug),
    name: stringValue(value.name),
    shortDescription: nullableString(value.shortDescription),
    instructions: value.instructions.map(parseInstruction),
    difficulty: nullableString(value.difficulty),
    movementPattern: nullableString(value.movementPattern),
    mechanics: nullableString(value.mechanics),
    forceType: nullableString(value.forceType),
    activityType: parseActivityType(value.activityType),
    membership: parseMembership(value.membership),
    aliases: recordArray(value.aliases),
    equipment: value.equipment.map(parseEquipment),
    coverage: value.coverage.map(parseCoverage),
    executionProfiles: value.executionProfiles.map(parseExecutionProfile),
    bodyEffects: recordArray(value.bodyEffects),
    prescriptionSchema: parseSchema(value.prescriptionSchema),
    performedMetricSchema: parseSchema(value.performedMetricSchema),
    recordDefinitions,
    heatMap,
    publicationPolicy: value.publicationPolicy === null || value.publicationPolicy === undefined ? null : isRecord(value.publicationPolicy) ? value.publicationPolicy as LibraryActivityDetail["publicationPolicy"] : invalidResponse(),
    capabilityContract: value.capabilityContract === null || value.capabilityContract === undefined ? null : isRecord(value.capabilityContract) ? value.capabilityContract as LibraryActivityDetail["capabilityContract"] : invalidResponse(),
    ...(authority ? { authority } : {})
  };
}

function parseEnvelope<T>(value: unknown, requirePagination = false): V2Envelope<T> {
  if (!isRecord(value) || !("data" in value) || !isRecord(value.meta)) throw new LibraryProviderError("catalog_invalid_response");
  const meta = value.meta as Record<string, unknown>;
  if (meta.apiVersion !== "v2" || typeof meta.locale !== "string" || !isRecord(meta.libraryRelease) || !isRecord(meta.catalogRelease)) throw new LibraryProviderError("catalog_invalid_response");
  const libraryRelease = meta.libraryRelease as Record<string, unknown>;
  const catalogRelease = meta.catalogRelease as Record<string, unknown>;
  for (const key of ["id", "version", "checksum"] as const) if (typeof libraryRelease[key] !== "string" || typeof catalogRelease[key] !== "string") throw new LibraryProviderError("catalog_invalid_response");
  if (typeof libraryRelease.publishedAt !== "string" || typeof libraryRelease.strengthSemanticFingerprint !== "string") throw new LibraryProviderError("catalog_invalid_response");
  let pagination: V2Envelope<T>["pagination"];
  if (requirePagination) {
    if (!isRecord(value.pagination)) throw new LibraryProviderError("catalog_invalid_response");
    const page = value.pagination as Record<string, unknown>;
    if (!Number.isInteger(page.limit) || !Number.isInteger(page.returned) || !(page.nextCursor === null || typeof page.nextCursor === "string")) throw new LibraryProviderError("catalog_invalid_response");
    pagination = page as V2Envelope<T>["pagination"];
  }
  return { data: value.data as T, meta: meta as unknown as LibraryResponseMeta, ...(pagination ? { pagination } : {}) };
}

function providerMeta(meta: LibraryResponseMeta): LibraryProviderMeta { return { ...meta, source: "library_v2", degraded: false }; }

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
    } catch (error) { throw new LibraryProviderError("catalog_not_configured", { cause: error }); }
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
    const payload = parseEnvelope<unknown>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/filters`, localeQuery(options)));
    return { data: parseLibraryDomainFilters(payload.data, domain), meta: providerMeta(payload.meta) };
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
    return { data: payload.data.map((item) => parseLibraryActivityDetail(item, params.domain)), pagination: payload.pagination, meta: providerMeta(payload.meta) };
  }
  async getActivityByIdentifier(identifier: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<unknown>(await this.request(`/v2/library-activities/${encodeURIComponent(identifier)}`, localeQuery(options)));
    const detail = parseLibraryActivityDetail(payload.data);
    if (!detail.domain) throw new LibraryProviderError("catalog_invalid_response");
    return { data: detail, meta: providerMeta(payload.meta) };
  }
  async getActivity(domain: string, identifier: string, options: LibraryRequestOptions = {}) {
    const payload = parseEnvelope<unknown>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}`, localeQuery(options)));
    return { data: parseLibraryActivityDetail(payload.data, domain), meta: providerMeta(payload.meta) };
  }
  async getActivityAlternatives(domain: string, identifier: string, options: LibraryRequestOptions & { limit?: number } = {}) {
    const query = localeQuery(options);
    if (options.limit !== undefined) query.set("limit", String(options.limit));
    const payload = parseEnvelope<unknown[]>(await this.request(`/v2/library-domains/${encodeURIComponent(domain)}/activities/${encodeURIComponent(identifier)}/alternatives`, query));
    if (!Array.isArray(payload.data)) throw new LibraryProviderError("catalog_invalid_response");
    const data = payload.data.map((value): LibraryAlternative => {
      if (!isRecord(value) || typeof value.relationshipType !== "string" || !isRecord(value.activity)) return invalidResponse();
      return {
        relationshipType: value.relationshipType,
        rationale: nullableString(value.rationale),
        prescriptionTransfer: value.prescriptionTransfer ?? null,
        ...(typeof value.relationshipChecksum === "string" ? { relationshipChecksum: value.relationshipChecksum } : {}),
        activity: parseLibraryActivityDetail(value.activity, domain)
      };
    });
    return { data, meta: providerMeta(payload.meta) };
  }

  private async request(path: string, query: URLSearchParams): Promise<unknown> {
    const url = new URL(path, this.baseUrl); url.search = query.toString();
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { method: "GET", cache: "no-store", signal: controller.signal, headers: { Accept: "application/json", Authorization: `Bearer ${this.apiKey}` } });
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
    } finally { clearTimeout(timeout); }
  }
}

function localeQuery(options: LibraryRequestOptions) { const query = new URLSearchParams(); if (options.locale) query.set("locale", options.locale); return query; }
function upstreamCode(payload: unknown) { return isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === "string" ? payload.error.code : undefined; }
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