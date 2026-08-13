import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingActivity } from "@/lib/activity-catalog/types";
import type { LibraryActivityDetail, LibraryProviderMeta, LibrarySearchParams } from "@/lib/activity-catalog/library-types";
import { LegacyActivityCatalogProvider } from "./legacy-provider";
import { LibraryProviderError } from "./library-errors";
import type { LibraryActivityProvider, LibraryRequestOptions } from "./library-provider";

function meta(locale?: string): LibraryProviderMeta {
  return { apiVersion: "v1-compat", locale: locale ?? "en", libraryRelease: null, catalogRelease: null, source: "legacy", degraded: false };
}

function mapActivity(activity: TrainingActivity): LibraryActivityDetail {
  return {
    id: activity.id,
    revisionId: activity.id,
    revisionNumber: activity.version ?? 0,
    revisionLifecycle: "legacy_compatibility",
    slug: activity.slug,
    name: activity.name,
    shortDescription: activity.shortDescription ?? null,
    instructions: activity.instructions,
    difficulty: activity.difficulty,
    movementPattern: activity.movementPattern,
    activityType: activity.activityType ? { slug: activity.activityType.slug, name: activity.activityType.name } : null,
    membership: { kind: "legacy_compatibility", visibility: "default", domainPriority: 0, primaryDomain: true },
    aliases: [],
    equipment: activity.equipment.map((item) => ({ slug: item.slug, name: item.name, requirement: item.isRequired ? "required" : "compatible" })),
    coverage: activity.muscles.map((muscle) => ({ slug: muscle.slug, name: muscle.name, role: muscle.role, bodyRegion: muscle.bodyRegion ?? null })),
    executionProfiles: [],
    bodyEffects: [],
    prescriptionSchema: activity.metricSchema ? { key: activity.metricSchema.slug ?? "legacy", version: 1, fields: activity.metricSchema.fields ?? [] } : null,
    performedMetricSchema: activity.metricSchema ? { key: activity.metricSchema.slug ?? "legacy", version: 1, fields: activity.metricSchema.fields ?? [] } : null,
    recordDefinitions: [],
    heatMap: null,
    publicationPolicy: null,
    capabilityContract: null
  };
}

function encodeCursor(state: { offset: number; domain: string; query: string }) {
  return Buffer.from(JSON.stringify({ v: 1, ...state }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string | undefined, params: LibrarySearchParams) {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Record<string, unknown>;
    if (parsed.v !== 1 || parsed.domain !== params.domain || parsed.query !== (params.query ?? "") || !Number.isSafeInteger(parsed.offset) || Number(parsed.offset) < 0) {
      throw new Error("cursor mismatch");
    }
    return Number(parsed.offset);
  } catch (error) {
    throw new LibraryProviderError("catalog_incompatible_cursor", { cause: error, upstreamCode: "legacy_compatibility_cursor" });
  }
}

export class LegacyLibraryActivityProvider implements LibraryActivityProvider {
  private readonly legacy: LegacyActivityCatalogProvider;
  constructor(supabase: SupabaseClient) { this.legacy = new LegacyActivityCatalogProvider(supabase); }

  async listDomains(options: LibraryRequestOptions = {}) {
    return { data: [{ key: "strength", displayName: "Strength", coverageCount: 0, ownedMovementCanonicalCount: 0, archetypeCount: 0, membershipCount: 0, authorityKind: "legacy_compatibility", checksum: "legacy", tabs: [] }], meta: meta(options.locale) };
  }

  async getDomain(domain: string, options: LibraryRequestOptions = {}) {
    if (domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    return { data: (await this.listDomains(options)).data[0], meta: meta(options.locale) };
  }

  async getFilters(domain: string, options: LibraryRequestOptions = {}) {
    if (domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    const result = await this.legacy.getFilters();
    return { data: [result.data], meta: meta(options.locale) };
  }

  async getArchetypes(domain: string, options: LibraryRequestOptions = {}) {
    if (domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    return { data: [], meta: meta(options.locale) };
  }

  async searchActivities(params: LibrarySearchParams) {
    if (params.domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    const limit = Math.min(Math.max(params.limit ?? 30, 1), 50);
    const offset = decodeCursor(params.cursor, params);
    const result = await this.legacy.searchActivities({ query: params.query, limit, offset });
    const activities = result.data.activities.map(mapActivity);
    const nextOffset = result.data.pagination.nextOffset ?? null;
    return {
      data: activities,
      pagination: { limit, returned: activities.length, nextCursor: nextOffset === null ? null : encodeCursor({ offset: nextOffset, domain: params.domain, query: params.query ?? "" }) },
      meta: meta(params.locale)
    };
  }

  async getActivity(domain: string, identifier: string, options: LibraryRequestOptions = {}) {
    if (domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    try {
      const result = await this.legacy.getActivity(identifier);
      return { data: mapActivity(result.data), meta: meta(options.locale) };
    } catch (error) {
      throw new LibraryProviderError("catalog_not_found", { cause: error });
    }
  }

  async getActivityAlternatives(domain: string, identifier: string, options: LibraryRequestOptions & { limit?: number } = {}) {
    if (domain !== "strength") throw new LibraryProviderError("catalog_not_found");
    try {
      // The historical provider has no authoritative alternatives. Prove the
      // identifier is genuinely old, then preserve that valid empty result.
      await this.legacy.getActivity(identifier);
      await this.legacy.getActivityAlternatives();
      return { data: [], meta: meta(options.locale) };
    } catch (error) {
      throw new LibraryProviderError("catalog_not_found", { cause: error });
    }
  }
}
