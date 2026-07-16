import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { CatalogError, asCatalogError } from "@/lib/activity-catalog/errors";
import type { CatalogProviderMode, CatalogResult } from "@/lib/activity-catalog/types";
import { serverEnv } from "@/lib/integrations/env";
import { HttpActivityCatalogProvider } from "./http-provider";
import { LegacyActivityCatalogProvider } from "./legacy-provider";
import type { ActivityCatalogExecutionObserver } from "./observability";
import type { ActivityCatalogProvider } from "./provider";

export function parseCatalogProviderMode(value: string | undefined): CatalogProviderMode {
  if (!value || value === "legacy") return "legacy";
  if (value === "external" || value === "external_with_legacy_fallback") return value;
  throw new CatalogError("catalog_not_configured", { failureStage: "provider_request" });
}

export class FallbackActivityCatalogProvider implements ActivityCatalogProvider {
  constructor(
    private readonly external: ActivityCatalogProvider,
    private readonly legacy: ActivityCatalogProvider,
    private readonly observer?: ActivityCatalogExecutionObserver
  ) {}

  listSports: ActivityCatalogProvider["listSports"] = async (options) => this.withFallback(
    () => this.external.listSports(options),
    () => this.legacy.listSports(options)
  );

  getSportSessionTemplate: ActivityCatalogProvider["getSportSessionTemplate"] = async (sportSlug, options) => this.withFallback(
    () => this.external.getSportSessionTemplate(sportSlug, options),
    () => this.legacy.getSportSessionTemplate(sportSlug, options)
  );

  getFilters: ActivityCatalogProvider["getFilters"] = async (options) => this.withFallback(
    () => this.external.getFilters(options),
    () => this.legacy.getFilters(options)
  );

  searchActivities: ActivityCatalogProvider["searchActivities"] = async (params) => this.withFallback(
    () => this.external.searchActivities(params),
    () => this.legacy.searchActivities(params)
  );

  getActivity: ActivityCatalogProvider["getActivity"] = async (identifier, options) => this.withFallback(
    () => this.external.getActivity(identifier, options),
    () => this.legacy.getActivity(identifier, options),
    true
  );

  getActivityAlternatives: ActivityCatalogProvider["getActivityAlternatives"] = async (identifier, options) => this.withFallback(
    () => this.external.getActivityAlternatives(identifier, options),
    async () => {
      // An upstream 404 is only a compatibility signal when the identifier is
      // demonstrably present in the legacy catalog. Unknown identifiers remain
      // not-found instead of degrading into a misleading successful empty list.
      await this.legacy.getActivity(identifier, options);
      return this.legacy.getActivityAlternatives(identifier, options);
    },
    true
  );

  private async withFallback<T>(
    external: () => Promise<CatalogResult<T>>,
    legacy: () => Promise<CatalogResult<T>>,
    allowNotFound = false
  ) {
    try {
      return await external();
    } catch (error) {
      const catalogError = asCatalogError(error);
      if (!catalogError.allowLegacyFallback || (!allowNotFound && catalogError.code === "catalog_not_found")) throw catalogError;
      try {
        const fallback = await legacy();
        this.observer?.fallbackSucceeded(catalogError);
        return { ...fallback, meta: { ...fallback.meta, degraded: true } };
      } catch {
        // A failed compatibility attempt must not rewrite an upstream outage as
        // a misleading local not-found (or expose a legacy implementation error).
        throw catalogError;
      }
    }
  }
}

class ObservedActivityCatalogProvider implements ActivityCatalogProvider {
  constructor(
    private readonly provider: ActivityCatalogProvider,
    private readonly observer: ActivityCatalogExecutionObserver
  ) {}

  listSports: ActivityCatalogProvider["listSports"] = (options) => this.execute(() => this.provider.listSports(options));
  getSportSessionTemplate: ActivityCatalogProvider["getSportSessionTemplate"] = (sportSlug, options) => this.execute(() => this.provider.getSportSessionTemplate(sportSlug, options));
  getFilters: ActivityCatalogProvider["getFilters"] = (options) => this.execute(() => this.provider.getFilters(options));
  searchActivities: ActivityCatalogProvider["searchActivities"] = (params) => this.execute(() => this.provider.searchActivities(params));
  getActivity: ActivityCatalogProvider["getActivity"] = (identifier, options) => this.execute(() => this.provider.getActivity(identifier, options));
  getActivityAlternatives: ActivityCatalogProvider["getActivityAlternatives"] = (identifier, options) => this.execute(() => this.provider.getActivityAlternatives(identifier, options));

  private async execute<T>(operation: () => Promise<CatalogResult<T>>) {
    this.observer.providerStarted();
    const startedAt = performance.now();
    try {
      const result = await operation();
      this.observer.providerCompleted(result, performance.now() - startedAt);
      return result;
    } catch (error) {
      this.observer.providerFailed(error, performance.now() - startedAt);
      throw error;
    }
  }
}

export function createActivityCatalogProvider(
  supabase: SupabaseClient,
  options: {
    mode?: CatalogProviderMode;
    external?: ActivityCatalogProvider;
    legacy?: ActivityCatalogProvider;
    observer?: ActivityCatalogExecutionObserver;
  } = {}
) {
  try {
    const mode = options.mode ?? parseCatalogProviderMode(serverEnv.plaivraActivityCatalogMode);
    options.observer?.providerRequested(mode);
    const legacy = options.legacy ?? new LegacyActivityCatalogProvider(supabase);
    let selected: ActivityCatalogProvider;
    if (mode === "legacy") {
      selected = legacy;
    } else {
      const external = options.external ?? new HttpActivityCatalogProvider({
        baseUrl: serverEnv.plaivraActivityCatalogBaseUrl,
        apiKey: serverEnv.plaivraActivityCatalogApiKey
      });
      selected = mode === "external"
        ? external
        : new FallbackActivityCatalogProvider(external, legacy, options.observer);
    }
    return options.observer ? new ObservedActivityCatalogProvider(selected, options.observer) : selected;
  } catch (error) {
    options.observer?.providerStarted();
    options.observer?.providerFailed(error, 0);
    throw error;
  }
}
