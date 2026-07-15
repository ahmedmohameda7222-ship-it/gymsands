import { catalogSearchResponse, parseActivitySearch, withCatalogRoute } from "../_shared";

export async function GET(request: Request) {
  return withCatalogRoute(request, "activity-catalog-activities", async (getProvider) => {
    const params = parseActivitySearch(request);
    return catalogSearchResponse(await getProvider().searchActivities(params));
  });
}
