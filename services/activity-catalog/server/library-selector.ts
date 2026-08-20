import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CatalogProviderMode } from "@/lib/activity-catalog/types";
import type { LibraryFallbackReason } from "@/lib/activity-catalog/library-types";
import { serverEnv } from "@/lib/integrations/env";
import { HttpLibraryActivityProvider } from "./library-http-provider";
import { LegacyLibraryActivityProvider } from "./library-legacy-provider";
import { asLibraryProviderError, type LibraryProviderError } from "./library-errors";
import type { LibraryActivityProvider } from "./library-provider";

function boundedFallbackReason(error: LibraryProviderError): LibraryFallbackReason {
  switch (error.code) {
    case "catalog_timeout":
    case "catalog_network_error":
    case "catalog_rate_limited":
    case "catalog_upstream_error":
    case "catalog_not_found":
      return error.code;
    default:
      return "catalog_upstream_error";
  }
}

function degraded<T extends { meta: Record<string, unknown> }>(result: T, reason: LibraryFallbackReason): T {
  return {
    ...result,
    meta: {
      ...result.meta,
      primarySource: "library_v2",
      fallbackUsed: true,
      fallbackReason: reason,
      degraded: true
    }
  };
}

export class FallbackLibraryActivityProvider implements LibraryActivityProvider {
  constructor(private readonly external: LibraryActivityProvider, private readonly legacy: LibraryActivityProvider) {}

  listDomains: LibraryActivityProvider["listDomains"] = (options) => this.withFallback(() => this.external.listDomains(options), () => this.legacy.listDomains(options));
  getDomain: LibraryActivityProvider["getDomain"] = (domain, options) => this.withFallback(() => this.external.getDomain(domain, options), () => this.legacy.getDomain(domain, options));
  getFilters: LibraryActivityProvider["getFilters"] = (domain, options) => this.external.getFilters(domain, options);
  getArchetypes: LibraryActivityProvider["getArchetypes"] = (domain, options) => this.withFallback(() => this.external.getArchetypes(domain, options), () => this.legacy.getArchetypes(domain, options));
  searchActivities: LibraryActivityProvider["searchActivities"] = (params) => this.withFallback(() => this.external.searchActivities(params), () => this.legacy.searchActivities(params));
  getActivityByIdentifier: LibraryActivityProvider["getActivityByIdentifier"] = (identifier, options) => this.withFallback(
    () => this.external.getActivityByIdentifier(identifier, options),
    () => this.legacy.getActivityByIdentifier(identifier, options),
    async () => { await this.legacy.getActivityByIdentifier(identifier, options); }
  );
  getActivity: LibraryActivityProvider["getActivity"] = (domain, identifier, options) => this.withFallback(
    () => this.external.getActivity(domain, identifier, options),
    () => this.legacy.getActivity(domain, identifier, options),
    async () => { await this.legacy.getActivity(domain, identifier, options); }
  );
  getActivityAlternatives: LibraryActivityProvider["getActivityAlternatives"] = (domain, identifier, options) => this.withFallback(
    () => this.external.getActivityAlternatives(domain, identifier, options),
    () => this.legacy.getActivityAlternatives(domain, identifier, options),
    async () => { await this.legacy.getActivity(domain, identifier, options); }
  );

  private async withFallback<T extends { meta: Record<string, unknown> }>(
    external: () => Promise<T>,
    legacy: () => Promise<T>,
    proveLegacyIdentifier?: () => Promise<void>
  ) {
    try {
      return await external();
    } catch (error) {
      const safe = asLibraryProviderError(error);
      const provenOldIdentifier = safe.code === "catalog_not_found" && proveLegacyIdentifier;
      if (!safe.allowLegacyFallback && !provenOldIdentifier) throw safe;
      if (provenOldIdentifier) {
        try { await proveLegacyIdentifier(); } catch { throw safe; }
      }
      try { return degraded(await legacy(), boundedFallbackReason(safe)); } catch { throw safe; }
    }
  }
}

export function createLibraryActivityProvider(supabase: SupabaseClient, mode: CatalogProviderMode) {
  const legacy = new LegacyLibraryActivityProvider(supabase);
  if (mode !== "library_v2" && mode !== "library_v2_with_legacy_fallback") return legacy;
  const external = new HttpLibraryActivityProvider({
    baseUrl: serverEnv.plaivraActivityCatalogBaseUrl,
    apiKey: serverEnv.plaivraActivityCatalogApiKey
  });
  return mode === "library_v2" ? external : new FallbackLibraryActivityProvider(external, legacy);
}