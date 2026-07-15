import "server-only";

import type {
  ActivityAlternative,
  ActivityCatalogFilters,
  ActivitySearchParams,
  CatalogRequestOptions,
  CatalogResult,
  PaginatedTrainingActivities,
  Sport,
  SportSessionTemplate,
  TrainingActivity
} from "@/lib/activity-catalog/types";

export interface ActivityCatalogProvider {
  listSports(options?: CatalogRequestOptions): Promise<CatalogResult<Sport[]>>;
  getSportSessionTemplate(sportSlug: string, options?: CatalogRequestOptions): Promise<CatalogResult<SportSessionTemplate>>;
  getFilters(options?: CatalogRequestOptions & { sport?: string }): Promise<CatalogResult<ActivityCatalogFilters>>;
  searchActivities(params: ActivitySearchParams): Promise<CatalogResult<PaginatedTrainingActivities>>;
  getActivity(identifier: string, options?: CatalogRequestOptions): Promise<CatalogResult<TrainingActivity>>;
  getActivityAlternatives(identifier: string, options?: CatalogRequestOptions & { limit?: number }): Promise<CatalogResult<ActivityAlternative[]>>;
}
