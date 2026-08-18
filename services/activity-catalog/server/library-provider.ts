import type { CatalogLocale } from "@/lib/activity-catalog/catalog-locale";
import type {
  LibraryActivityDetail,
  LibraryAlternative,
  LibraryDomain,
  LibraryResult,
  LibrarySearchParams,
  LibrarySearchResult
} from "@/lib/activity-catalog/library-types";

export type LibraryRequestOptions = { locale?: CatalogLocale };

export interface LibraryActivityProvider {
  listDomains(options?: LibraryRequestOptions): Promise<LibraryResult<LibraryDomain[]>>;
  getDomain(domain: string, options?: LibraryRequestOptions): Promise<LibraryResult<LibraryDomain>>;
  getFilters(domain: string, options?: LibraryRequestOptions): Promise<LibraryResult<unknown[]>>;
  getArchetypes(domain: string, options?: LibraryRequestOptions): Promise<LibraryResult<unknown[]>>;
  searchActivities(params: LibrarySearchParams): Promise<LibrarySearchResult>;
  getActivity(domain: string, identifier: string, options?: LibraryRequestOptions): Promise<LibraryResult<LibraryActivityDetail>>;
  getActivityAlternatives(domain: string, identifier: string, options?: LibraryRequestOptions & { limit?: number }): Promise<LibraryResult<LibraryAlternative[]>>;
}