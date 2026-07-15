import { catalogResponse, parseCatalogOptions, validateCatalogSlug, withCatalogRoute } from "../_shared";

export async function GET(request: Request) {
  return withCatalogRoute(request, "activity-catalog-filters", async (getProvider) => {
    const { searchParams, locale } = parseCatalogOptions(request, ["sport", "locale"]);
    const rawSport = searchParams.get("sport")?.trim();
    const sport = rawSport ? validateCatalogSlug(rawSport) : undefined;
    return catalogResponse(await getProvider().getFilters({ ...(sport ? { sport } : {}), ...(locale ? { locale } : {}) }));
  });
}
