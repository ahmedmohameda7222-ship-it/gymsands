import {
  handleActivityCatalogRoute,
  parseActivitySearch
} from "@/lib/activity-catalog/route-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleActivityCatalogRoute(
    request,
    parseActivitySearch,
    (provider, search) => provider.searchActivities(search)
  );
}
