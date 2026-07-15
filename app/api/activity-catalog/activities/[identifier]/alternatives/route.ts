import { catalogResponse, parseAlternativeOptions, validateIdentifier, withCatalogRoute } from "../../../_shared";

export async function GET(request: Request, context: { params: Promise<{ identifier: string }> }) {
  return withCatalogRoute(request, "activity-catalog-alternatives", async (getProvider) => {
    const { identifier } = await context.params;
    const validIdentifier = validateIdentifier(identifier);
    const options = parseAlternativeOptions(request);
    return catalogResponse(await getProvider().getActivityAlternatives(validIdentifier, options));
  });
}
