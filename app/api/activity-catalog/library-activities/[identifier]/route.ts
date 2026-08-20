import { libraryJson, parseLocale, rejectUnknown, validIdentifier, withLibraryRoute } from "../../_library-shared";

export async function GET(request: Request, { params }: { params: Promise<{ identifier: string }> }) {
  const { identifier } = await params;
  if (!validIdentifier(identifier)) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const url = new URL(request.url);
  if (rejectUnknown(url, ["locale"])) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  const locale = parseLocale(url);
  if (!locale) return libraryJson({ error: "The catalog request is invalid.", code: "catalog_bad_request" }, 400);
  return withLibraryRoute(request, "library_activity_detail", async (provider) => {
    const result = await provider.getActivityByIdentifier(identifier, { locale });
    return { body: { data: result.data, meta: result.meta }, meta: result.meta };
  });
}
