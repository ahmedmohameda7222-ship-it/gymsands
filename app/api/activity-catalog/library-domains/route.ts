import { libraryJson, parseLocale, rejectUnknown, withLibraryRoute } from "../_library-shared";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const unknown = rejectUnknown(url, ["locale"]);
  if (unknown) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  if (!locale) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  return withLibraryRoute(request, "library_domains", async (provider) => {
    const result = await provider.listDomains({ locale });
    return { body: { data: result.data, meta: result.meta }, meta: result.meta, count: result.data.length };
  });
}
