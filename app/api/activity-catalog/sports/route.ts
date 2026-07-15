import { catalogResponse, parseCatalogOptions, withCatalogRoute } from "../_shared";

export async function GET(request: Request) {
  return withCatalogRoute(request, "activity-catalog-sports", async (getProvider) => {
    const { locale } = parseCatalogOptions(request, ["locale"]);
    return catalogResponse(await getProvider().listSports({ locale }));
  });
}
