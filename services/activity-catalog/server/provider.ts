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

export interface ActivityCatalogProvider {
  listSports(options?: ActivityCatalogRequestOptions): Promise<ActivityCatalogResult<ActivityCatalogSport[]>>;
  getSportSessionTemplate(
    sportSlug: string,
    options?: ActivityCatalogRequestOptions
  ): Promise<ActivityCatalogResult<ActivityCatalogSportSessionTemplate>>;
  getFilters(options?: ActivityCatalogRequestOptions & { sport?: string }): Promise<ActivityCatalogResult<ActivityCatalogFilterOptions>>;
  searchActivities(params: ActivityCatalogSearchParams): Promise<ActivityCatalogResult<TrainingActivity[]>>;
  getActivity(identifier: string, options?: ActivityCatalogRequestOptions): Promise<ActivityCatalogResult<TrainingActivity>>;
  getActivityAlternatives(
    identifier: string,
    options?: ActivityCatalogAlternativesOptions
  ): Promise<ActivityCatalogResult<ActivityCatalogAlternative[]>>;
}
