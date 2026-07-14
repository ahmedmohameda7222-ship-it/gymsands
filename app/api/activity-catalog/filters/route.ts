import {
  handleActivityCatalogRoute,
  parseFilterOptions
} from "@/lib/activity-catalog/route-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleActivityCatalogRoute(
    request,
    parseFilterOptions,
    (provider, options) => provider.getFilters(options)
  );
}
