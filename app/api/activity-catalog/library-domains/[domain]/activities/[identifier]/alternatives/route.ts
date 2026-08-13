import { LIBRARY_SLUG, libraryJson, parseLimit, parseLocale, rejectUnknown, validIdentifier, withLibraryRoute } from "../../../../../_library-shared";

export async function GET(request: Request, { params }: { params: Promise<{ domain: string; identifier: string }> }) {
  const { domain, identifier } = await params;
  if (!LIBRARY_SLUG.test(domain) || !validIdentifier(identifier)) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const url = new URL(request.url);
  if (rejectUnknown(url, ["locale", "limit"])) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  const limit = parseLimit(url, 10, 6);
  if (!locale || limit === null) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  return withLibraryRoute(request, "library_domain_activity_alternatives", async (provider) => {
    const result = await provider.getActivityAlternatives(domain, identifier, { locale, limit });
    return { body: { data: result.data, meta: result.meta }, meta: result.meta, count: result.data.length };
  });
}
