import {
  handleActivityCatalogRoute,
  parseAlternativesOptions,
  validateActivityIdentifier
} from "@/lib/activity-catalog/route-handler";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ identifier: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return handleActivityCatalogRoute(
    request,
    async (authenticatedRequest) => ({
      identifier: validateActivityIdentifier((await context.params).identifier),
      options: parseAlternativesOptions(authenticatedRequest)
    }),
    (provider, { identifier, options }) => provider.getActivityAlternatives(identifier, options)
  );
}
