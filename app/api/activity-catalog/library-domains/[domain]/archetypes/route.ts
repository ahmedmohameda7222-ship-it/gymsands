import { LIBRARY_SLUG, libraryJson, parseLocale, rejectUnknown, withLibraryRoute } from "../../../_library-shared";

export async function GET(request: Request, { params }: { params: Promise<{ domain: string }> }) {
  const { domain } = await params;
  if (!LIBRARY_SLUG.test(domain)) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const url = new URL(request.url);
  if (rejectUnknown(url, ["locale"])) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  if (!locale) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  return withLibraryRoute(request, "library_domain_archetypes", async (provider) => {
    const result = await provider.getArchetypes(domain, { locale });
    return { body: { data: result.data, meta: result.meta }, meta: result.meta, count: result.data.length };
  });
}
