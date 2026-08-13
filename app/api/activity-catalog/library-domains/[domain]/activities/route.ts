import { LIBRARY_SLUG, libraryJson, parseLimit, parseLocale, rejectUnknown, withLibraryRoute } from "../../../_library-shared";
import { LibraryProviderError } from "@/services/activity-catalog/server/library-errors";

const VISIBILITY = new Set(["default", "searchable", "advanced", "hidden"]);

export async function GET(request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  if (!LIBRARY_SLUG.test(domain)) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const url = new URL(request.url);
  if (rejectUnknown(url, ["locale", "query", "visibility", "limit", "cursor"])) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  const limit = parseLimit(url, 50, 30);
  const query = (url.searchParams.get("query") ?? "").trim();
  const visibility = url.searchParams.get("visibility") || undefined;
  const cursor = url.searchParams.get("cursor") || undefined;
  if (!locale || limit === null || query.length > 100 || (visibility && !VISIBILITY.has(visibility)) || (cursor && cursor.length > 2048)) {
    return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  }
  return withLibraryRoute(request, "library_domain_activities", async (provider) => {
    const input = { domain, locale, ...(query ? { query } : {}), ...(visibility ? { visibility: visibility as "default" | "searchable" | "advanced" | "hidden" } : {}), limit, ...(cursor ? { cursor } : {}) };
    let result;
    let restarted = false;
    try {
      result = await provider.searchActivities(input);
    } catch (error) {
      if (!(error instanceof LibraryProviderError) || error.code !== "catalog_incompatible_cursor" || !cursor) throw error;
      result = await provider.searchActivities({ ...input, cursor: undefined });
      restarted = true;
    }
    return {
      body: { data: result.data, pagination: result.pagination, meta: result.meta, restarted },
      meta: result.meta,
      count: result.data.length,
      restarted
    };
  });
}
