# PCS-3C.2 Production request closure

**Status:** Approved Production evidence; PCS-3 closed
**Measured deployment:** `4dfbacdf7cb6d45c1f81bcc442f10d18ba992c0b`
**Measured at:** `2026-08-05T00:26:44.334Z`

## Authority and identity

| Field | Verified value |
|---|---|
| Production deployment | `dpl_B9T13xNpSwcR4orPC1yEGtDHqgWQ` |
| deployment state | `READY` |
| build timestamp | `2026-08-05T00:20:09.162Z` |
| canonical measurement run | `30963068373` |
| artifact ID | `8913733622` |
| artifact ZIP SHA-256 | `c2061d5d89400b05cb7af719a1046a544bf676744cd243af9737092f401ebe8a` |
| `summary.json` SHA-256 | `f6c225a0bbe2d3a0be6f22e6c2d179b3e1de381dc9c4fbb2e90e647dd3649616` |
| `summary.md` SHA-256 | `abd63bac1a6bb68f4db445f1637ced66ff0e2a63ee9733993fbba0538e7ff501` |
| populated samples SHA-256 | `65ad7b62b2a041f34aad4ca1db1aab3e01695001d4ad600c15faa3183fc99d6b` |
| empty samples SHA-256 | `ffe462d3d1320ae64422d9b45f3d72daf91ad1537072d6fff80ff79209866d52` |
| accounts | approved populated and empty synthetic fixtures |
| warmups per account | `2` |
| measured samples per account and route | `20` |
| overall result | `PASS` |
| Vercel runtime-error entries during closure verification | `0` |
| credentials or private browser state persisted | `false` |

The exact deployed-identity gate confirmed the commit, migration marker `20260724232734`, artifact identity, release readiness, schema compatibility, and zero pending, untracked, or unresolved migrations.

## Measured results

| Account | Route | Browser p50 / p95 | Server total p50 / p95 | Request invariant |
|---|---|---:|---:|---|
| populated | Today | `323.8 / 389.6 ms` | `115.2 / 184 ms` | one projection, zero direct Supabase reads |
| empty | Today | `303.1 / 365.8 ms` | `93.8 / 123.7 ms` | one projection, zero direct Supabase reads |
| populated | Workout History | `265.7 / 532.8 ms` | `117.9 / 385.9 ms` | one first page, zero initial cursor requests |
| empty | Workout History | `319.2 / 391.5 ms` | `161.9 / 231.8 ms` | one first page, zero initial cursor requests |
| combined | Today | `314.5 / 388.1 ms` | `111.5 / 147.6 ms` | all `40` measured operations passed |
| combined | Workout History | `284 / 448.6 ms` | `125.4 / 303.3 ms` | all `40` measured operations passed |

All `80` measured API responses returned HTTP `200`. Page errors, console errors, request failures, HTTP 5xx responses, and error boundaries were zero. No Vercel runtime-error entries were observed during the closure verification window. Privacy, correlation, no-sniff, cache, authorization-vary, and Today contract header gates passed.

Today produced exactly one projection request and zero direct browser-to-Supabase data reads per measured operation. Workout History produced exactly one initial first-page request and zero initial cursor requests per measured operation.

Decoded response bytes were measured independently from `Content-Length`; the latter was unavailable and recorded as `null`. Fixture-dependent selected-only and load-more interactions were recorded as `not_applicable` rather than claimed as proof.

## Evidence safety

The artifact contains sanitized JSON and Markdown only. It persists no credentials, access tokens, cookies, browser storage, storage state, raw payloads, page text, query values, user IDs, opaque IDs, request IDs, screenshots, HAR files, traces, or videos.

## Hosting correction

PCS-3C.1 was merged through PR #127 as `63ca8ec2bf8e430b7e8ca87befccb6ff2a093b5c`. Its first Production attempt proved that Vercel did not expose the standard `Server-Timing` header to the browser.

The bounded correction was independently validated and squash-merged through PR #128 as the measured deployment. It retained `Server-Timing`, emitted the same sanitized values through first-party `X-Plaivra-Server-Timing`, and made the harness prefer the first-party header with standard-header fallback. It changed no data, request counts, readers, mutations, UI, authentication, or latency behavior.

## Closure verdict

The figures above are a timestamped baseline for the reviewed Production deployment and approved synthetic fixtures. They are not a general user-latency SLA and do not establish final launch budgets.

PCS-3 is merged, deployed, Production-measured, reconciled, and closed. PCS-4 CI Operating Model is the next authorized phase.
