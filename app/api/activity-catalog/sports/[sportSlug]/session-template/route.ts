import { catalogResponse, parseCatalogOptions, validateCatalogSlug, withCatalogRoute } from "../../../_shared";

export async function GET(request: Request, context: { params: Promise<{ sportSlug: string }> }) {
  return withCatalogRoute(request, "activity-catalog-session-template", async (getProvider) => {
    const { sportSlug } = await context.params;
    const { locale } = parseCatalogOptions(request, ["locale"]);
    return catalogResponse(await getProvider().getSportSessionTemplate(validateCatalogSlug(sportSlug), { locale }));
  });
}
