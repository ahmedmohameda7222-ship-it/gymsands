import "server-only";

import { ActivityCatalogError, isActivityCatalogError } from "@/lib/activity-catalog/errors";
import type {
  ActivityCatalogAlternative,
  ActivityCatalogAlternativesOptions,
  ActivityCatalogFilterOptions,
  ActivityCatalogProviderMode,
  ActivityCatalogRequestOptions,
  ActivityCatalogResult,
  ActivityCatalogSearchParams,
  ActivityCatalogSport,
  ActivityCatalogSportSessionTemplate,
  TrainingActivity
} from "@/lib/activity-catalog/types";
import type { ActivityCatalogProvider } from "./provider";

type Operation = "list" | "detail";

export function shouldUseLegacyFallback(error: unknown, operation: Operation) {
  if (!isActivityCatalogError(error)) return false;
  if (["unavailable", "timeout", "rate_limited"].includes(error.code)) return true;
  return operation === "detail" && error.code === "not_found";
}

function degraded<T>(result: ActivityCatalogResult<T>, error: ActivityCatalogError): ActivityCatalogResult<T> {
  return {
    ...result,
    meta: {
      ...result.meta,
      source: "legacy",
      degraded: true,
      fallbackReason: error.code
    }
  };
}

export class CompositeActivityCatalogProvider implements ActivityCatalogProvider {
  constructor(
    private readonly mode: ActivityCatalogProviderMode,
    private readonly external: ActivityCatalogProvider | null,
    private readonly legacy: ActivityCatalogProvider
  ) {
    if (mode !== "legacy" && !external) throw new ActivityCatalogError("configuration_error");
  }

  private async select<T>(
    operation: Operation,
    externalCall: () => Promise<ActivityCatalogResult<T>>,
    legacyCall: () => Promise<ActivityCatalogResult<T>>
  ) {
    if (this.mode === "legacy") return legacyCall();
    if (this.mode === "external") return externalCall();
    try {
      return await externalCall();
    } catch (error) {
      if (!shouldUseLegacyFallback(error, operation)) throw error;
      const externalError = error as ActivityCatalogError;
      try {
        return degraded(await legacyCall(), externalError);
      } catch {
        throw externalError;
      }
    }
  }

  listSports(options?: ActivityCatalogRequestOptions): Promise<ActivityCatalogResult<ActivityCatalogSport[]>> {
    return this.select("list", () => this.external!.listSports(options), () => this.legacy.listSports(options));
  }

  getSportSessionTemplate(
    sportSlug: string,
    options?: ActivityCatalogRequestOptions
  ): Promise<ActivityCatalogResult<ActivityCatalogSportSessionTemplate>> {
    return this.select(
      "detail",
      () => this.external!.getSportSessionTemplate(sportSlug, options),
      () => this.legacy.getSportSessionTemplate(sportSlug, options)
    );
  }

  getFilters(options?: ActivityCatalogRequestOptions & { sport?: string }): Promise<ActivityCatalogResult<ActivityCatalogFilterOptions>> {
    return this.select("list", () => this.external!.getFilters(options), () => this.legacy.getFilters(options));
  }

  searchActivities(params: ActivityCatalogSearchParams): Promise<ActivityCatalogResult<TrainingActivity[]>> {
    return this.select("list", () => this.external!.searchActivities(params), () => this.legacy.searchActivities(params));
  }

  getActivity(identifier: string, options?: ActivityCatalogRequestOptions): Promise<ActivityCatalogResult<TrainingActivity>> {
    return this.select(
      "detail",
      () => this.external!.getActivity(identifier, options),
      () => this.legacy.getActivity(identifier, options)
    );
  }

  getActivityAlternatives(
    identifier: string,
    options?: ActivityCatalogAlternativesOptions
  ): Promise<ActivityCatalogResult<ActivityCatalogAlternative[]>> {
    return this.select(
      "detail",
      () => this.external!.getActivityAlternatives(identifier, options),
      () => this.legacy.getActivityAlternatives(identifier, options)
    );
  }
}
