import {
  handleActivityCatalogRoute,
  parseLocaleOptions,
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
      options: parseLocaleOptions(authenticatedRequest)
    }),
    (provider, { identifier, options }) => provider.getActivity(identifier, options)
  );
}
