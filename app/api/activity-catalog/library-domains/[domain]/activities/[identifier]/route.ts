import { LIBRARY_SLUG, libraryJson, parseLocale, rejectUnknown, validIdentifier, withLibraryRoute } from "../../../../_library-shared";

export async function GET(request: Request, { params }: { params: Promise<{ domain: string; identifier: string }> }) {
  const { domain, identifier } = await params;
  if (!LIBRARY_SLUG.test(domain) || !validIdentifier(identifier)) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const url = new URL(request.url);
  if (rejectUnknown(url, ["locale"])) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  if (!locale) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  return withLibraryRoute(request, "library_domain_activity", async (provider) => {
    const result = await provider.getActivity(domain, identifier, { locale });
    return { body: { data: result.data, meta: result.meta }, meta: result.meta };
  });
}
