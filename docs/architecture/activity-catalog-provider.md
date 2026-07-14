# Activity Catalog provider boundary

**Status:** Phase 0B architecture  
**Authority:** Subordinate to the Plaivra Product Constitution and canonical domain model

## Responsibility flow

```text
External Activity Catalog
-> Plaivra server-only ActivityCatalogProvider
-> explicit authenticated Plaivra internal API routes
-> Plaivra web client compatibility service
-> current Train surfaces
-> later iOS, Android, and ChatGPT consumers using the same domain contracts
```

The external Activity Catalog owns published global training activities and their taxonomy. Plaivra owns member authentication, plans, sessions, history, favorites, custom exercises, custom video URLs, notes, records, and every other user-specific value. Plaivra never sends profile, health, plan, history, note, constraint, or member identity data to the catalog.

## Provider modes

- `legacy` reads only Plaivra's compatibility global sources and local fallback.
- `external` reads only the external provider and returns controlled errors when it is unavailable.
- `external_with_legacy_fallback` uses the external provider first. It falls back only for network failures, timeouts, rate limiting, upstream 5xx responses, or a legacy identifier that genuinely returns external 404. It does not fallback for invalid requests or upstream 401/403. A successful empty external response remains empty.

Fallback responses identify `legacy` as the source and set degraded metadata. Provider selection and fallback are server-only.

## Secrets and transport

The browser calls only the explicit `/api/activity-catalog/...` routes with the existing Plaivra access token. The Plaivra route authenticates and checks the member account, then creates an upstream request containing only an allowlisted catalog path, allowlisted query parameters, `Accept`, and the server catalog bearer credential. The Plaivra access token and member data are never forwarded.

`PLAIVRA_ACTIVITY_CATALOG_API_KEY` is server-only. `PLAIVRA_ACTIVITY_CATALOG_MODE` and `PLAIVRA_ACTIVITY_CATALOG_BASE_URL` are also read only by server modules. Initial internal responses are `private, no-store`.

After quality-control approval, the owner—not the implementation agent—configures:

```text
PLAIVRA_ACTIVITY_CATALOG_MODE=external_with_legacy_fallback
PLAIVRA_ACTIVITY_CATALOG_BASE_URL=https://plaivra-activity-catalog-api.vercel.app
PLAIVRA_ACTIVITY_CATALOG_API_KEY=<existing server-only catalog key>
```

## Compatibility period

The current UI consumes the legacy `Workout` shape through one canonical activity adapter. Existing plan snapshots and text-compatible source IDs remain unchanged. User favorites and custom video overrides continue to reference activity IDs in Plaivra. Standalone sessions do not write external catalog UUIDs into the legacy `workouts` foreign key.

The legacy provider may be removed only after stored legacy identifiers no longer require it, all current consumers use canonical contracts, the external catalog has verified parity for required content and filters, and a separately approved removal proves rollback and historical-plan compatibility.

## Future catalog rule

The later Food Library must use a separate Food Catalog database/API and a separate `FoodCatalogProvider`. It must not share Activity Catalog data or endpoints. Shared transport, validation, and stable-error conventions may be reused. Phase 0B implements no Food Catalog code.
