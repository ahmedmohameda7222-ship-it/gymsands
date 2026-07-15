import { catalogResponse, parseCatalogOptions, validateIdentifier, withCatalogRoute } from "../../_shared";

export async function GET(request: Request, context: { params: Promise<{ identifier: string }> }) {
  return withCatalogRoute(request, "activity-catalog-activity", async (getProvider) => {
    const { identifier } = await context.params;
    const { locale } = parseCatalogOptions(request, ["locale"]);
    const validIdentifier = validateIdentifier(identifier);
    return catalogResponse(await getProvider().getActivity(validIdentifier, { locale }));
  });
}
