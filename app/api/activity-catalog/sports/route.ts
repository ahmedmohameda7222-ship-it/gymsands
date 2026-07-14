import {
  handleActivityCatalogRoute,
  parseLocaleOptions
} from "@/lib/activity-catalog/route-handler";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleActivityCatalogRoute(
    request,
    parseLocaleOptions,
    (provider, options) => provider.listSports(options)
  );
}
