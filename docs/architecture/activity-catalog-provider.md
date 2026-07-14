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

## Compatibility filtering and pagination

A compatibility filter is sent upstream only when the selected legacy group has exactly one representable value. Multi-select groups retain OR semantics by omitting the lossy upstream filter and applying the complete group locally.

Compatibility-filtered logical pages are calculated from a deterministic scan beginning at upstream offset zero. The scan is bounded to three upstream pages of at most 100 records each. Discovered matches are deduplicated by activity ID, sliced into stable logical pages, and returned with explicit `hasMore` and `bounded` state. The Exercise Library consumes that state directly rather than inferring continuation from result length. If the bound is reached while the upstream catalog can continue, Plaivra reports a partial bounded result and does not claim completeness.

Requests that do not need compatibility scanning continue to use normal external offsets and pagination.

## Legacy media compatibility

Legacy exercise guide and video URLs are preserved through a typed internal-only `legacyMediaCompatibility` field. The field is populated only by the legacy provider and is rejected by the external runtime parser.

```text
external activity
-> external catalog content
-> optional Plaivra user custom video only
```

```text
legacy activity
-> preserved legacy guide/video
-> optional Plaivra user custom-video override
```

Legacy records are deduplicated by stable legacy identity, not by name similarity. A legacy guide or video is therefore never attached to an external activity because names happen to match. External activities receive no invented default media.

## Canonical English and localization boundary

Phase 0B requests canonical English catalog content for stable current persistence. The canonical English activity name is stored in current Workout and plan snapshots; a localized display name is not used as changing identity.

The complete catalog `translations` map survives runtime parsing for future presentation work. The Phase 0B rendered matrix exercises English, German, and Arabic Plaivra interface shells and Arabic RTL with deterministic catalog fixtures. It verifies catalog transport and response shape, but it does **not** claim live German or Arabic catalog-content delivery.

No catalog translation population or database migration is part of Phase 0B.

## Compatibility period

The current UI consumes the legacy `Workout` shape through one canonical activity adapter. Existing plan snapshots and text-compatible source IDs remain unchanged. User favorites and custom video overrides continue to reference activity IDs in Plaivra. Standalone sessions do not write external catalog UUIDs into the legacy `workouts` foreign key.

The legacy provider may be removed only after stored legacy identifiers no longer require it, all current consumers use canonical contracts, the external catalog has verified parity for required content and filters, and a separately approved removal proves rollback and historical-plan compatibility.

## Future catalog rule

The later Food Library must use a separate Food Catalog database/API and a separate `FoodCatalogProvider`. It must not share Activity Catalog data or endpoints. Shared transport, validation, and stable-error conventions may be reused. Phase 0B implements no Food Catalog code.
