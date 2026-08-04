# Bounded authenticated Today projection

**Status:** PCS-3B merged and deployed at `517e37ccd7252e040c652da72e155b3dcb5d5bda`
**Runtime health:** verified
**Production request/latency measurement:** pending PCS-3C.2

## Objective

Replace the browser's broad Today-dashboard query fan-out with one authenticated, minimum-data projection while preserving partial-error semantics, canonical mutation authorities, the existing Today UI, and the Quick ChatGPT context contract.

## Deployed contract

```text
GET /api/dashboard/today?date=YYYY-MM-DD&timezone=<IANA timezone>
```

The route derives the user identity from the authenticated session. It does not accept a caller-supplied user ID as read authority.

The version-1 response contains only fields required by Today rendering, current Today interactions, and the existing Quick ChatGPT dashboard context:

- requested date, timezone, contract version, and generation time;
- bounded workout state, action route, counts, and at most three preview exercises;
- minimum meal-plan item fields for the requested date;
- aggregated nutrition totals and food-log count;
- resolved minimum nutrition targets;
- aggregated hydration total and count;
- current-week minimum grocery fields;
- habit and supplement counts with at most two open names;
- minimum sleep/recovery summary;
- profile-context booleans and progress-entry count;
- a dedicated prompt-context summary equivalent to current visible Today semantics.

It does not return email, owner ID, onboarding answers, injury or restriction text, private notes, full plans, raw history, raw food/water logs, provider metadata, access tokens, credentials, or database errors.

## Authentication and privacy

- `requireUser(request)` is the authentication and account-access authority.
- Domain reads use the returned authenticated RLS-bound Supabase client.
- No service role is used.
- Account-access denial occurs before domain readers.
- The access token is sent only in the browser Authorization header and is excluded from URLs, request keys, responses, logs, caches, localStorage, and telemetry.
- Responses use `Cache-Control: private, no-store, max-age=0` and `Vary: Authorization`.
- Safe correlation and bounded `Server-Timing` expose only approved metric names and durations.

## Partial-error semantics

Each optional domain uses a typed loaded or failed envelope. One optional-domain failure does not reject the entire projection. Habits, supplements, and sleep may fail independently; wellness is top-level failed only when all three fail. Even all optional-domain failures may return authenticated HTTP 200. Raw database errors are never returned.

## Query architecture

The deployed implementation uses separate, independently testable server readers instead of a giant cross-domain SQL function. Readers:

- use explicit selected columns;
- use owner/date/week/status/ID bounds or hard limits;
- aggregate food and water rows on the server;
- batch exercises by plan-day identity;
- perform no per-item follow-up query;
- call no external provider;
- perform no write;
- do not resolve another session;
- keep operation count constant with collection cardinality.

The browser sees one request. Fixed populated, empty, partial-failure, and high-cardinality operation counts are retained in automated tests. Those counts prove bounded no-N+1 behavior; they are not Production latency claims.

## Browser request authority

One canonical key owns the Today projection:

```text
userId + date + timezone
```

The AuthProvider access token is intentionally excluded. Same-key work shares one in-flight request. Token refresh alone does not reload; the next genuine refresh uses the latest token. Date, timezone, or owner changes abort or supersede old work, immediately hide old data, and reject stale publication. Retry is coordinated through the same authority and preserves usable content.

The old direct browser read fan-out is removed. There is no feature flag, shadow comparison, dual loading, unused rollback reader, persistent Today cache, or localStorage projection persistence.

## Mutations and Quick ChatGPT

Existing domain mutation semantics remain canonical. Minimum Today adapters operate on authenticated owner context plus item IDs. Normal authoritative meal and grocery results update the local projection without a read reload; uncertain nutrition consistency causes one coordinated projection refresh and never a direct food-log read.

The projection's prompt summary only reconstructs data already visible on Today. Local route, hour, and display units are added from existing providers. Structural-equivalence suppression remains active. The projection grants no additional ChatGPT permission.

## Verified runtime health

At the PCS-3B Production baseline:

- deployment state was READY;
- `/api/version` returned HTTP 200;
- the unauthenticated Today route returned safe HTTP 401;
- contract, private/no-store, authorization-variance, nosniff, and correlation headers were present;
- no immediate runtime-error cluster was observed.

These facts verify immediate deployment health only.

## Production evidence boundary

PCS-3C.1 adds the durable read-only synthetic measurement harness. It does not run the Production measurement and records no request-count, response-size, or p50/p95 result.

PCS-3C.2 remains responsible for reviewed Production request counts, decoded bytes and Content-Length where available, browser-observed duration p50/p95, safe server-duration p50/p95, browser-visible failures, and interaction evidence. No Production performance improvement or launch budget is claimed before that reconciliation.
