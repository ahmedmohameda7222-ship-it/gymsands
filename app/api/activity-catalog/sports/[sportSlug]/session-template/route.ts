import {
  handleActivityCatalogRoute,
  parseLocaleOptions,
  validateSportSlug
} from "@/lib/activity-catalog/route-handler";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ sportSlug: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleActivityCatalogRoute(
    request,
    async (authenticatedRequest) => ({
      sportSlug: validateSportSlug((await context.params).sportSlug),
      options: parseLocaleOptions(authenticatedRequest)
    }),
    (provider, { sportSlug, options }) => provider.getSportSessionTemplate(sportSlug, options)
  );
}
